import { parseAllowedEmails } from "../auth/service";
import { httpError } from "../shared/errors";
import type { TaskRow, TaskStatus } from "./types";

export async function listTasks(db: D1Database): Promise<TaskRow[]> {
  const result = await db
    .prepare(
      `
      SELECT
        tasks.id,
        tasks.title,
        tasks.description,
        tasks.status,
        tasks.due_date,
        tasks.interval_days,
        tasks.assignee_user_id,
        users.email AS assignee_email,
        users.display_name AS assignee_name,
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
    )
    .all<TaskRow>();

  return result.results ?? [];
}

export async function findTask(db: D1Database, taskId: number): Promise<TaskRow | null> {
  return db
    .prepare(
      `
      SELECT
        tasks.id,
        tasks.title,
        tasks.description,
        tasks.status,
        tasks.due_date,
        tasks.interval_days,
        tasks.assignee_user_id,
        users.email AS assignee_email,
        users.display_name AS assignee_name,
        tasks.created_at,
        tasks.updated_at
      FROM tasks
      LEFT JOIN users ON users.id = tasks.assignee_user_id
      WHERE tasks.id = ? AND tasks.deleted_at IS NULL
      `,
    )
    .bind(taskId)
    .first<TaskRow>();
}

export async function insertTask(
  db: D1Database,
  input: {
    title: string;
    description: string | null;
    dueDate: string | null;
    intervalDays: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `
      INSERT INTO tasks (title, description, status, due_date, interval_days, assignee_user_id, created_at, updated_at)
      VALUES (?, ?, 'todo', ?, ?, NULL, datetime('now'), datetime('now'))
      `,
    )
    .bind(input.title, input.description, input.dueDate, input.intervalDays)
    .run();

  return result.meta.last_row_id;
}

export async function updateTaskDetails(
  db: D1Database,
  taskId: number,
  input: {
    title: string;
    description: string | null;
    dueDate: string | null;
    intervalDays: number;
  },
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE tasks
      SET title = ?, description = ?, due_date = ?, interval_days = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
    .bind(input.title, input.description, input.dueDate, input.intervalDays, taskId)
    .run();
}

export async function markTaskDeleted(db: D1Database, taskId: number): Promise<void> {
  await db
    .prepare(
      `
      UPDATE tasks
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
      `,
    )
    .bind(taskId)
    .run();
}

export async function updateTaskAssignee(
  db: D1Database,
  taskId: number,
  assigneeUserId: number | null,
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE tasks
      SET assignee_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
    .bind(assigneeUserId, taskId)
    .run();
}

export async function updateTaskStatus(
  db: D1Database,
  taskId: number,
  input: {
    status: TaskStatus;
    dueDate?: string | null;
    clearAssignee?: boolean;
  },
): Promise<void> {
  if (input.clearAssignee) {
    await db
      .prepare(
        `
        UPDATE tasks
        SET status = ?, assignee_user_id = NULL, updated_at = datetime('now')
        WHERE id = ?
        `,
      )
      .bind(input.status, taskId)
      .run();
    return;
  }

  await db
    .prepare(
      `
      UPDATE tasks
      SET status = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
    .bind(input.status, input.dueDate ?? null, taskId)
    .run();
}

export async function resolveAssignee(
  db: D1Database,
  allowedEmailsConfig: string | undefined,
  body: { assigneeUserId?: number | string | null; assigneeEmail?: string | null },
): Promise<{ id: number; email: string } | null> {
  if (body.assigneeUserId === null || body.assigneeEmail === null) {
    return null;
  }

  const allowedEmails = parseAllowedEmails(allowedEmailsConfig);
  let user: { id: number; email: string } | null = null;

  if (body.assigneeUserId !== undefined) {
    user = await db
      .prepare(
        `
        SELECT id, email
        FROM users
        WHERE id = ?
        `,
      )
      .bind(Number(body.assigneeUserId))
      .first<{ id: number; email: string }>();
  } else if (body.assigneeEmail) {
    user = await db
      .prepare(
        `
        SELECT id, email
        FROM users
        WHERE lower(email) = lower(?)
        `,
      )
      .bind(body.assigneeEmail)
      .first<{ id: number; email: string }>();
  } else {
    throw httpError("invalid_assignee", "assigneeUserId or assigneeEmail is required", 400);
  }

  if (!user) {
    throw httpError("assignee_not_found", "Assignee user not found", 404);
  }

  if (!allowedEmails.has(user.email.toLowerCase())) {
    throw httpError("invalid_assignee", "Assignee is not an allowed user", 400);
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export async function recordTaskEvent(
  db: D1Database,
  event: {
    taskId: number;
    actorUserId: number;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO task_events (task_id, event_type, actor_user_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      `,
    )
    .bind(event.taskId, event.eventType, event.actorUserId, JSON.stringify(event.payload))
    .run();
}
