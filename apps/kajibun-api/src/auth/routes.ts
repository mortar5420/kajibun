import type { Env } from "../app/env";
import { createD1Client } from "../adapters/persistence/d1";
import { clearCookie, parseCookies, serializeCookie, shouldUseSecureCookie } from "../shared/cookies";
import { randomToken, timingSafeEqualString } from "../shared/crypto";
import { isAllowedUiOrigin } from "../shared/cors";
import { jsonError } from "../shared/errors";
import { GOOGLE_AUTH_URL, exchangeCodeForToken, verifyGoogleIdToken } from "./google-oidc";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSignedSessionCookie } from "./session";
import { upsertUser } from "./repository";
import { getCurrentUserOrResponse } from "./http";
import { getOidcConfig } from "./service";
import type { SessionPayload } from "./types";

const STATE_COOKIE = "kajibun_oauth_state";
const NONCE_COOKIE = "kajibun_oauth_nonce";
const RETURN_TO_COOKIE = "kajibun_return_to";
const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

export function isLoginPath(pathname: string): boolean {
  return pathname === "/auth/login" || pathname === "/auth/google/login";
}

export function isCallbackPath(pathname: string): boolean {
  return pathname === "/auth/callback" || pathname === "/auth/google/callback";
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const config = getOidcConfig(env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const apiPrefix = getApiPrefix(url.pathname);
  const secureCookie = shouldUseSecureCookie(url);
  const state = randomToken();
  const nonce = randomToken();
  const returnTo = getSafeReturnTo(url.searchParams.get("return_to"), origin);
  const authUrl = new URL(GOOGLE_AUTH_URL);

  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}${apiPrefix}/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    Location: authUrl.toString(),
  });
  headers.append("Set-Cookie", serializeCookie(STATE_COOKIE, state, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  headers.append("Set-Cookie", serializeCookie(NONCE_COOKIE, nonce, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  if (returnTo) {
    headers.append("Set-Cookie", serializeCookie(RETURN_TO_COOKIE, returnTo, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  }

  return new Response(null, {
    status: 302,
    headers,
  });
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const config = getOidcConfig(env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(request.url);
  const apiPrefix = getApiPrefix(url.pathname);
  const secureCookie = shouldUseSecureCookie(url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return jsonError("oauth_error", error, 400);
  }

  if (!code || !state) {
    return jsonError("invalid_callback", "Missing code or state", 400);
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  if (!timingSafeEqualString(state, cookies[STATE_COOKIE] ?? "")) {
    return jsonError("invalid_state", "OAuth state does not match", 400);
  }

  const expectedNonce = cookies[NONCE_COOKIE];
  if (!expectedNonce) {
    return jsonError("missing_nonce", "OAuth nonce cookie is missing", 400);
  }

  const origin = url.origin;
  const tokenResponse = await exchangeCodeForToken({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: `${origin}${apiPrefix}/auth/callback`,
  });
  const claims = await verifyGoogleIdToken(tokenResponse.id_token, config.clientId, expectedNonce);
  const email = claims.email?.toLowerCase();

  if (!email || claims.email_verified !== true) {
    return jsonError("email_not_verified", "Google email is missing or not verified", 403);
  }

  if (!config.allowedEmails.has(email)) {
    return jsonError("forbidden_user", "This Google account is not allowed", 403);
  }

  const db = createD1Client(env.DB);
  await upsertUser(db, claims, email);

  const session: SessionPayload = {
    sub: claims.sub,
    email,
    name: claims.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const sessionCookie = await createSignedSessionCookie(session, config.sessionSecret, secureCookie);
  const returnTo = getSafeReturnTo(cookies[RETURN_TO_COOKIE], origin) ?? "/";
  const headers = new Headers({
    Location: returnTo,
  });
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secureCookie));
  headers.append("Set-Cookie", clearCookie(NONCE_COOKIE, secureCookie));
  headers.append("Set-Cookie", clearCookie(RETURN_TO_COOKIE, secureCookie));

  return new Response(null, {
    status: 302,
    headers,
  });
}

export function handleLogout(request: Request): Response {
  const secureCookie = shouldUseSecureCookie(new URL(request.url));

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearCookie(SESSION_COOKIE, secureCookie),
      },
    },
  );
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUserOrResponse(request, {
    db: createD1Client(env.DB),
    sessionSecret: env.SESSION_SECRET,
  });
  if (user instanceof Response) {
    return user;
  }

  return Response.json({
    user: {
      id: user.id,
      sub: user.googleSub,
      email: user.email,
      name: user.name,
    },
  });
}

function missingOidcConfigResponse(): Response {
  return jsonError(
    "missing_config",
    "GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, SESSION_SECRET, or ALLOWED_GOOGLE_EMAILS is not configured",
    500,
  );
}

function getSafeReturnTo(value: string | null | undefined, defaultOrigin: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const defaultUrl = new URL(defaultOrigin);
    if (url.origin === defaultUrl.origin || isAllowedUiOrigin(url)) {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function getApiPrefix(pathname: string): string {
  return pathname === "/api" || pathname.startsWith("/api/") ? "/api" : "";
}
