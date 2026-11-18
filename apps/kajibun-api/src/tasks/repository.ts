import type { SqlClient, SqlStatement } from "../db/client";
import { httpError } from "../shared/errors";
import type { CompletionRecord, ReassignmentHistory } from "./completion";
import type { TaskDomainEvent } from "./events";
import { toTask } from "./mapper";
import type { Task, TaskDetails } from "./domain";
import type { TaskRow, UserLookup } from "./types";

export type TaskCompletionUpdate = {
  dueDate: string | null;
  assigneeUserId: number;
};

export type TaskEventRecord = {
  taskId: number;
  actorUserId: number;
  eventType: string;
  payload: unknown;
};

export type TaskChange =
  | { type: "details"; input: TaskDetails }
  | { type: "assignee"; assigneeUserId: number | null }
  | { type: "delete" }
  | { type: "complete"; update: TaskCompletionUpdate; record: CompletionRecord };

export interface TaskRepository {
  list(): Promise<Task[]>;
  findById(taskId: number): Promise<Task | null>;
  insert(input: TaskDetails): Promise<number>;
  saveChange(task: Task, change: TaskChange, event: TaskDomainEvent): Promise<number>;
  listCurrentReassignments(taskId: number): Promise<ReassignmentHistory[]>;
  findUserById(userId: number): Promise<UserLookup | null>;
  findUserByEmail(email: string): Promise<UserLookup | null>;
  findUsersByEmails(emails: string[]): Promise<UserLookup[]>;
  recordEvent(event: TaskEventRecord): Promise<number>;
}

