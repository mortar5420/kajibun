interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GOOGLE_OIDC_CLIENT_ID?: string;
  GOOGLE_OIDC_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_GOOGLE_EMAILS?: string;
}

type GoogleIdTokenClaims = {
  iss: string;
  aud: string;
  exp: number;
  nonce?: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type GoogleJwk = JsonWebKey & {
  kid?: string;
};

type SessionPayload = {
  sub: string;
  email: string;
  name?: string;
  exp: number;
};

type CurrentUser = {
  id: number;
  googleSub: string;
  email: string;
  name?: string;
};

type TaskStatus = "todo" | "done";

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  interval_days: number;
  assignee_user_id: number | null;
  assignee_email: string | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
};

type TaskInput = {
  title?: unknown;
  description?: unknown;
  dueDate?: unknown;
  intervalDays?: unknown;
};

type HttpErrorLike = {
  code: string;
  message: string;
  status: number;
};

function httpError(code: string, message: string, status: number): HttpErrorLike {
  return { code, message, status };
}

function isHttpError(error: unknown): error is HttpErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "status" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { status: unknown }).status === "number" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const STATE_COOKIE = "kajibun_oauth_state";
const NONCE_COOKIE = "kajibun_oauth_nonce";
const RETURN_TO_COOKIE = "kajibun_return_to";
const SESSION_COOKIE = "kajibun_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;
const APP_TIME_ZONE = "Asia/Tokyo";

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
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
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

function isLoginPath(pathname: string): boolean {
  return pathname === "/auth/login" || pathname === "/auth/google/login";
}

function isCallbackPath(pathname: string): boolean {
  return pathname === "/auth/callback" || pathname === "/auth/google/callback";
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const config = getOidcConfig(env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const apiPrefix = getApiPrefix(url.pathname);
  const secureCookie = shouldUseSecureCookie(url);
  const state = randomToken();
  const nonce = randomToken();
  const returnTo = getSafeReturnTo(url.searchParams.get("return_to"), origin);
  const authUrl = new URL(GOOGLE_AUTH_URL);

  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}${apiPrefix}/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    Location: authUrl.toString(),
  });
  headers.append("Set-Cookie", serializeCookie(STATE_COOKIE, state, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  headers.append("Set-Cookie", serializeCookie(NONCE_COOKIE, nonce, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  if (returnTo) {
    headers.append("Set-Cookie", serializeCookie(RETURN_TO_COOKIE, returnTo, OAUTH_COOKIE_MAX_AGE_SECONDS, secureCookie));
  }

  return new Response(null, {
    status: 302,
    headers,
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const config = getOidcConfig(env);
  if (!config) {
    return missingOidcConfigResponse();
  }

  const url = new URL(request.url);
  const apiPrefix = getApiPrefix(url.pathname);
  const secureCookie = shouldUseSecureCookie(url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return jsonError("oauth_error", error, 400);
  }

  if (!code || !state) {
    return jsonError("invalid_callback", "Missing code or state", 400);
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  if (!timingSafeEqualString(state, cookies[STATE_COOKIE] ?? "")) {
    return jsonError("invalid_state", "OAuth state does not match", 400);
  }

  const expectedNonce = cookies[NONCE_COOKIE];
  if (!expectedNonce) {
    return jsonError("missing_nonce", "OAuth nonce cookie is missing", 400);
  }

  const origin = url.origin;
  const tokenResponse = await exchangeCodeForToken({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: `${origin}${apiPrefix}/auth/callback`,
  });
  const claims = await verifyGoogleIdToken(tokenResponse.id_token, config.clientId, expectedNonce);
  const email = claims.email?.toLowerCase();

  if (!email || claims.email_verified !== true) {
    return jsonError("email_not_verified", "Google email is missing or not verified", 403);
  }

  if (!config.allowedEmails.has(email)) {
    return jsonError("forbidden_user", "This Google account is not allowed", 403);
  }

  await upsertUser(env.DB, claims, email);

  const session: SessionPayload = {
    sub: claims.sub,
    email,
    name: claims.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const sessionCookie = await createSignedSessionCookie(session, config.sessionSecret, secureCookie);
  const returnTo = getSafeReturnTo(cookies[RETURN_TO_COOKIE], origin) ?? "/";
  const headers = new Headers({
    Location: returnTo,
  });
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secureCookie));
  headers.append("Set-Cookie", clearCookie(NONCE_COOKIE, secureCookie));
  headers.append("Set-Cookie", clearCookie(RETURN_TO_COOKIE, secureCookie));

  return new Response(null, {
    status: 302,
    headers,
  });
}

function handleLogout(request: Request): Response {
  const secureCookie = shouldUseSecureCookie(new URL(request.url));

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearCookie(SESSION_COOKIE, secureCookie),
      },
    },
  );
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUserOrResponse(request, env);
  if (user instanceof Response) {
    return user;
  }

  return Response.json({
    user: {
      id: user.id,
      sub: user.googleSub,
      email: user.email,
      name: user.name,
    },
  });
}

async function handleListTasks(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUserOrResponse(request, env);
  if (user instanceof Response) {
    return user;
  }

  const result = await env.DB.prepare(
    `
    SELECT
      tasks.id,
      tasks.title,
      tasks.description,
      tasks.status,
      tasks.due_date,
      tasks.interval_days,
      tasks.assignee_user_id,
      users.email AS assignee_email,
      users.display_name AS assignee_name,
      tasks.created_at,
      tasks.updated_at
    FROM tasks
    LEFT JOIN users ON users.id = tasks.assignee_user_id
    WHERE tasks.deleted_at IS NULL
    ORDER BY
      CASE WHEN tasks.due_date IS NULL THEN 1 ELSE 0 END,
      tasks.due_date ASC,
      tasks.id ASC
    `,
  ).all<TaskRow>();

  return Response.json({
    tasks: (result.results ?? []).map(toTaskResponse),
  });
}

async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseTaskInput(body, { partial: false });

  const result = await env.DB.prepare(
    `
    INSERT INTO tasks (title, description, status, due_date, interval_days, assignee_user_id, created_at, updated_at)
    VALUES (?, ?, 'todo', ?, ?, NULL, datetime('now'), datetime('now'))
    `,
  )
    .bind(input.title, input.description, input.dueDate, input.intervalDays)
    .run();
  const taskId = result.meta.last_row_id;

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskCreated",
    payload: {
      title: input.title,
      dueDate: input.dueDate,
      intervalDays: input.intervalDays,
    },
  });

  const task = await findTask(env.DB, taskId);

  return Response.json(
    {
      task: toTaskResponse(task!),
    },
    {
      status: 201,
    },
  );
}

