import { parseAllowedEmails } from "../auth/service";
import type { Env } from "../app/env";
import { httpError } from "../shared/errors";
import type { TaskRow } from "./types";

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

export async function resolveAssignee(
  env: Env,
  body: { assigneeUserId?: number | string | null; assigneeEmail?: string | null },
): Promise<{ id: number; email: string } | null> {
  if (body.assigneeUserId === null || body.assigneeEmail === null) {
    return null;
  }

  const allowedEmails = parseAllowedEmails(env.ALLOWED_GOOGLE_EMAILS);
  let user: { id: number; email: string } | null = null;

  if (body.assigneeUserId !== undefined) {
    user = await env.DB.prepare(
      `
      SELECT id, email
      FROM users
      WHERE id = ?
      `,
    )
      .bind(Number(body.assigneeUserId))
      .first<{ id: number; email: string }>();
  } else if (body.assigneeEmail) {
    user = await env.DB.prepare(
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
