import { Hono } from "hono";
import { registerAuthRoutes } from "../auth/routes";
import { corsPreflightResponse, withCors } from "../shared/cors";
import { isHttpError, jsonError } from "../shared/errors";
import { registerNotificationRoutes } from "../notifications/routes";
import { tasksRoutes } from "../tasks/routes";
import type { AppHonoContext } from "./context";
import type { Env } from "./env";

const app = new Hono<AppHonoContext>();

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return corsPreflightResponse(c.req.raw);
  }

  await next();

  c.res = withCors(c.req.raw, c.res);
});

app.onError((error, c) => {
  if (isHttpError(error)) {
    return withCors(c.req.raw, jsonError(error.code, error.message, error.status));
  }

  console.error(error);
  return withCors(c.req.raw, jsonError("internal_error", "Internal server error", 500));
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "kajibun-api",
  }),
);
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "kajibun-api",
  }),
);

registerAuthRoutes(app);
registerAuthRoutes(app, "/api");

registerNotificationRoutes(app);
registerNotificationRoutes(app, "/api");

app.route("/tasks", tasksRoutes);
app.route("/api/tasks", tasksRoutes);

app.get("/api", (c) => defaultApiResponse(c.env));
app.all("/api/*", (c) => defaultApiResponse(c.env));

app.notFound((c) => {
  if (isApiPath(new URL(c.req.url).pathname)) {
    return defaultApiResponse(c.env);
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  return app.fetch(request, env);
}

function defaultApiResponse(env: Env): Response {
  return Response.json({
    name: "kajibun-api",
    status: "ok",
    hasDatabaseBinding: Boolean(env.DB),
    auth: {
      loginUrl: "/api/auth/login",
      currentUserUrl: "/api/me",
    },
  });
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/health" ||
    pathname === "/me" ||
    pathname === "/tasks" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/users/") ||
    pathname.startsWith("/notifications/") ||
    pathname.startsWith("/push/") ||
    pathname === "/push-subscriptions" ||
    pathname.startsWith("/tasks/")
  );
}
