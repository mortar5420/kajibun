import { parseAllowedEmails } from "../auth/service";
import type { SqlClient } from "../db/client";
import { httpError } from "../shared/errors";
import type { TaskRow, TaskStatus } from "./types";

export async function listTasks(db: SqlClient): Promise<TaskRow[]> {
  return db.all<TaskRow>(
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
  );
}

export async function findTask(db: SqlClient, taskId: number): Promise<TaskRow | null> {
  return db.first<TaskRow>(
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
    [taskId],
  );
}

export async function insertTask(
  db: SqlClient,
  input: {
    title: string;
    description: string | null;
    dueDate: string | null;
    intervalDays: number;
  },
): Promise<number> {
  const result = await db.run(
    `
    INSERT INTO tasks (title, description, status, due_date, interval_days, assignee_user_id, created_at, updated_at)
    VALUES (?, ?, 'todo', ?, ?, NULL, datetime('now'), datetime('now'))
    `,
    [input.title, input.description, input.dueDate, input.intervalDays],
  );

  if (!result.lastRowId) {
    throw new Error("Failed to get inserted task id");
  }

  return result.lastRowId;
}

export async function updateTaskDetails(
  db: SqlClient,
  taskId: number,
  input: {
    title: string;
    description: string | null;
    dueDate: string | null;
    intervalDays: number;
  },
): Promise<void> {
  await db.run(
    `
    UPDATE tasks
    SET title = ?, description = ?, due_date = ?, interval_days = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
    [input.title, input.description, input.dueDate, input.intervalDays, taskId],
  );
}

export async function markTaskDeleted(db: SqlClient, taskId: number): Promise<void> {
  await db.run(
    `
    UPDATE tasks
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
    `,
    [taskId],
  );
}

export async function updateTaskAssignee(
  db: SqlClient,
  taskId: number,
  assigneeUserId: number | null,
): Promise<void> {
  await db.run(
    `
    UPDATE tasks
    SET assignee_user_id = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
    [assigneeUserId, taskId],
  );
}

export async function updateTaskStatus(
  db: SqlClient,
  taskId: number,
  input: {
    status: TaskStatus;
    dueDate?: string | null;
    clearAssignee?: boolean;
  },
): Promise<void> {
  if (input.clearAssignee) {
    await db.run(
      `
      UPDATE tasks
      SET status = ?, assignee_user_id = NULL, updated_at = datetime('now')
      WHERE id = ?
      `,
      [input.status, taskId],
    );
    return;
  }

  await db.run(
    `
    UPDATE tasks
    SET status = ?, due_date = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
    [input.status, input.dueDate ?? null, taskId],
  );
}

export async function resolveAssignee(
  db: SqlClient,
  allowedEmailsConfig: string | undefined,
  body: { assigneeUserId?: number | string | null; assigneeEmail?: string | null },
): Promise<{ id: number; email: string } | null> {
  if (body.assigneeUserId === null || body.assigneeEmail === null) {
    return null;
  }

  const allowedEmails = parseAllowedEmails(allowedEmailsConfig);
  let user: { id: number; email: string } | null = null;

  if (body.assigneeUserId !== undefined) {
    user = await db.first<{ id: number; email: string }>(
      `
      SELECT id, email
      FROM users
      WHERE id = ?
      `,
      [Number(body.assigneeUserId)],
    );
  } else if (body.assigneeEmail) {
    user = await db.first<{ id: number; email: string }>(
      `
      SELECT id, email
      FROM users
      WHERE lower(email) = lower(?)
      `,
      [body.assigneeEmail],
    );
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
  db: SqlClient,
  event: {
    taskId: number;
    actorUserId: number;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  await db.run(
    `
    INSERT INTO task_events (task_id, event_type, actor_user_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    `,
    [event.taskId, event.eventType, event.actorUserId, JSON.stringify(event.payload)],
  );
}
