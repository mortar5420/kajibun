import type { SqlClient } from "../db/client";
import type { GoogleIdTokenClaims } from "./types";

export type UserRecord = {
  id: number;
  google_sub: string;
  email: string;
  display_name: string | null;
};

export async function findUserByGoogleSub(db: SqlClient, googleSub: string): Promise<UserRecord | null> {
  return db.first<UserRecord>(
    `
    SELECT id, google_sub, email, display_name
    FROM users
    WHERE google_sub = ?
    `,
    [googleSub],
  );
}

export async function upsertUser(db: SqlClient, claims: GoogleIdTokenClaims, email: string): Promise<void> {
  await db.run(
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
    [claims.sub, email, claims.name ?? null, claims.picture ?? null],
  );
}
