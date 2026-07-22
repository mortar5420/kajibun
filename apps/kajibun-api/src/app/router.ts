import { Hono } from "hono";
import type { Context, Handler } from "hono";
import {
  handleCallback,
  handleDeleteMeAvatar,
  handleGetUserAvatar,
  handleLogin,
  handleLogout,
  handleMe,
  handleUpdateMe,
  handleUploadMeAvatar,
} from "../auth/routes";
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

register("get", "/health", () =>
  Response.json({
    ok: true,
    service: "kajibun-api",
  }),
);

register("get", "/auth/login", handleLogin);
register("get", "/auth/google/login", handleLogin);
register("get", "/auth/callback", handleCallback);
register("get", "/auth/google/callback", handleCallback);
register("post", "/auth/logout", handleLogout);

register("get", "/me", handleMe);
register("patch", "/me", handleUpdateMe);
register("post", "/me/avatar", handleUploadMeAvatar);
register("delete", "/me/avatar", handleDeleteMeAvatar);

register("get", "/users/:userId/avatar", (request, env, params) =>
  handleGetUserAvatar(request, env, Number(params.userId)),
);

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

type Method = "get" | "post" | "patch" | "delete";

type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>,
) => Response | Promise<Response>;

function register(method: Method, path: string, handler: RouteHandler): void {
  const honoHandler: Handler<AppHonoContext> = (c: Context<AppHonoContext>) => handler(c.req.raw, c.env, c.req.param());

  switch (method) {
    case "get":
      app.get(path, honoHandler);
      app.get(`/api${path}`, honoHandler);
      break;
    case "post":
      app.post(path, honoHandler);
      app.post(`/api${path}`, honoHandler);
      break;
    case "patch":
      app.patch(path, honoHandler);
      app.patch(`/api${path}`, honoHandler);
      break;
    case "delete":
      app.delete(path, honoHandler);
      app.delete(`/api${path}`, honoHandler);
      break;
  }
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
