import { base64UrlEncode, base64UrlToBytes } from "../../shared/encoding";
import type { PushSender } from "../../notifications/push-sender";
import type { PushSendResult, PushSubscriptionRecord } from "../../notifications/types";

type WebPushConfig = {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
};

export function createWebPushSender(config: WebPushConfig): PushSender {
  return {
    async send(subscription: PushSubscriptionRecord): Promise<PushSendResult> {
      if (!config.publicKey || !config.privateKey || !config.subject) {
        return pushSendError("web_push_not_configured", true, false);
      }

      try {
        const jwt = await createVapidJwt({
          endpoint: subscription.endpoint,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
          subject: config.subject,
        });

        const response = await fetch(subscription.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
            TTL: "60",
          },
        });

        if (response.ok) {
          return { ok: true };
        }

        if (response.status === 404 || response.status === 410) {
          return pushSendError(`push_endpoint_${response.status}`, false, true);
        }

        return pushSendError(`push_endpoint_${response.status}`, true, false);
      } catch (error) {
        return pushSendError(error instanceof Error ? error.message : "push_send_failed", true, false);
      }
    },
  };
}

async function createVapidJwt(input: {
  endpoint: string;
  publicKey: string;
  privateKey: string;
  subject: string;
}): Promise<string> {
  const publicKeyBytes = base64UrlToBytes(input.publicKey);
  const privateKeyBytes = base64UrlToBytes(input.privateKey);
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4) {
    throw new Error("invalid_vapid_public_key");
  }
  if (privateKeyBytes.length !== 32) {
    throw new Error("invalid_vapid_private_key");
  }

  const publicKey = {
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(privateKeyBytes),
      x: publicKey.x,
      y: publicKey.y,
      ext: true,
    },
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"],
  );

  const aud = new URL(input.endpoint).origin;
  const header = base64UrlEncode(utf8Bytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64UrlEncode(
    utf8Bytes(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: input.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    key,
    utf8Bytes(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function pushSendError(error: string, retryable: boolean, revokeSubscription: boolean): PushSendResult {
  return {
    ok: false,
    retryable,
    revokeSubscription,
    error,
  };
}
