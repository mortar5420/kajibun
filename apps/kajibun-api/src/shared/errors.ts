export type HttpErrorLike = {
  code: string;
  message: string;
  status: number;
};

export function httpError(code: string, message: string, status: number): HttpErrorLike {
  return { code, message, status };
}

export function isHttpError(error: unknown): error is HttpErrorLike {
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

export function jsonError(code: string, message: string, status: number): Response {
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

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw httpError("invalid_json", "Request body must be valid JSON", 400);
  }
}
