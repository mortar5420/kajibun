import type { SqlClient } from "../db/client";
import { parseCookies } from "../shared/cookies";
import { jsonError } from "../shared/errors";
import { getCurrentUser } from "./service";
import { SESSION_COOKIE } from "./session";
import type { CurrentUser } from "./types";

export async function getCurrentUserOrResponse(
  request: Request,
  options: {
    db: SqlClient;
    sessionSecret?: string;
  },
): Promise<CurrentUser | Response> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const result = await getCurrentUser({
    db: options.db,
    sessionSecret: options.sessionSecret,
    sessionCookie: cookies[SESSION_COOKIE],
  });

  if ("error" in result) {
    return jsonError(result.error.code, result.error.message, result.error.status);
  }

  return result.user;
}
