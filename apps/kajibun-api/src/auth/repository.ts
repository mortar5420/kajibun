import type { SqlClient } from "../db/client";
import type { GoogleIdTokenClaims } from "./types";

export type UserRecord = {
  id: number;
  google_sub: string;
  email: string;
  display_name: string | null;
  picture_url: string | null;
  avatar_object_key: string | null;
  avatar_content_type: string | null;
  avatar_updated_at: string | null;
};

export async function findUserByGoogleSub(db: SqlClient, googleSub: string): Promise<UserRecord | null> {
  return db.first<UserRecord>(
    `
    SELECT id, google_sub, email, display_name, picture_url, avatar_object_key, avatar_content_type, avatar_updated_at
    FROM users
    WHERE google_sub = ?
    `,
    [googleSub],
  );
}

export async function findUserById(db: SqlClient, userId: number): Promise<UserRecord | null> {
  return db.first<UserRecord>(
    `
    SELECT id, google_sub, email, display_name, picture_url, avatar_object_key, avatar_content_type, avatar_updated_at
    FROM users
    WHERE id = ?
    `,
    [userId],
  );
}

export async function updateUserProfile(
  db: SqlClient,
  userId: number,
  input: {
    displayName: string | null;
  },
): Promise<UserRecord | null> {
  await db.run(
    `
    UPDATE users
    SET display_name = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
    [input.displayName, userId],
  );

  return findUserById(db, userId);
}

export async function updateUserAvatar(
  db: SqlClient,
  userId: number,
  input: {
    objectKey: string;
    contentType: string;
  },
): Promise<UserRecord | null> {
  await db.run(
    `
    UPDATE users
    SET
      avatar_object_key = ?,
      avatar_content_type = ?,
      avatar_updated_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
    `,
    [input.objectKey, input.contentType, userId],
  );

  return findUserById(db, userId);
}

export async function clearUserAvatar(db: SqlClient, userId: number): Promise<UserRecord | null> {
  await db.run(
    `
    UPDATE users
    SET
      picture_url = NULL,
      avatar_object_key = NULL,
      avatar_content_type = NULL,
      avatar_updated_at = NULL,
      updated_at = datetime('now')
    WHERE id = ?
    `,
    [userId],
  );

  return findUserById(db, userId);
}

export async function upsertUser(db: SqlClient, claims: GoogleIdTokenClaims, email: string): Promise<void> {
  await db.run(
    `
    INSERT INTO users (google_sub, email, display_name, picture_url, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      display_name = COALESCE(users.display_name, excluded.display_name),
      picture_url = COALESCE(users.picture_url, excluded.picture_url),
      updated_at = datetime('now'),
      last_login_at = datetime('now')
    `,
    [claims.sub, email, claims.name ?? null, claims.picture ?? null],
  );
}
