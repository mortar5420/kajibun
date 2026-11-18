import type { SqlClient } from "../db/client";
import type { CompletionClassification } from "../tasks/completion";
import type { Completion, CompletionUser } from "./domain";

type CompletionRow = {
  id: string;
  task_id: number;
  task_title_snapshot: string;
  performed_by_user_id: number | null;
  performed_by_name: string | null;
  performed_at: string;
  due_date_snapshot: string | null;
  classification: CompletionClassification;
  takeover_from_user_id: number | null;
  takeover_from_name: string | null;
  takeover_at: string | null;
  takeover_due_date: string | null;
};

export function createCompletionRepository(db: SqlClient) {
  return {
    async listInRange(start: string, end: string): Promise<Completion[]> {
      const rows = await db.all<CompletionRow>(
        `SELECT c.*, COALESCE(performer.display_name, performer.email) AS performed_by_name,
                COALESCE(original.display_name, original.email) AS takeover_from_name
         FROM task_completions c
         LEFT JOIN users performer ON performer.id = c.performed_by_user_id
         LEFT JOIN users original ON original.id = c.takeover_from_user_id
         WHERE c.performed_at >= ? AND c.performed_at < ?
         ORDER BY c.performed_at DESC, c.id DESC`,
        [start, end],
      );
      return rows.map((row) => ({
        id: row.id,
        taskId: String(row.task_id),
        title: row.task_title_snapshot,
        performedByUserId: row.performed_by_user_id === null ? null : String(row.performed_by_user_id),
        performedByName: row.performed_by_name ?? "不明なユーザ",
        performedAt: row.performed_at,
        dueDate: row.due_date_snapshot,
        classification: row.classification,
        takeoverFromUserId: row.takeover_from_user_id === null ? null : String(row.takeover_from_user_id),
        takeoverFromName: row.takeover_from_name,
        takeoverAt: row.takeover_at,
        takeoverDueDate: row.takeover_due_date,
      }));
    },

    async listUsers(): Promise<CompletionUser[]> {
      const rows = await db.all<{ id: number; name: string }>(
        "SELECT id, COALESCE(display_name, email) AS name FROM users ORDER BY id ASC",
      );
      return rows.map((row) => ({ userId: String(row.id), name: row.name }));
    },
  };
}
