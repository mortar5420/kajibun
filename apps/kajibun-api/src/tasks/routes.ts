import { getCurrentUserOrResponse } from "../auth/http";
import { createWebPushSender } from "../adapters/push/web-push";
import { createD1Client } from "../adapters/persistence/d1";
import type { Env } from "../app/env";
import { createSqlNotificationRepository } from "../notifications/repository";
import { handleTaskNotificationEvent } from "../notifications/service";
import { readJsonBody } from "../shared/errors";
import { toTaskResponse } from "./mapper";
import { createSqlTaskRepository } from "./repository";
import {
  completeTaskUseCase,
  createTaskUseCase,
  deleteTaskUseCase,
  listTaskUseCase,
  reassignTaskUseCase,
  updateTaskUseCase,
} from "./service";
import { parseCreateTaskInput, parseUpdateTaskInput } from "./validation";
import type { TaskInput, TaskStatus } from "./types";

export async function handleListTasks(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const user = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (user instanceof Response) {
    return user;
  }

  const tasks = await listTaskUseCase(taskRepository);

  return Response.json({
    tasks: tasks.map(toTaskResponse),
  });
}

export async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseCreateTaskInput(body);
  const task = await createTaskUseCase(taskRepository, actor, input);

  return Response.json(
    {
      task: toTaskResponse(task),
    },
    {
      status: 201,
    },
  );
}

export async function handleUpdateTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseUpdateTaskInput(body);
  const updatedTask = await updateTaskUseCase(taskRepository, actor, taskId, input);

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}

export async function handleDeleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }

  await deleteTaskUseCase(taskRepository, actor, taskId);

  return Response.json({
    ok: true,
  });
}

export async function handleReassignTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ assigneeUserId?: number | string | null; assigneeEmail?: string | null }>(request);
  const updatedTask = await reassignTaskUseCase(taskRepository, env.ALLOWED_GOOGLE_EMAILS, actor, taskId, body);

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}

export async function handleCompleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const db = createD1Client(env.DB);
  const taskRepository = createSqlTaskRepository(db);
  const notificationRepository = createSqlNotificationRepository(db);
  const pushSender = createWebPushSender({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  });
  const actor = await getCurrentUserOrResponse(request, {
    db,
    sessionSecret: env.SESSION_SECRET,
  });
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ completed?: boolean; status?: TaskStatus }>(request);
  const updatedTask = await completeTaskUseCase(taskRepository, actor, taskId, body, {
    eventHandlers: [
      (event) =>
        handleTaskNotificationEvent(event, {
          notificationRepository,
          pushSender,
          allowedEmailsConfig: env.ALLOWED_GOOGLE_EMAILS,
        }),
    ],
  });

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}
