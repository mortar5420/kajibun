import type { Hono } from "hono";
import { createR2ObjectStorage } from "../adapters/storage/r2";
import { createDb, readJson, requireCurrentUser } from "../app/context";
import type { AppContext, AppHonoContext } from "../app/context";
import { clearCookie, parseCookies, serializeCookie, shouldUseSecureCookie } from "../shared/cookies";
import { randomToken, timingSafeEqualString } from "../shared/crypto";
import { isAllowedUiOrigin } from "../shared/cors";
import { httpError, jsonError } from "../shared/errors";
import { avatarResponse, getUserPictureUrl, parseAvatarUpload, storeAvatar } from "./avatar";
import { GOOGLE_AUTH_URL, exchangeCodeForToken, verifyGoogleIdToken } from "./google-oidc";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSignedSessionCookie } from "./session";
import { clearUserAvatar, findUserById, updateUserAvatar, updateUserProfile, upsertUser } from "./repository";
import type { UserRecord } from "./repository";
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

export function registerAuthRoutes(app: Hono<AppHonoContext>, prefix = ""): void {
  app.get(`${prefix}/auth/login`, handleLogin);
  app.get(`${prefix}/auth/google/login`, handleLogin);
  app.get(`${prefix}/auth/callback`, handleCallback);
  app.get(`${prefix}/auth/google/callback`, handleCallback);
  app.post(`${prefix}/auth/logout`, handleLogout);

  app.get(`${prefix}/me`, handleMe);
  app.patch(`${prefix}/me`, handleUpdateMe);
  app.post(`${prefix}/me/avatar`, handleUploadMeAvatar);
  app.delete(`${prefix}/me/avatar`, handleDeleteMeAvatar);

  app.get(`${prefix}/users/:userId/avatar`, handleGetUserAvatar);
}

async function handleLogin(c: AppContext): Promise<Response> {
  const config = getOidcConfig(c.env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(c.req.url);
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

async function handleCallback(c: AppContext): Promise<Response> {
  const config = getOidcConfig(c.env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(c.req.url);
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

  const cookies = parseCookies(c.req.header("Cookie") ?? null);
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

  const db = createDb(c);
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

function handleLogout(c: AppContext): Response {
  const secureCookie = shouldUseSecureCookie(new URL(c.req.url));

  return c.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearCookie(SESSION_COOKIE, secureCookie),
      },
    },
  );
}

async function handleMe(c: AppContext): Promise<Response> {
  const db = createDb(c);
  const user = await requireCurrentUser(c, db);

  return c.json({
    user: {
      id: user.id,
      sub: user.googleSub,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
    },
  });
}

async function handleUpdateMe(c: AppContext): Promise<Response> {
  const db = createDb(c);
  const user = await requireCurrentUser(c, db);

  const input = parseProfileInput(await readJson<{ name?: unknown }>(c));
  const updatedUser = await updateUserProfile(db, user.id, input);
  if (!updatedUser) {
    throw httpError("user_not_found", "User not found", 404);
  }

  return c.json({
    user: toUserResponse(updatedUser),
  });
}

async function handleUploadMeAvatar(c: AppContext): Promise<Response> {
  const db = createDb(c);
  const actor = await requireCurrentUser(c, db);

  const currentUser = await findUserById(db, actor.id);
  if (!currentUser) {
    throw httpError("user_not_found", "User not found", 404);
  }

  const upload = await parseAvatarUpload(await c.req.formData(), actor);
  const storage = createR2ObjectStorage(c.env.AVATARS);
  await storeAvatar(storage, upload);

  const updatedUser = await updateUserAvatar(db, actor.id, {
    objectKey: upload.objectKey,
    contentType: upload.contentType,
  });
  if (!updatedUser) {
    await storage.delete(upload.objectKey);
    throw httpError("user_not_found", "User not found", 404);
  }
  if (currentUser.avatar_object_key && currentUser.avatar_object_key !== upload.objectKey) {
    await storage.delete(currentUser.avatar_object_key);
  }

  return c.json({
    user: toUserResponse(updatedUser),
  });
}

async function handleDeleteMeAvatar(c: AppContext): Promise<Response> {
  const db = createDb(c);
  const actor = await requireCurrentUser(c, db);

  const currentUser = await findUserById(db, actor.id);
  if (!currentUser) {
    throw httpError("user_not_found", "User not found", 404);
  }

  const updatedUser = await clearUserAvatar(db, actor.id);
  if (currentUser.avatar_object_key) {
    await createR2ObjectStorage(c.env.AVATARS).delete(currentUser.avatar_object_key);
  }

  return c.json({
    user: updatedUser ? toUserResponse(updatedUser) : null,
  });
}

async function handleGetUserAvatar(c: AppContext): Promise<Response> {
  const db = createDb(c);
  await requireCurrentUser(c, db);

  const userId = Number(c.req.param("userId"));
  const user = await findUserById(db, userId);
  if (!user) {
    throw httpError("user_not_found", "User not found", 404);
  }

  return avatarResponse(createR2ObjectStorage(c.env.AVATARS), user);
}

function parseProfileInput(input: { name?: unknown }): {
  displayName: string | null;
} {
  if (input.name !== undefined && typeof input.name !== "string") {
    throw httpError("invalid_profile", "name must be a string", 400);
  }

  const displayName = input.name?.trim() || null;
  if (displayName && displayName.length > 80) {
    throw httpError("invalid_profile", "name must be 80 characters or fewer", 400);
  }

  return {
    displayName,
  };
}

function toUserResponse(user: UserRecord): {
  id: number;
  sub: string;
  email: string;
  name: string | undefined;
  pictureUrl: string | undefined;
} {
  return {
    id: user.id,
    sub: user.google_sub,
    email: user.email,
    name: user.display_name ?? undefined,
    pictureUrl: getUserPictureUrl(user),
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
