import type { Env } from "../app/env";
import { parseCookies } from "../shared/cookies";
import { jsonError } from "../shared/errors";
import { SESSION_COOKIE, verifySignedSessionCookie } from "./session";
import type { CurrentUser, GoogleIdTokenClaims, OidcConfig } from "./types";

export function getOidcConfig(env: Env): OidcConfig | null {
  const allowedEmails = parseAllowedEmails(env.ALLOWED_GOOGLE_EMAILS);

  if (
    !env.GOOGLE_OIDC_CLIENT_ID ||
    !env.GOOGLE_OIDC_CLIENT_SECRET ||
    !env.SESSION_SECRET ||
    allowedEmails.size === 0
  ) {
    return null;
  }

  return {
    clientId: env.GOOGLE_OIDC_CLIENT_ID,
    clientSecret: env.GOOGLE_OIDC_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    allowedEmails,
  };
}

export function missingOidcConfigResponse(): Response {
  return jsonError(
    "missing_config",
    "GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, SESSION_SECRET, or ALLOWED_GOOGLE_EMAILS is not configured",
    500,
  );
}

export async function getCurrentUserOrResponse(request: Request, env: Env): Promise<CurrentUser | Response> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionCookie = cookies[SESSION_COOKIE];
  if (!sessionCookie) {
    return jsonError("unauthorized", "Not logged in", 401);
  }

  if (!env.SESSION_SECRET) {
    return jsonError("missing_config", "SESSION_SECRET is not configured", 500);
  }

  const session = await verifySignedSessionCookie(sessionCookie, env.SESSION_SECRET);
  if (!session) {
    return jsonError("unauthorized", "Invalid session", 401);
  }

  const user = await env.DB.prepare(
    `
    SELECT id, google_sub, email, display_name
    FROM users
    WHERE google_sub = ?
    `,
  )
    .bind(session.sub)
    .first<{ id: number; google_sub: string; email: string; display_name: string | null }>();

  if (!user) {
    return jsonError("unauthorized", "User not found", 401);
  }

  return {
    id: user.id,
    googleSub: user.google_sub,
    email: user.email,
    name: user.display_name ?? undefined,
  };
}

export async function upsertUser(db: D1Database, claims: GoogleIdTokenClaims, email: string): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO users (google_sub, email, display_name, picture_url, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        picture_url = excluded.picture_url,
        updated_at = datetime('now'),
        last_login_at = datetime('now')
      `,
    )
    .bind(claims.sub, email, claims.name ?? null, claims.picture ?? null)
    .run();
}

export function parseAllowedEmails(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
