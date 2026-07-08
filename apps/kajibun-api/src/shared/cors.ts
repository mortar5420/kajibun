export function corsPreflightResponse(request: Request): Response {
  return withCors(request, new Response(null, { status: 204 }));
}

export function withCors(request: Request, response: Response): Response {
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

export function isAllowedUiOrigin(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
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
