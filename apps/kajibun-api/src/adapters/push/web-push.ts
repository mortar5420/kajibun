import { base64UrlEncode, base64UrlToBytes } from "../../shared/encoding";
import type { PushSender } from "../../notifications/push-sender";
import type { NotificationPayload, PushSendResult, PushSubscriptionRecord } from "../../notifications/types";

type WebPushConfig = {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
};

export function createWebPushSender(config: WebPushConfig): PushSender {
  return {
    async send(subscription: PushSubscriptionRecord, payload: NotificationPayload): Promise<PushSendResult> {
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
        const encryptedPayload = await encryptWebPushPayload(subscription, payload);

        const response = await fetch(subscription.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "60",
          },
          body: encryptedPayload,
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

async function encryptWebPushPayload(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
): Promise<Uint8Array> {
  const userAgentPublicKeyBytes = base64UrlToBytes(subscription.p256dh);
  const authSecretBytes = base64UrlToBytes(subscription.auth);
  if (userAgentPublicKeyBytes.length !== 65 || userAgentPublicKeyBytes[0] !== 4) {
    throw new Error("invalid_subscription_public_key");
  }
  if (authSecretBytes.length !== 16) {
    throw new Error("invalid_subscription_auth_secret");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const applicationServerKeys = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );
  const applicationServerPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", applicationServerKeys.publicKey),
  );
  const userAgentPublicKey = await importP256PublicKey(userAgentPublicKeyBytes);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: userAgentPublicKey,
      },
      applicationServerKeys.privateKey,
      256,
    ),
  );

  const keyInfo = concatBytes(
    utf8Bytes("WebPush: info"),
    new Uint8Array([0]),
    userAgentPublicKeyBytes,
    applicationServerPublicKeyBytes,
  );
  const ikm = await hmacSha256(await hmacSha256(authSecretBytes, sharedSecret), concatBytes(keyInfo, new Uint8Array([1])));
  const prk = await hmacSha256(salt, ikm);
  const contentEncryptionKey = (await hmacSha256(prk, utf8Bytes("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmacSha256(prk, utf8Bytes("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt"],
  );
  const plaintext = concatBytes(utf8Bytes(JSON.stringify(payload)), new Uint8Array([2]));
  const recordSize = 4096;
  if (plaintext.length + 16 >= recordSize) {
    throw new Error("web_push_payload_too_large");
  }

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        tagLength: 128,
      },
      aesKey,
      plaintext,
    ),
  );
  const header = new Uint8Array(21 + applicationServerPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = applicationServerPublicKeyBytes.length;
  header.set(applicationServerPublicKeyBytes, 21);

  return concatBytes(header, ciphertext);
}

async function importP256PublicKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );
}

async function hmacSha256(keyBytes: Uint8Array, value: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, value));
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

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function pushSendError(error: string, retryable: boolean, revokeSubscription: boolean): PushSendResult {
  return {
    ok: false,
    retryable,
    revokeSubscription,
    error,
  };
}
