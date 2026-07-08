import { hmacSha256, timingSafeEqualString } from "../shared/crypto";
import { base64UrlEncode, decodeJson } from "../shared/encoding";
import { serializeCookie } from "../shared/cookies";
import type { SessionPayload } from "./types";

export const SESSION_COOKIE = "kajibun_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function createSignedSessionCookie(
  payload: SessionPayload,
  secret: string,
  secure: boolean,
): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(encodedPayload, secret);

  return serializeCookie(SESSION_COOKIE, `${encodedPayload}.${signature}`, SESSION_MAX_AGE_SECONDS, secure);
}

export async function verifySignedSessionCookie(value: string, secret: string): Promise<SessionPayload | null> {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await hmacSha256(encodedPayload, secret);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return null;
  }

  const payload = decodeJson<SessionPayload>(encodedPayload);
  if (!payload.sub || !payload.email || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
