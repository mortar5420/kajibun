import { afterEach, describe, expect, test } from "bun:test";
import { base64UrlEncode } from "../../shared/encoding";
import { createWebPushSender } from "./web-push";
import type { NotificationPayload, PushSubscriptionRecord } from "../../notifications/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createWebPushSender", () => {
  test("sends encrypted notification payload in the Web Push request body", async () => {
    const userAgentKeys = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveBits"],
    );
    const userAgentPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", userAgentKeys.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const vapidKeys = await createVapidTestKeys();
    const subscription: PushSubscriptionRecord = {
      id: 1,
      userId: 2,
      endpoint: "https://push.example.test/send/abc",
      p256dh: base64UrlEncode(userAgentPublicKey),
      auth: base64UrlEncode(authSecret),
      userAgent: "test",
    };
    const payload: NotificationPayload = {
      title: "「トイレ掃除」が完了しました",
      body: "家事が完了しました。 次回の期限は2026-07-11です。",
      url: "/",
    };
    const captured: {
      body?: Uint8Array;
      headers?: Headers;
    } = {};
    globalThis.fetch = async (_input, init) => {
      if (init?.body instanceof Uint8Array) {
        captured.body = init.body;
      }
      captured.headers = new Headers(init?.headers);
      return new Response(null, { status: 201 });
    };

    const result = await createWebPushSender({
      publicKey: vapidKeys.publicKey,
      privateKey: vapidKeys.privateKey,
      subject: "mailto:test@example.com",
    }).send(subscription, payload);

    expect(result.ok).toBe(true);
    if (!captured.headers || !captured.body) {
      throw new Error("Expected Web Push request to be captured");
    }
    expect(captured.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(captured.body).toBeInstanceOf(Uint8Array);
    const decryptedPayload = await decryptWebPushPayload({
      encryptedBody: captured.body,
      userAgentPrivateKey: userAgentKeys.privateKey,
      userAgentPublicKey,
      authSecret,
    });
    expect(decryptedPayload).toEqual(payload);
  });
});

async function createVapidTestKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keys = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const privateKey = (await crypto.subtle.exportKey("jwk", keys.privateKey)) as JsonWebKey;
  if (!privateKey.d) {
    throw new Error("Failed to export VAPID private key");
  }

  return {
    publicKey: base64UrlEncode(publicKey),
    privateKey: privateKey.d,
  };
}

async function decryptWebPushPayload(input: {
  encryptedBody: Uint8Array;
  userAgentPrivateKey: CryptoKey;
  userAgentPublicKey: Uint8Array;
  authSecret: Uint8Array;
}): Promise<NotificationPayload> {
  const salt = input.encryptedBody.slice(0, 16);
  const keyLength = input.encryptedBody[20];
  if (keyLength !== 65) {
    throw new Error("Unexpected application server key length");
  }
  const applicationServerPublicKeyBytes = input.encryptedBody.slice(21, 21 + keyLength);
  const ciphertext = input.encryptedBody.slice(21 + keyLength);
  const applicationServerPublicKey = await crypto.subtle.importKey(
    "raw",
    applicationServerPublicKeyBytes,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: applicationServerPublicKey,
      },
      input.userAgentPrivateKey,
      256,
    ),
  );
  const keyInfo = concatBytes(
    utf8Bytes("WebPush: info"),
    new Uint8Array([0]),
    input.userAgentPublicKey,
    applicationServerPublicKeyBytes,
  );
  const ikm = await hmacSha256(await hmacSha256(input.authSecret, sharedSecret), concatBytes(keyInfo, new Uint8Array([1])));
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
    ["decrypt"],
  );
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        tagLength: 128,
      },
      aesKey,
      ciphertext,
    ),
  );
  const paddingDelimiter = plaintext[plaintext.length - 1];
  if (paddingDelimiter !== 2) {
    throw new Error("Unexpected Web Push padding delimiter");
  }

  return JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1))) as NotificationPayload;
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
