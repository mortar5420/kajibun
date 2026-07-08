export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GOOGLE_OIDC_CLIENT_ID?: string;
  GOOGLE_OIDC_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_GOOGLE_EMAILS?: string;
}
