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
});

function createTestEnv(): Env {
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
  };
}