async function handleUpdateTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const task = await findTask(env.DB, taskId);
  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseTaskInput(body, { partial: true });
  const nextTitle = input.title ?? task.title;
  const nextDescription = input.description !== undefined ? input.description : task.description;
  const nextDueDate = input.dueDate !== undefined ? input.dueDate : task.due_date;
  const nextIntervalDays = input.intervalDays !== undefined ? input.intervalDays : task.interval_days;

  await env.DB.prepare(
    `
    UPDATE tasks
    SET title = ?, description = ?, due_date = ?, interval_days = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(nextTitle, nextDescription, nextDueDate, nextIntervalDays, taskId)
    .run();

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskUpdated",
    payload: {
      from: {
        title: task.title,
        description: task.description,
        dueDate: task.due_date,
        intervalDays: task.interval_days,
      },
      to: {
        title: nextTitle,
        description: nextDescription,
        dueDate: nextDueDate,
        intervalDays: nextIntervalDays,
      },
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}

async function handleDeleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const task = await findTask(env.DB, taskId);
  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskDeleted",
    payload: {
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      intervalDays: task.interval_days,
      status: task.status,
      assigneeUserId: task.assignee_user_id,
    },
  });

  await env.DB.prepare(
    `
    UPDATE tasks
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(taskId)
    .run();

  return Response.json({
    ok: true,
  });
}

