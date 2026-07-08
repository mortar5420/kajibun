import { handleCallback, handleLogin, handleLogout, handleMe, isCallbackPath, isLoginPath } from "../auth/routes";
import {
  handleCompleteTask,
  handleCreateTask,
  handleDeleteTask,
  handleListTasks,
  handleReassignTask,
  handleUpdateTask,
} from "../tasks/routes";
import type { Env } from "./env";

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const apiPath = getApiPath(url.pathname);

  if (!apiPath) {
    return env.ASSETS.fetch(request);
  }

  if (apiPath === "/health") {
    return Response.json({
      ok: true,
      service: "kajibun-api",
    });
  }

  if (request.method === "GET" && isLoginPath(apiPath)) {
    return handleLogin(request, env);
  }

  if (request.method === "GET" && isCallbackPath(apiPath)) {
    return handleCallback(request, env);
  }

  if (request.method === "POST" && apiPath === "/auth/logout") {
    return handleLogout(request);
  }

  if (request.method === "GET" && apiPath === "/me") {
    return handleMe(request, env);
  }

  if (request.method === "GET" && apiPath === "/tasks") {
    return handleListTasks(request, env);
  }

  if (request.method === "POST" && apiPath === "/tasks") {
    return handleCreateTask(request, env);
  }

  const taskMatch = apiPath.match(/^\/tasks\/(\d+)$/);
  if (taskMatch) {
    if (request.method === "PATCH") {
      return handleUpdateTask(request, env, Number(taskMatch[1]));
    }

    if (request.method === "DELETE") {
      return handleDeleteTask(request, env, Number(taskMatch[1]));
    }
  }

  const assigneeMatch = apiPath.match(/^\/tasks\/(\d+)\/assignee$/);
  if (request.method === "PATCH" && assigneeMatch) {
    return handleReassignTask(request, env, Number(assigneeMatch[1]));
  }

  const completeMatch = apiPath.match(/^\/tasks\/(\d+)\/complete$/);
  if (request.method === "PATCH" && completeMatch) {
    return handleCompleteTask(request, env, Number(completeMatch[1]));
  }

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

function getApiPath(pathname: string): string | null {
  if (pathname === "/api") {
    return "/";
  }

  if (pathname.startsWith("/api/")) {
    return pathname.slice("/api".length);
  }

  if (
    pathname === "/health" ||
    pathname === "/me" ||
    pathname === "/tasks" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/tasks/")
  ) {
    return pathname;
  }

  return null;
}
