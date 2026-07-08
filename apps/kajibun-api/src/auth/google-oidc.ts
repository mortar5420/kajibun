import { timingSafeEqualString } from "../shared/crypto";
import { base64UrlToBytes, decodeJson } from "../shared/encoding";
import type { GoogleIdTokenClaims, GoogleJwk } from "./types";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export async function exchangeCodeForToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { id_token?: string; error?: string; error_description?: string };

  if (!response.ok || !json.id_token) {
    throw new Error(`Google token exchange failed: ${json.error_description ?? json.error ?? response.status}`);
  }

  return {
    id_token: json.id_token,
  };
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string,
  expectedNonce: string,
): Promise<GoogleIdTokenClaims> {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid ID token format");
  }

  const header = decodeJson<{ alg: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported ID token header");
  }

  const jwk = await findGoogleJwk(header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!signatureValid) {
    throw new Error("Invalid ID token signature");
  }

  const claims = decodeJson<GoogleIdTokenClaims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("Invalid ID token issuer");
  }

  if (claims.aud !== expectedAudience) {
    throw new Error("Invalid ID token audience");
  }

  if (claims.exp <= now) {
    throw new Error("ID token is expired");
  }

  if (!claims.nonce || !timingSafeEqualString(claims.nonce, expectedNonce)) {
    throw new Error("Invalid ID token nonce");
  }

  return claims;
}

async function findGoogleJwk(kid: string): Promise<JsonWebKey> {
  const response = await fetch(GOOGLE_JWKS_URL);
  const json = (await response.json()) as { keys?: GoogleJwk[] };
  const jwk = json.keys?.find((key) => key.kid === kid);

  if (!jwk) {
    throw new Error("Google JWK not found");
  }

  return jwk;
}
