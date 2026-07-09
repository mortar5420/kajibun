import type { Env } from "../app/env";
import type { SqlClient } from "../db/client";
import { parseCookies } from "../shared/cookies";
import { jsonError } from "../shared/errors";
import { findUserByGoogleSub } from "./repository";
import { SESSION_COOKIE, verifySignedSessionCookie } from "./session";
import type { CurrentUser, OidcConfig } from "./types";

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

export async function getCurrentUserOrResponse(
  request: Request,
  options: {
    db: SqlClient;
    sessionSecret?: string;
  },
): Promise<CurrentUser | Response> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionCookie = cookies[SESSION_COOKIE];
  if (!sessionCookie) {
    return jsonError("unauthorized", "Not logged in", 401);
  }

  if (!options.sessionSecret) {
    return jsonError("missing_config", "SESSION_SECRET is not configured", 500);
  }

  const session = await verifySignedSessionCookie(sessionCookie, options.sessionSecret);
  if (!session) {
    return jsonError("unauthorized", "Invalid session", 401);
  }

  const user = await findUserByGoogleSub(options.db, session.sub);
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

export function parseAllowedEmails(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
