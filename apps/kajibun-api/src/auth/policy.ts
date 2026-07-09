export function parseAllowedEmails(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string, allowedEmailsConfig?: string): boolean {
  return parseAllowedEmails(allowedEmailsConfig).has(email.toLowerCase());
}
