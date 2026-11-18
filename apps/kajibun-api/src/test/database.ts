import { Database } from "bun:sqlite";
import type { SqlClient, SqlValue } from "../db/client";
import users from "../db/migrations/0001_create_users.sql" with { type: "text" };
import tasks from "../db/migrations/0002_create_tasks.sql" with { type: "text" };
import seed from "../db/migrations/0003_seed_tasks.sql" with { type: "text" };
import deletedAt from "../db/migrations/0004_add_tasks_deleted_at.sql" with { type: "text" };
import interval from "../db/migrations/0005_add_tasks_interval_days.sql" with { type: "text" };
import notifications from "../db/migrations/0006_create_push_notifications.sql" with { type: "text" };
import avatars from "../db/migrations/0007_add_user_avatar_storage.sql" with { type: "text" };
import removeStatus from "../db/migrations/0008_remove_task_status.sql" with { type: "text" };
import completions from "../db/migrations/0009_create_task_completions.sql" with { type: "text" };

export function createTestDatabase(beforeCompletionMigration?: (database: Database) => void) {
  const database = new Database(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of [users, tasks, seed, deletedAt, interval, notifications, avatars, removeStatus]) database.exec(migration);
  database.exec("DELETE FROM tasks");
  database.exec(`INSERT INTO users (id, google_sub, email, display_name) VALUES
    (1, 'user-a', 'a@example.test', 'Aさん'), (2, 'user-b', 'b@example.test', 'Bさん')`);
  beforeCompletionMigration?.(database);
  database.exec(completions);

  const bind = (params: readonly SqlValue[] = []) => params.map((value) => typeof value === "boolean" ? Number(value) : value);
  const run: SqlClient["run"] = async (sql, params) => {
    const result = database.query(sql).run(...bind(params));
    return { lastRowId: Number(result.lastInsertRowid), changes: result.changes };
  };
  const client: SqlClient = {
    async all<T>(sql: string, params?: readonly SqlValue[]) { return database.query<T>(sql).all(...bind(params)); },
    async first<T>(sql: string, params?: readonly SqlValue[]) { return database.query<T>(sql).get(...bind(params)); },
    run,
    async batch(statements) {
      return database.transaction(() => statements.map(({ sql, params }) => {
        const result = database.query(sql).run(...bind(params));
        return { lastRowId: Number(result.lastInsertRowid), changes: result.changes };
      }))();
    },
  };
  return { database, client };
}
