import type { Env } from "../app/env";
import type { SqlClient } from "../db/client";
import { parseAllowedEmails } from "./policy";
import { findUserByGoogleSub } from "./repository";
import { verifySignedSessionCookie } from "./session";
import type { CurrentUser, OidcConfig } from "./types";

export type AuthError = {
  code: string;
  message: string;
  status: number;
};

export type CurrentUserResult =
  | {
      user: CurrentUser;
    }
  | {
      error: AuthError;
    };

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

export async function getCurrentUser(
  options: {
    db: SqlClient;
    sessionSecret?: string;
    sessionCookie?: string;
  },
): Promise<CurrentUserResult> {
  if (!options.sessionCookie) {
    return {
      error: {
        code: "unauthorized",
        message: "Not logged in",
        status: 401,
      },
    };
  }

  if (!options.sessionSecret) {
    return {
      error: {
        code: "missing_config",
        message: "SESSION_SECRET is not configured",
        status: 500,
      },
    };
  }

  const session = await verifySignedSessionCookie(options.sessionCookie, options.sessionSecret);
  if (!session) {
    return {
      error: {
        code: "unauthorized",
        message: "Invalid session",
        status: 401,
      },
    };
  }

  const user = await findUserByGoogleSub(options.db, session.sub);
  if (!user) {
    return {
      error: {
        code: "unauthorized",
        message: "User not found",
        status: 401,
      },
    };
  }

  return {
    user: {
      id: user.id,
      googleSub: user.google_sub,
      email: user.email,
      name: user.display_name ?? undefined,
    },
  };
}

export { parseAllowedEmails };
