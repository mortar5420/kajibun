import type { Env } from "../app/env";
import { createD1Client } from "../adapters/persistence/d1";
import { clearCookie, parseCookies, serializeCookie, shouldUseSecureCookie } from "../shared/cookies";
import { randomToken, timingSafeEqualString } from "../shared/crypto";
import { isAllowedUiOrigin } from "../shared/cors";
import { httpError, jsonError, readJsonBody } from "../shared/errors";
import { GOOGLE_AUTH_URL, exchangeCodeForToken, verifyGoogleIdToken } from "./google-oidc";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSignedSessionCookie } from "./session";
import { updateUserProfile, upsertUser } from "./repository";
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
      pictureUrl: user.pictureUrl,
    },
  });
}

export async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const user = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (user instanceof Response) {
    return user;
  }

  const input = parseProfileInput(await readJsonBody<{ name?: unknown; pictureUrl?: unknown }>(request));
  const updatedUser = await updateUserProfile(db, user.id, input);
  if (!updatedUser) {
    throw httpError("user_not_found", "User not found", 404);
  }

  return Response.json({
    user: {
      id: updatedUser.id,
      sub: updatedUser.google_sub,
      email: updatedUser.email,
      name: updatedUser.display_name ?? undefined,
      pictureUrl: updatedUser.picture_url ?? undefined,
    },
  });
}

function parseProfileInput(input: { name?: unknown; pictureUrl?: unknown }): {
  displayName: string | null;
  pictureUrl: string | null;
} {
  if (input.name !== undefined && typeof input.name !== "string") {
    throw httpError("invalid_profile", "name must be a string", 400);
  }
  if (input.pictureUrl !== undefined && typeof input.pictureUrl !== "string") {
    throw httpError("invalid_profile", "pictureUrl must be a string", 400);
  }

  const displayName = input.name?.trim() || null;
  const pictureUrl = input.pictureUrl?.trim() || null;
  if (displayName && displayName.length > 80) {
    throw httpError("invalid_profile", "name must be 80 characters or fewer", 400);
  }
  if (pictureUrl) {
    try {
      const url = new URL(pictureUrl);
      if (url.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw httpError("invalid_profile", "pictureUrl must be an HTTPS URL", 400);
    }
  }

  return {
    displayName,
    pictureUrl,
  };
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
