import { getCurrentUserOrResponse } from "../auth/service";
import type { Env } from "../app/env";
import { readJsonBody } from "../shared/errors";
import { toTaskResponse } from "./mapper";
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
  const user = await getCurrentUserOrResponse(request, env);
  if (user instanceof Response) {
    return user;
  }

  const tasks = await listTaskUseCase(env.DB);

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
  const input = parseCreateTaskInput(body);
  const task = await createTaskUseCase(env.DB, actor, input);

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
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  const body = await readJsonBody<TaskInput>(request);
  const input = parseUpdateTaskInput(body);
  const updatedTask = await updateTaskUseCase(env.DB, actor, taskId, input);

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}

export async function handleDeleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }

  await deleteTaskUseCase(env.DB, actor, taskId);

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
  const updatedTask = await reassignTaskUseCase(env.DB, env.ALLOWED_GOOGLE_EMAILS, actor, taskId, body);

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}

export async function handleCompleteTask(request: Request, env: Env, taskId: number): Promise<Response> {
  const actor = await getCurrentUserOrResponse(request, env);
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readJsonBody<{ completed?: boolean; status?: TaskStatus }>(request);
  const updatedTask = await completeTaskUseCase(env.DB, actor, taskId, body);

  return Response.json({
    task: toTaskResponse(updatedTask),
  });
}
