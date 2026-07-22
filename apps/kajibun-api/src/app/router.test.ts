import { describe, expect, test } from "bun:test";
import worker from "../index";
import type { Env } from "./env";
import { handleRequest } from "./router";

describe("handleRequest", () => {
  test("returns health response", async () => {
    const response = await handleRequest(new Request("https://api.example.test/health"), createTestEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "kajibun-api",
    });
  });

  test("returns default API response for /api", async () => {
    const response = await handleRequest(new Request("https://api.example.test/api"), createTestEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "kajibun-api",
      status: "ok",
      hasDatabaseBinding: true,
      auth: {
        loginUrl: "/api/auth/login",
        currentUserUrl: "/api/me",
      },
    });
  });

  test("applies CORS headers for allowed origins", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/health", {
        headers: {
          Origin: "http://localhost:5173",
        },
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("handles CORS preflight requests", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/tasks", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
        },
      }),
      createTestEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,PATCH,DELETE,OPTIONS");
  });

  test("serves non-API paths from the assets binding", async () => {
    const env = createTestEnv();
    const response = await handleRequest(new Request("https://api.example.test/dashboard"), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/dashboard");
  });

  test("returns unauthorized JSON for authenticated API routes without a session", async () => {
    const response = await handleRequest(new Request("https://api.example.test/me"), createTestEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
  });

  test("keeps task routes available with and without the /api prefix", async () => {
    const env = createTestEnv();
    const response = await handleRequest(new Request("https://api.example.test/tasks"), env);
    const prefixedResponse = await handleRequest(new Request("https://api.example.test/api/tasks"), env);

    expect(response.status).toBe(401);
    expect(prefixedResponse.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
    expect(await prefixedResponse.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
  });

  test("keeps public push routes available with and without the /api prefix", async () => {
    const env = createTestEnv({
      VAPID_PUBLIC_KEY: "test-vapid-key",
    });
    const response = await handleRequest(new Request("https://api.example.test/push/vapid-public-key"), env);
    const prefixedResponse = await handleRequest(
      new Request("https://api.example.test/api/push/vapid-public-key"),
      env,
    );

    expect(response.status).toBe(200);
    expect(prefixedResponse.status).toBe(200);
    expect(await response.json()).toEqual({
      publicKey: "test-vapid-key",
    });
    expect(await prefixedResponse.json()).toEqual({
      publicKey: "test-vapid-key",
    });
  });

  test("returns configuration error when auth login is not configured", async () => {
    const response = await handleRequest(new Request("https://api.example.test/auth/login"), createTestEnv());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "missing_config",
        message: "GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, SESSION_SECRET, or ALLOWED_GOOGLE_EMAILS is not configured",
      },
    });
  });

  test("redirects auth login to Google and preserves the /api callback prefix", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/api/auth/login?return_to=http://localhost:5173/tasks"),
      createTestEnv(createAuthConfig()),
    );

    const location = new URL(response.headers.get("Location") ?? "");
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.pathname).toBe("/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe("google-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("https://api.example.test/api/auth/callback");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("prompt")).toBe("select_account");
    expect(location.searchParams.get("state") ?? "").toMatch(/^[A-Za-z0-9_-]+$/);
    expect(location.searchParams.get("nonce") ?? "").toMatch(/^[A-Za-z0-9_-]+$/);
    expect(setCookie).toContain("kajibun_oauth_state=");
    expect(setCookie).toContain("kajibun_oauth_nonce=");
    expect(setCookie).toContain("kajibun_return_to=http%3A%2F%2Flocalhost%3A5173");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  test("returns OAuth callback errors before token exchange", async () => {
    const env = createTestEnv(createAuthConfig());
    const oauthErrorResponse = await handleRequest(
      new Request("https://api.example.test/auth/callback?error=access_denied"),
      env,
    );
    const invalidCallbackResponse = await handleRequest(new Request("https://api.example.test/auth/callback"), env);
    const invalidStateResponse = await handleRequest(
      new Request("https://api.example.test/auth/callback?code=abc&state=actual", {
        headers: {
          Cookie: "kajibun_oauth_state=expected; kajibun_oauth_nonce=nonce",
        },
      }),
      env,
    );

    expect(oauthErrorResponse.status).toBe(400);
    expect(await oauthErrorResponse.json()).toEqual({
      error: {
        code: "oauth_error",
        message: "access_denied",
      },
    });
    expect(invalidCallbackResponse.status).toBe(400);
    expect(await invalidCallbackResponse.json()).toEqual({
      error: {
        code: "invalid_callback",
        message: "Missing code or state",
      },
    });
    expect(invalidStateResponse.status).toBe(400);
    expect(await invalidStateResponse.json()).toEqual({
      error: {
        code: "invalid_state",
        message: "OAuth state does not match",
      },
    });
  });

  test("clears the session cookie on logout", async () => {
    const response = await handleRequest(new Request("https://api.example.test/auth/logout", { method: "POST" }), createTestEnv());
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
    });
    expect(setCookie).toContain("kajibun_session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
  });

  test("protects auth profile and avatar routes without a session", async () => {
    const env = createTestEnv();
    const updateMeResponse = await handleRequest(
      new Request("https://api.example.test/me", {
        method: "PATCH",
        body: JSON.stringify({ name: "Test User" }),
      }),
      env,
    );
    const uploadAvatarResponse = await handleRequest(
      new Request("https://api.example.test/me/avatar", {
        method: "POST",
        body: new FormData(),
      }),
      env,
    );
    const userAvatarResponse = await handleRequest(new Request("https://api.example.test/users/123/avatar"), env);

    expect(updateMeResponse.status).toBe(401);
    expect(uploadAvatarResponse.status).toBe(401);
    expect(userAvatarResponse.status).toBe(401);
    expect(await updateMeResponse.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
    expect(await uploadAvatarResponse.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
    expect(await userAvatarResponse.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Not logged in",
      },
    });
  });
});

function createTestEnv(overrides: Partial<Env> = {}): Env {
  const assets: Fetcher = {
    fetch: (request: Request) => {
      const pathname = new URL(request.url).pathname;
      return Promise.resolve(new Response(`asset:${pathname}`));
    },
    connect: () => {
      throw new Error("ASSETS.connect is not implemented in tests");
    },
  };

  return {
    ASSETS: assets,
    DB: {} as D1Database,
    AVATARS: {} as R2Bucket,
    ...overrides,
  };
}

function createAuthConfig(): Partial<Env> {
  return {
    GOOGLE_OIDC_CLIENT_ID: "google-client-id",
    GOOGLE_OIDC_CLIENT_SECRET: "google-client-secret",
    SESSION_SECRET: "session-secret",
    ALLOWED_GOOGLE_EMAILS: "user@example.test",
  };
}
