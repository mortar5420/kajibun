import type { CurrentUser } from "../auth/types";
import { isAllowedEmail } from "../auth/policy";
import { getTodayDateString } from "../shared/date";
import { httpError } from "../shared/errors";
import { applyTaskDetails, completeTask } from "./domain";
import { dispatchTaskEvents } from "./event-handlers";
import type { TaskRepository } from "./repository";
import type { TaskStatus, UserLookup } from "./types";
import type { Task, TaskDetails } from "./domain";

export type TaskDetailsInput = Partial<TaskDetails>;

export type AssigneeInput = {
  assigneeUserId?: number | string | null;
  assigneeEmail?: string | null;
};

export type CompleteTaskInput = {
  completed?: boolean;
  status?: TaskStatus;
};

export async function listTaskUseCase(repository: TaskRepository): Promise<Task[]> {
  return repository.list();
}

export async function createTaskUseCase(
  repository: TaskRepository,
  actor: CurrentUser,
  input: TaskDetails,
): Promise<Task> {
  const taskId = await repository.insert(input);

  await dispatchTaskEvents(repository, [
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

  return getExistingTask(repository, taskId);
}

export async function updateTaskUseCase(
  repository: TaskRepository,
  actor: CurrentUser,
  taskId: number,
  input: TaskDetailsInput,
): Promise<Task> {
  const task = await getExistingTask(repository, taskId);
  const next = applyTaskDetails(task, input);

  await repository.updateDetails(taskId, next);
  await dispatchTaskEvents(repository, [
    {
      type: "TaskUpdated",
      taskId,
      actorUserId: actor.id,
      payload: {
        from: {
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
          intervalDays: task.intervalDays,
        },
        to: next,
      },
    },
  ]);

  return getExistingTask(repository, taskId);
}

export async function deleteTaskUseCase(repository: TaskRepository, actor: CurrentUser, taskId: number): Promise<void> {
  const task = await getExistingTask(repository, taskId);

  await dispatchTaskEvents(repository, [
    {
      type: "TaskDeleted",
      taskId,
      actorUserId: actor.id,
      payload: {
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        intervalDays: task.intervalDays,
        status: task.status,
        assigneeUserId: task.assigneeUserId,
      },
    },
  ]);

  await repository.markDeleted(taskId);
}

export async function reassignTaskUseCase(
  repository: TaskRepository,
  allowedEmailsConfig: string | undefined,
  actor: CurrentUser,
  taskId: number,
  input: AssigneeInput,
): Promise<Task> {
  const assignee = await resolveAssignee(repository, allowedEmailsConfig, input);
  const task = await getExistingTask(repository, taskId);

  await repository.updateAssignee(taskId, assignee?.id ?? null);
  await dispatchTaskEvents(repository, [
    {
      type: "TaskReassigned",
      taskId,
      actorUserId: actor.id,
      payload: {
        fromUserId: task.assigneeUserId,
        toUserId: assignee?.id ?? null,
      },
    },
  ]);

  return getExistingTask(repository, taskId);
}

export async function completeTaskUseCase(
  repository: TaskRepository,
  actor: CurrentUser,
  taskId: number,
  input: CompleteTaskInput,
): Promise<Task> {
  const task = await getExistingTask(repository, taskId);
  const nextStatus = input.status ?? (input.completed === false ? "todo" : "done");
  if (nextStatus !== "todo" && nextStatus !== "done") {
    throw httpError("invalid_status", "Task status must be todo or done", 400);
  }

  const completion = completeTask(task, nextStatus, getTodayDateString());

  await repository.updateStatus(taskId, completion);
  await dispatchTaskEvents(repository, [
    {
      type: nextStatus === "done" ? "TaskCompleted" : "TaskReopened",
      taskId,
      actorUserId: actor.id,
      payload: {
        fromStatus: task.status,
        toStatus: nextStatus,
        clearedAssigneeUserId: completion.clearedAssigneeUserId,
        nextDueDate: completion.nextDueDate,
      },
    },
  ]);

  return getExistingTask(repository, taskId);
}

async function resolveAssignee(
  repository: TaskRepository,
  allowedEmailsConfig: string | undefined,
  input: AssigneeInput,
): Promise<UserLookup | null> {
  if (input.assigneeUserId === null || input.assigneeEmail === null) {
    return null;
  }

  let user: UserLookup | null = null;

  if (input.assigneeUserId !== undefined) {
    user = await repository.findUserById(Number(input.assigneeUserId));
  } else if (input.assigneeEmail) {
    user = await repository.findUserByEmail(input.assigneeEmail);
  } else {
    throw httpError("invalid_assignee", "assigneeUserId or assigneeEmail is required", 400);
  }

  if (!user) {
    throw httpError("assignee_not_found", "Assignee user not found", 404);
  }

  if (!isAllowedEmail(user.email, allowedEmailsConfig)) {
    throw httpError("invalid_assignee", "Assignee is not an allowed user", 400);
  }

  return user;
}

async function getExistingTask(repository: TaskRepository, taskId: number): Promise<Task> {
  const task = await repository.findById(taskId);
  if (!task) {
    throw httpError("task_not_found", "Task not found", 404);
  }

  return task;
}
