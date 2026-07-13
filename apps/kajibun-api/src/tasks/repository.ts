import type { SqlClient } from "../db/client";
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

export interface TaskRepository {
  list(): Promise<Task[]>;
  findById(taskId: number): Promise<Task | null>;
  insert(input: TaskDetails): Promise<number>;
  updateDetails(taskId: number, input: TaskDetails): Promise<void>;
  markDeleted(taskId: number): Promise<void>;
  updateAssignee(taskId: number, assigneeUserId: number | null): Promise<void>;
  updateCompletion(taskId: number, input: TaskCompletionUpdate): Promise<void>;
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
          tasks.updated_at
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
          tasks.updated_at
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

    async updateDetails(taskId: number, input: TaskDetails): Promise<void> {
      await db.run(
        `
        UPDATE tasks
        SET title = ?, description = ?, due_date = ?, interval_days = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
        [input.title, input.description, input.dueDate, input.intervalDays, taskId],
      );
    },

    async markDeleted(taskId: number): Promise<void> {
      await db.run(
        `
        UPDATE tasks
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
        `,
        [taskId],
      );
    },

    async updateAssignee(taskId: number, assigneeUserId: number | null): Promise<void> {
      await db.run(
        `
        UPDATE tasks
        SET assignee_user_id = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
        [assigneeUserId, taskId],
      );
    },

    async updateCompletion(taskId: number, input: TaskCompletionUpdate): Promise<void> {
      await db.run(
        `
        UPDATE tasks
        SET due_date = ?, assignee_user_id = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
        [input.dueDate, input.assigneeUserId, taskId],
      );
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
