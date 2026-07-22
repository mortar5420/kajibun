import { Hono } from "hono";
import { createWebPushSender } from "../adapters/push/web-push";
import { createDb, readJson, requireCurrentUser } from "../app/context";
import type { AppHonoContext } from "../app/context";
import { createSqlNotificationRepository } from "../notifications/repository";
import { handleTaskNotificationEvent } from "../notifications/service";
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
import type { TaskInput } from "./types";

export const tasksRoutes = new Hono<AppHonoContext>();

tasksRoutes.get("/", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  await requireCurrentUser(c, db);

  const tasks = await listTaskUseCase(taskRepository);

  return c.json({
    tasks: tasks.map(toTaskResponse),
  });
});

tasksRoutes.post("/", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await requireCurrentUser(c, db);

  const body = await readJson<TaskInput>(c);
  const input = parseCreateTaskInput(body);
  const task = await createTaskUseCase(taskRepository, actor, input);

  return c.json(
    {
      task: toTaskResponse(task),
    },
    {
      status: 201,
    },
  );
});

tasksRoutes.patch("/:taskId", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await requireCurrentUser(c, db);

  const taskId = Number(c.req.param("taskId"));
  const body = await readJson<TaskInput>(c);
  const input = parseUpdateTaskInput(body);
  const updatedTask = await updateTaskUseCase(taskRepository, actor, taskId, input);

  return c.json({
    task: toTaskResponse(updatedTask),
  });
});

tasksRoutes.delete("/:taskId", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await requireCurrentUser(c, db);

  const taskId = Number(c.req.param("taskId"));
  await deleteTaskUseCase(taskRepository, actor, taskId);

  return c.json({
    ok: true,
  });
});

tasksRoutes.patch("/:taskId/assignee", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  const actor = await requireCurrentUser(c, db);
  const taskId = Number(c.req.param("taskId"));
  const body = await readJson<{ assigneeUserId?: number | string | null; assigneeEmail?: string | null }>(c);
  const updatedTask = await reassignTaskUseCase(taskRepository, c.env.ALLOWED_GOOGLE_EMAILS, actor, taskId, body);

  return c.json({
    task: toTaskResponse(updatedTask),
  });
});

tasksRoutes.patch("/:taskId/complete", async (c) => {
  const db = createDb(c);
  const taskRepository = createSqlTaskRepository(db);
  const notificationRepository = createSqlNotificationRepository(db);
  const pushSender = createWebPushSender({
    publicKey: c.env.VAPID_PUBLIC_KEY,
    privateKey: c.env.VAPID_PRIVATE_KEY,
    subject: c.env.VAPID_SUBJECT,
  });
  const actor = await requireCurrentUser(c, db);
  const taskId = Number(c.req.param("taskId"));
  const updatedTask = await completeTaskUseCase(taskRepository, c.env.ALLOWED_GOOGLE_EMAILS, actor, taskId, {
    eventHandlers: [
      (event) =>
        handleTaskNotificationEvent(event, {
          notificationRepository,
          pushSender,
        }),
    ],
  });

  return c.json({
    task: toTaskResponse(updatedTask),
  });
});
