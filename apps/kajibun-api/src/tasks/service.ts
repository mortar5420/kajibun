import type { CurrentUser } from "../auth/types";
import { isAllowedEmail, parseAllowedEmails } from "../auth/policy";
import { getTodayDateString } from "../shared/date";
import { httpError } from "../shared/errors";
import { applyTaskDetails, completeTask } from "./domain";
import { dispatchTaskEvents } from "./event-handlers";
import type { TaskEventHandler } from "./event-handlers";
import type { TaskRepository } from "./repository";
import type { UserLookup } from "./types";
import type { Task, TaskDetails } from "./domain";

export type TaskDetailsInput = Partial<TaskDetails>;

export type AssigneeInput = {
  assigneeUserId?: number | string | null;
  assigneeEmail?: string | null;
};

export type TaskUseCaseOptions = {
  eventHandlers?: TaskEventHandler[];
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
  allowedEmailsConfig: string | undefined,
  actor: CurrentUser,
  taskId: number,
  options: TaskUseCaseOptions = {},
): Promise<Task> {
  const task = await getExistingTask(repository, taskId);
  const nextAssignee = await resolveNextAssignee(repository, allowedEmailsConfig, actor.id);
  const completion = completeTask(task, getTodayDateString(), nextAssignee.id);

  await repository.updateCompletion(taskId, completion);
  await dispatchTaskEvents(
    repository,
    [
      {
        type: "TaskCompleted",
        taskId,
        actorUserId: actor.id,
        payload: {
          title: task.title,
          fromAssigneeUserId: task.assigneeUserId,
          toAssigneeUserId: nextAssignee.id,
          nextDueDate: completion.nextDueDate,
        },
      },
    ],
    options.eventHandlers,
  );

  return getExistingTask(repository, taskId);
}

async function resolveNextAssignee(
  repository: TaskRepository,
  allowedEmailsConfig: string | undefined,
  actorUserId: number,
): Promise<UserLookup> {
  const allowedEmails = Array.from(parseAllowedEmails(allowedEmailsConfig));
  const users = await repository.findUsersByEmails(allowedEmails);
  const nextAssignee = users.find((user) => user.id !== actorUserId);

  if (!nextAssignee) {
    throw httpError("next_assignee_not_found", "The other allowed user was not found", 404);
  }

  return nextAssignee;
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
