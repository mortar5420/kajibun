import type { SqlClient, SqlRunResult, SqlValue } from "../../db/client";

export function createD1Client(db: D1Database): SqlClient {
  return {
    async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();

      return result.results ?? [];
    },

    async first<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | null> {
      return db
        .prepare(sql)
        .bind(...params)
        .first<T>();
    },

    async run(sql: string, params: readonly SqlValue[] = []): Promise<SqlRunResult> {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .run();

      return {
        lastRowId: result.meta.last_row_id,
        changes: result.meta.changes,
      };
    },

    async batch(statements) {
      const results = await db.batch(
        statements.map(({ sql, params = [] }) => db.prepare(sql).bind(...params)),
      );
      return results.map((result) => ({ lastRowId: result.meta.last_row_id, changes: result.meta.changes }));
    },
  };
}
