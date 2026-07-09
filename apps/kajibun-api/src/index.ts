import type { Env } from "./app/env";
import { handleRequest } from "./app/router";
import { handleScheduled } from "./app/scheduled";
import { corsPreflightResponse, withCors } from "./shared/cors";
import { isHttpError, jsonError } from "./shared/errors";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return corsPreflightResponse(request);
    }

    try {
      return withCors(request, await handleRequest(request, env));
    } catch (error) {
      if (isHttpError(error)) {
        return withCors(request, jsonError(error.code, error.message, error.status));
      }

      console.error(error);
      return withCors(request, jsonError("internal_error", "Internal server error", 500));
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
};
