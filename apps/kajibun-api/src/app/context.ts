import type { Context } from "hono";
import { createD1Client } from "../adapters/persistence/d1";
import { parseCookies } from "../shared/cookies";
import { httpError } from "../shared/errors";
import type { SqlClient } from "../db/client";
import { getCurrentUser } from "../auth/service";
import { SESSION_COOKIE } from "../auth/session";
import type { CurrentUser } from "../auth/types";
import type { Env } from "./env";

export type AppHonoContext = {
  Bindings: Env;
};

export type AppContext = Context<AppHonoContext>;

export function createDb(c: AppContext): SqlClient {
  return createD1Client(c.env.DB);
}

export async function requireCurrentUser(c: AppContext, db: SqlClient): Promise<CurrentUser> {
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  const result = await getCurrentUser({
    db,
    sessionSecret: c.env.SESSION_SECRET,
    sessionCookie: cookies[SESSION_COOKIE],
  });

  if ("error" in result) {
    throw httpError(result.error.code, result.error.message, result.error.status);
  }

  return result.user;
}

export async function readJson<T>(c: AppContext): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw httpError("invalid_json", "Request body must be valid JSON", 400);
  }
}
