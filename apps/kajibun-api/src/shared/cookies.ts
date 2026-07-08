export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(value.join("="));
    }
  }

  return cookies;
}

export function serializeCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
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

export function clearCookie(name: string, secure: boolean): string {
  const attributes = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (secure) {
    attributes.splice(3, 0, "Secure");
  }

  return attributes.join("; ");
}

export function shouldUseSecureCookie(url: URL): boolean {
  return url.protocol === "https:";
}