async function handleReassignTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ assigneeUserId?: number | string | null; assigneeEmail?: string | null }>(request);
  const assignee = await resolveAssignee(env, body);
  const task = await findTask(env.DB, taskId);

  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  await env.DB.prepare(
    `
    UPDATE tasks
    SET assignee_user_id = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(assignee?.id ?? null, taskId)
    .run();

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskReassigned",
    payload: {
      fromUserId: task.assignee_user_id,
      toUserId: assignee?.id ?? null,
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}

async function handleCompleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ completed?: boolean; status?: TaskStatus }>(request);
  const task = await findTask(env.DB, taskId);

  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  const nextStatus = body.status ?? (body.completed === false ? "todo" : "done");
  if (nextStatus !== "todo" && nextStatus !== "done") {
    return jsonError("invalid_status", "Task status must be todo or done", 400);
  }

  if (nextStatus === "todo") {
    await env.DB.prepare(
      `
      UPDATE tasks
      SET status = ?, assignee_user_id = NULL, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
      .bind(nextStatus, taskId)
      .run();
  } else {
    const nextDueDate = addDaysToDate(getTodayDateString(), task.interval_days);
    await env.DB.prepare(
      `
      UPDATE tasks
      SET status = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
      .bind(nextStatus, nextDueDate, taskId)
      .run();
  }

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: nextStatus === "done" ? "TaskCompleted" : "TaskReopened",
    payload: {
      fromStatus: task.status,
      toStatus: nextStatus,
      clearedAssigneeUserId: nextStatus === "todo" ? task.assignee_user_id : null,
      nextDueDate: nextStatus === "done" ? addDaysToDate(getTodayDateString(), task.interval_days) : null,
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}

async function getCurrentUserOrResponse(request: Request, env: Env): Promise<CurrentUser | Response> {
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

function getOidcConfig(env: Env): {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  allowedEmails: Set<string>;
} | null {
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

function missingOidcConfigResponse(): Response {
  return jsonError(
    "missing_config",
    "GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, SESSION_SECRET, or ALLOWED_GOOGLE_EMAILS is not configured",
    500,
  );
}

async function exchangeCodeForToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { id_token?: string; error?: string; error_description?: string };

  if (!response.ok || !json.id_token) {
    throw new Error(`Google token exchange failed: ${json.error_description ?? json.error ?? response.status}`);
  }

  return {
    id_token: json.id_token,
  };
}

async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string,
  expectedNonce: string,
): Promise<GoogleIdTokenClaims> {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid ID token format");
  }

  const header = decodeJson<{ alg: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported ID token header");
  }

  const jwk = await findGoogleJwk(header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!signatureValid) {
    throw new Error("Invalid ID token signature");
  }

  const claims = decodeJson<GoogleIdTokenClaims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("Invalid ID token issuer");
  }

  if (claims.aud !== expectedAudience) {
    throw new Error("Invalid ID token audience");
  }

  if (claims.exp <= now) {
    throw new Error("ID token is expired");
  }

  if (!claims.nonce || !timingSafeEqualString(claims.nonce, expectedNonce)) {
    throw new Error("Invalid ID token nonce");
  }

  return claims;
}

async function findGoogleJwk(kid: string): Promise<JsonWebKey> {
  const response = await fetch(GOOGLE_JWKS_URL);
  const json = (await response.json()) as { keys?: GoogleJwk[] };
  const jwk = json.keys?.find((key) => key.kid === kid);

  if (!jwk) {
    throw new Error("Google JWK not found");
  }

  return jwk;
}

async function upsertUser(db: D1Database, claims: GoogleIdTokenClaims, email: string): Promise<void> {
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

async function findTask(db: D1Database, taskId: number): Promise<TaskRow | null> {
  return db
    .prepare(
      `
      SELECT
        tasks.id,
        tasks.title,
        tasks.description,
        tasks.status,
        tasks.due_date,
        tasks.interval_days,
        tasks.assignee_user_id,
        users.email AS assignee_email,
        users.display_name AS assignee_name,
        tasks.created_at,
        tasks.updated_at
      FROM tasks
      LEFT JOIN users ON users.id = tasks.assignee_user_id
      WHERE tasks.id = ? AND tasks.deleted_at IS NULL
      `,
    )
    .bind(taskId)
    .first<TaskRow>();
}

async function resolveAssignee(
  env: Env,
  body: { assigneeUserId?: number | string | null; assigneeEmail?: string | null },
): Promise<{ id: number; email: string } | null> {
  if (body.assigneeUserId === null || body.assigneeEmail === null) {
    return null;
  }

  const allowedEmails = parseAllowedEmails(env.ALLOWED_GOOGLE_EMAILS);
  let user: { id: number; email: string } | null = null;

  if (body.assigneeUserId !== undefined) {
    user = await env.DB.prepare(
      `
      SELECT id, email
      FROM users
      WHERE id = ?
      `,
    )
      .bind(Number(body.assigneeUserId))
      .first<{ id: number; email: string }>();
  } else if (body.assigneeEmail) {
    user = await env.DB.prepare(
      `
      SELECT id, email
      FROM users
      WHERE lower(email) = lower(?)
      `,
    )
      .bind(body.assigneeEmail)
      .first<{ id: number; email: string }>();
  } else {
    throw httpError("invalid_assignee", "assigneeUserId or assigneeEmail is required", 400);
  }

  if (!user) {
    throw httpError("assignee_not_found", "Assignee user not found", 404);
  }

  if (!allowedEmails.has(user.email.toLowerCase())) {
    throw httpError("invalid_assignee", "Assignee is not an allowed user", 400);
  }

  return {
    id: user.id,
    email: user.email,
  };
}

async function recordTaskEvent(
  db: D1Database,
  event: {
    taskId: number;
    actorUserId: number;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO task_events (task_id, event_type, actor_user_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      `,
    )
    .bind(event.taskId, event.eventType, event.actorUserId, JSON.stringify(event.payload))
    .run();
}