export function createSqlTaskRepository(db: SqlClient): TaskRepository {
  return {
    async list(): Promise<Task[]> {
      const rows = await db.all<TaskRow>(
        `
        SELECT
          tasks.id,
          tasks.title,
          tasks.description,
          tasks.due_date,
          tasks.interval_days,
          tasks.assignee_user_id,
          users.email AS assignee_email,
          users.display_name AS assignee_name,
          users.picture_url AS assignee_picture_url,
          users.avatar_object_key AS assignee_avatar_object_key,
          users.avatar_updated_at AS assignee_avatar_updated_at,
          tasks.created_at,
          tasks.updated_at,
          tasks.version
        FROM tasks
        LEFT JOIN users ON users.id = tasks.assignee_user_id
        WHERE tasks.deleted_at IS NULL
        ORDER BY
          CASE WHEN tasks.due_date IS NULL THEN 1 ELSE 0 END,
          tasks.due_date ASC,
          tasks.id ASC
        `,
      );

      return rows.map(toTask);
    },

    async findById(taskId: number): Promise<Task | null> {
      const row = await db.first<TaskRow>(
        `
        SELECT
          tasks.id,
          tasks.title,
          tasks.description,
          tasks.due_date,
          tasks.interval_days,
          tasks.assignee_user_id,
          users.email AS assignee_email,
          users.display_name AS assignee_name,
          users.picture_url AS assignee_picture_url,
          users.avatar_object_key AS assignee_avatar_object_key,
          users.avatar_updated_at AS assignee_avatar_updated_at,
          tasks.created_at,
          tasks.updated_at,
          tasks.version
        FROM tasks
        LEFT JOIN users ON users.id = tasks.assignee_user_id
        WHERE tasks.id = ? AND tasks.deleted_at IS NULL
        `,
        [taskId],
      );

      return row ? toTask(row) : null;
    },

    async insert(input: TaskDetails): Promise<number> {
      const result = await db.run(
        `
        INSERT INTO tasks (title, description, due_date, interval_days, assignee_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
        `,
        [input.title, input.description, input.dueDate, input.intervalDays],
      );

      if (!result.lastRowId) {
        throw new Error("Failed to get inserted task id");
      }

      return result.lastRowId;
    },

    async saveChange(task, change, event): Promise<number> {
      const mutation = taskMutation(change);
      const statements: SqlStatement[] = [{
        sql: `UPDATE tasks SET ${mutation.sql}, version = version + 1, updated_at = datetime('now')
              WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        params: [...(mutation.params ?? []), task.id, task.version],
      }];
      if (change.type === "complete") {
        const record = change.record;
        statements.push({
          sql: `INSERT INTO task_completions (
                  id, task_id, performed_by_user_id, performed_at, task_title_snapshot, due_date_snapshot,
                  takeover_from_user_id, takeover_at, takeover_due_date, classification
                ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
          params: [record.id, record.taskId, record.performedByUserId, record.performedAt,
            record.taskTitleSnapshot, record.dueDateSnapshot, record.takeoverFromUserId,
            record.takeoverAt, record.takeoverDueDate, record.classification],
        });
      }
      // changes() propagates a failed version check through the whole batch:
      // no completion or event is inserted if the task has already changed.
      statements.push({
        sql: `INSERT INTO task_events (task_id, event_type, actor_user_id, payload_json, created_at)
              SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
        params: [event.taskId, event.type, event.actorUserId, JSON.stringify(event.payload),
          change.type === "complete" ? change.record.performedAt : new Date().toISOString()],
      });
      const results = await db.batch(statements);
      if (results[0]?.changes !== 1) {
        throw httpError("task_conflict", "家事が更新されています。一覧を更新してから操作してください。", 409);
      }
      const eventId = results[results.length - 1]?.lastRowId;
      if (!eventId) throw new Error("Failed to get inserted task event id");
      return eventId;
    },

    async listCurrentReassignments(taskId): Promise<ReassignmentHistory[]> {
      const rows = await db.all<{ payload_json: string; created_at: string }>(
        `SELECT payload_json, created_at FROM task_events
         WHERE task_id = ? AND event_type = 'TaskReassigned'
           AND id > COALESCE((SELECT MAX(id) FROM task_events WHERE task_id = ? AND event_type = 'TaskCompleted'), 0)
         ORDER BY id ASC`,
        [taskId, taskId],
      );
      return rows.map((row) => ({
        ...JSON.parse(row.payload_json) as Omit<ReassignmentHistory, "occurredAt">,
        occurredAt: row.created_at.includes("T") ? row.created_at : `${row.created_at.replace(" ", "T")}Z`,
      }));
    },

    async findUserById(userId: number): Promise<UserLookup | null> {
      return db.first<UserLookup>(
        `
        SELECT id, email
        FROM users
        WHERE id = ?
        `,
        [userId],
      );
    },

    async findUserByEmail(email: string): Promise<UserLookup | null> {
      return db.first<UserLookup>(
        `
        SELECT id, email
        FROM users
        WHERE lower(email) = lower(?)
        `,
        [email],
      );
    },

    async findUsersByEmails(emails: string[]): Promise<UserLookup[]> {
      const normalizedEmails = emails.map((email) => email.toLowerCase());
      if (normalizedEmails.length === 0) {
        return [];
      }

      const placeholders = normalizedEmails.map(() => "?").join(", ");
      return db.all<UserLookup>(
        `
        SELECT id, email
        FROM users
        WHERE lower(email) IN (${placeholders})
        ORDER BY id ASC
        `,
        normalizedEmails,
      );
    },

    async recordEvent(event: TaskEventRecord): Promise<number> {
      const result = await db.run(
        `
        INSERT INTO task_events (task_id, event_type, actor_user_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        `,
        [event.taskId, event.eventType, event.actorUserId, JSON.stringify(event.payload)],
      );

      if (!result.lastRowId) {
        throw new Error("Failed to get inserted task event id");
      }

      return result.lastRowId;
    },
  };
}

function taskMutation(change: TaskChange): SqlStatement {
  switch (change.type) {
    case "details":
      return {
        sql: "title = ?, description = ?, due_date = ?, interval_days = ?",
        params: [change.input.title, change.input.description, change.input.dueDate, change.input.intervalDays],
      };
    case "assignee":
      return { sql: "assignee_user_id = ?", params: [change.assigneeUserId] };
    case "delete":
      return { sql: "deleted_at = datetime('now')" };
    case "complete":
      return { sql: "due_date = ?, assignee_user_id = ?", params: [change.update.dueDate, change.update.assigneeUserId] };
  }
}
