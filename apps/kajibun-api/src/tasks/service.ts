import type { CurrentUser } from "../auth/types";
import { addDaysToDate, getTodayDateString } from "../shared/date";
import { httpError } from "../shared/errors";
import { dispatchTaskEvents } from "./event-handlers";
import {
  findTask,
  insertTask,
  listTasks,
  markTaskDeleted,
  resolveAssignee,
  updateTaskAssignee,
  updateTaskDetails,
  updateTaskStatus,
} from "./repository";
import type { TaskRow, TaskStatus } from "./types";

export type TaskDetailsInput = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  intervalDays?: number;
};

export type AssigneeInput = {
  assigneeUserId?: number | string | null;
  assigneeEmail?: string | null;
};

export type CompleteTaskInput = {
  completed?: boolean;
  status?: TaskStatus;
};

export async function listTaskUseCase(db: D1Database): Promise<TaskRow[]> {
  return listTasks(db);
}

export async function createTaskUseCase(
  db: D1Database,
  actor: CurrentUser,
  input: Required<TaskDetailsInput>,
): Promise<TaskRow> {
  const taskId = await insertTask(db, input);

  await dispatchTaskEvents(db, [
    {
      type: "TaskCreated",
      taskId,
      actorUserId: actor.id,
      payload: {
        title: input.title,
        dueDate: input.dueDate,
        intervalDays: input.intervalDays,
      },
    },
  ]);

  return getExistingTask(db, taskId);
}

export async function updateTaskUseCase(
  db: D1Database,
  actor: CurrentUser,
  taskId: number,
  input: TaskDetailsInput,
): Promise<TaskRow> {
  const task = await getExistingTask(db, taskId);
  const next = {
    title: input.title ?? task.title,
    description: input.description !== undefined ? input.description : task.description,
    dueDate: input.dueDate !== undefined ? input.dueDate : task.due_date,
    intervalDays: input.intervalDays !== undefined ? input.intervalDays : task.interval_days,
  };

  await updateTaskDetails(db, taskId, next);
  await dispatchTaskEvents(db, [
    {
      type: "TaskUpdated",
      taskId,
      actorUserId: actor.id,
      payload: {
        from: {
          title: task.title,
          description: task.description,
          dueDate: task.due_date,
          intervalDays: task.interval_days,
        },
        to: next,
      },
    },
  ]);

  return getExistingTask(db, taskId);
}

export async function deleteTaskUseCase(db: D1Database, actor: CurrentUser, taskId: number): Promise<void> {
  const task = await getExistingTask(db, taskId);

  await dispatchTaskEvents(db, [
    {
      type: "TaskDeleted",
      taskId,
      actorUserId: actor.id,
      payload: {
        title: task.title,
        description: task.description,
        dueDate: task.due_date,
        intervalDays: task.interval_days,
        status: task.status,
        assigneeUserId: task.assignee_user_id,
      },
    },
  ]);

  await markTaskDeleted(db, taskId);
}

export async function reassignTaskUseCase(
  db: D1Database,
  allowedEmailsConfig: string | undefined,
  actor: CurrentUser,
  taskId: number,
  input: AssigneeInput,
): Promise<TaskRow> {
  const assignee = await resolveAssignee(db, allowedEmailsConfig, input);
  const task = await getExistingTask(db, taskId);

  await updateTaskAssignee(db, taskId, assignee?.id ?? null);
  await dispatchTaskEvents(db, [
    {
      type: "TaskReassigned",
      taskId,
      actorUserId: actor.id,
      payload: {
        fromUserId: task.assignee_user_id,
        toUserId: assignee?.id ?? null,
      },
    },
  ]);

  return getExistingTask(db, taskId);
}

export async function completeTaskUseCase(
  db: D1Database,
  actor: CurrentUser,
  taskId: number,
  input: CompleteTaskInput,
): Promise<TaskRow> {
  const task = await getExistingTask(db, taskId);
  const nextStatus = input.status ?? (input.completed === false ? "todo" : "done");
  if (nextStatus !== "todo" && nextStatus !== "done") {
    throw httpError("invalid_status", "Task status must be todo or done", 400);
  }

  const today = getTodayDateString();
  const nextDueDate = nextStatus === "done" ? addDaysToDate(today, task.interval_days) : null;

  await updateTaskStatus(db, taskId, {
    status: nextStatus,
    dueDate: nextDueDate,
    clearAssignee: nextStatus === "todo",
  });
  await dispatchTaskEvents(db, [
    {
      type: nextStatus === "done" ? "TaskCompleted" : "TaskReopened",
      taskId,
      actorUserId: actor.id,
      payload: {
        fromStatus: task.status,
        toStatus: nextStatus,
        clearedAssigneeUserId: nextStatus === "todo" ? task.assignee_user_id : null,
        nextDueDate,
      },
    },
  ]);

  return getExistingTask(db, taskId);
}

async function getExistingTask(db: D1Database, taskId: number): Promise<TaskRow> {
  const task = await findTask(db, taskId);
  if (!task) {
    throw httpError("task_not_found", "Task not found", 404);
  }

  return task;
}