function toTaskResponse(task: TaskRow): {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  intervalDays: number;
  assignee: string | null;
  assigneeUserId: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: String(task.id),
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    dueDate: task.due_date,
    intervalDays: task.interval_days,
    assignee: task.assignee_name ?? task.assignee_email,
    assigneeUserId: task.assignee_user_id === null ? null : String(task.assignee_user_id),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw httpError("invalid_json", "Request body must be valid JSON", 400);
  }
}

function parseTaskInput(body: TaskInput, options: { partial: boolean }): {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  intervalDays?: number;
} {
  const result: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    intervalDays?: number;
  } = {};

  if (!options.partial || body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      throw httpError("invalid_task_title", "Task title is required", 400);
    }

    result.title = body.title.trim();
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw httpError("invalid_task_description", "Task description must be a string or null", 400);
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    result.description = description.length > 0 ? description : null;
  } else if (!options.partial) {
    result.description = null;
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && typeof body.dueDate !== "string") {
      throw httpError("invalid_task_due_date", "Task dueDate must be YYYY-MM-DD or null", 400);
    }

    const dueDate = typeof body.dueDate === "string" ? body.dueDate.trim() : "";
    if (dueDate.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw httpError("invalid_task_due_date", "Task dueDate must be YYYY-MM-DD or null", 400);
    }

    result.dueDate = dueDate.length > 0 ? dueDate : null;
  } else if (!options.partial) {
    result.dueDate = null;
  }

  if (body.intervalDays !== undefined) {
    if (typeof body.intervalDays === "number" && Number.isInteger(body.intervalDays) && body.intervalDays > 0) {
      result.intervalDays = body.intervalDays;
    } else if (
      typeof body.intervalDays === "string" &&
      /^\d+$/.test(body.intervalDays) &&
      Number.parseInt(body.intervalDays, 10) > 0
    ) {
      result.intervalDays = Number.parseInt(body.intervalDays, 10);
    } else {
      throw httpError("invalid_task_interval_days", "Task intervalDays must be a positive integer", 400);
    }
  } else if (!options.partial) {
    throw httpError("invalid_task_interval_days", "Task intervalDays is required", 400);
  }

  return result;
}

function getTodayDateString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format current date");
  }

  return `${year}-${month}-${day}`;
}

function addDaysToDate(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

async function createSignedSessionCookie(
  payload: SessionPayload,
  secret: string,
  secure: boolean,
): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(encodedPayload, secret);

  return serializeCookie(SESSION_COOKIE, `${encodedPayload}.${signature}`, SESSION_MAX_AGE_SECONDS, secure);
}

async function verifySignedSessionCookie(value: string, secret: string): Promise<SessionPayload | null> {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await hmacSha256(encodedPayload, secret);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return null;
  }

  const payload = decodeJson<SessionPayload>(encodedPayload);
  if (!payload.sub || !payload.email || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function parseAllowedEmails(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(value.join("="));
    }
  }

  return cookies;
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    attributes.splice(3, 0, "Secure");
  }

  return attributes.join("; ");
}

function clearCookie(name: string, secure: boolean): string {
  const attributes = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (secure) {
    attributes.splice(3, 0, "Secure");
  }

  return attributes.join("; ");
}

function shouldUseSecureCookie(url: URL): boolean {
  return url.protocol === "https:";
}

function getSafeReturnTo(value: string | null | undefined, defaultOrigin: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const defaultUrl = new URL(defaultOrigin);
    if (url.origin === defaultUrl.origin || isAllowedUiOrigin(url)) {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function getApiPrefix(pathname: string): string {
  return pathname === "/api" || pathname.startsWith("/api/") ? "/api" : "";
}

function corsPreflightResponse(request: Request): Response {
  return withCors(request, new Response(null, { status: 204 }));
}

function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedCorsOrigin(origin, request.url)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isAllowedCorsOrigin(origin: string, requestUrl: string): boolean {
  const requestOrigin = new URL(requestUrl).origin;
  if (origin === requestOrigin) {
    return true;
  }

  try {
    return isAllowedUiOrigin(new URL(origin));
  } catch {
    return false;
  }
}

function isAllowedUiOrigin(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
    },
  );
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}
