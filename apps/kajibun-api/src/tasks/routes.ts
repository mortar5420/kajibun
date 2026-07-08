import { getCurrentUserOrResponse } from "../auth/service";
import type { Env } from "../app/env";
import { addDaysToDate, getTodayDateString } from "../shared/date";
import { jsonError, readJsonBody } from "../shared/errors";
import { toTaskResponse } from "./mapper";
import { findTask, listTasks, recordTaskEvent, resolveAssignee } from "./repository";
import { parseTaskInput } from "./validation";
import type { TaskInput, TaskStatus } from "./types";

export async function handleListTasks(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUserOrResponse(request, env);
  if (user instanceof Response) {
    return user;
  }

  const tasks = await listTasks(env.DB);

  return Response.json({
    tasks: tasks.map(toTaskResponse),
  });
}

export async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseTaskInput(body, { partial: false });

  const result = await env.DB.prepare(
    `
    INSERT INTO tasks (title, description, status, due_date, interval_days, assignee_user_id, created_at, updated_at)
    VALUES (?, ?, 'todo', ?, ?, NULL, datetime('now'), datetime('now'))
    `,
  )
    .bind(input.title, input.description, input.dueDate, input.intervalDays)
    .run();
  const taskId = result.meta.last_row_id;

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskCreated",
    payload: {
      title: input.title,
      dueDate: input.dueDate,
      intervalDays: input.intervalDays,
    },
  });

  const task = await findTask(env.DB, taskId);

  return Response.json(
    {
      task: toTaskResponse(task!),
    },
    {
      status: 201,
    },
  );
}

export async function handleUpdateTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const task = await findTask(env.DB, taskId);
  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseTaskInput(body, { partial: true });
  const nextTitle = input.title ?? task.title;
  const nextDescription = input.description !== undefined ? input.description : task.description;
  const nextDueDate = input.dueDate !== undefined ? input.dueDate : task.due_date;
  const nextIntervalDays = input.intervalDays !== undefined ? input.intervalDays : task.interval_days;

  await env.DB.prepare(
    `
    UPDATE tasks
    SET title = ?, description = ?, due_date = ?, interval_days = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(nextTitle, nextDescription, nextDueDate, nextIntervalDays, taskId)
    .run();

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskUpdated",
    payload: {
      from: {
        title: task.title,
        description: task.description,
        dueDate: task.due_date,
        intervalDays: task.interval_days,
      },
      to: {
        title: nextTitle,
        description: nextDescription,
        dueDate: nextDueDate,
        intervalDays: nextIntervalDays,
      },
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}

export async function handleDeleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const task = await findTask(env.DB, taskId);
  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskDeleted",
    payload: {
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      intervalDays: task.interval_days,
      status: task.status,
      assigneeUserId: task.assignee_user_id,
    },
  });

  await env.DB.prepare(
    `
    UPDATE tasks
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(taskId)
    .run();

  return Response.json({
    ok: true,
  });
}

export async function handleReassignTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ assigneeUserId?: number | string | null; assigneeEmail?: string | null }>(request);
  const assignee = await resolveAssignee(env, body);
  const task = await findTask(env.DB, taskId);

  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  await env.DB.prepare(
    `
    UPDATE tasks
    SET assignee_user_id = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  )
    .bind(assignee?.id ?? null, taskId)
    .run();

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: "TaskReassigned",
    payload: {
      fromUserId: task.assignee_user_id,
      toUserId: assignee?.id ?? null,
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}

export async function handleCompleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ completed?: boolean; status?: TaskStatus }>(request);
  const task = await findTask(env.DB, taskId);

  if (!task) {
    return jsonError("task_not_found", "Task not found", 404);
  }

  const nextStatus = body.status ?? (body.completed === false ? "todo" : "done");
  if (nextStatus !== "todo" && nextStatus !== "done") {
    return jsonError("invalid_status", "Task status must be todo or done", 400);
  }

  if (nextStatus === "todo") {
    await env.DB.prepare(
      `
      UPDATE tasks
      SET status = ?, assignee_user_id = NULL, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
      .bind(nextStatus, taskId)
      .run();
  } else {
    const nextDueDate = addDaysToDate(getTodayDateString(), task.interval_days);
    await env.DB.prepare(
      `
      UPDATE tasks
      SET status = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
      `,
    )
      .bind(nextStatus, nextDueDate, taskId)
      .run();
  }

  await recordTaskEvent(env.DB, {
    taskId,
    actorUserId: actor.id,
    eventType: nextStatus === "done" ? "TaskCompleted" : "TaskReopened",
    payload: {
      fromStatus: task.status,
      toStatus: nextStatus,
      clearedAssigneeUserId: nextStatus === "todo" ? task.assignee_user_id : null,
      nextDueDate: nextStatus === "done" ? addDaysToDate(getTodayDateString(), task.interval_days) : null,
    },
  });

  const updatedTask = await findTask(env.DB, taskId);

  return Response.json({
    task: toTaskResponse(updatedTask!),
  });
}
