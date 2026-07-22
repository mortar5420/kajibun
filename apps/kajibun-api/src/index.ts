import type { Env } from "./app/env";
import { handleRequest } from "./app/router";
import { handleScheduled } from "./app/scheduled";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
};
