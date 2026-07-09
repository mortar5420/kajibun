import { addDaysToDate } from "../shared/date";
import type { TaskStatus } from "./types";

export type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  intervalDays: number;
  assigneeUserId: number | null;
  assigneeEmail: string | null;
  assigneeName: string | null;
  assigneePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDetails = {
  title: string;
  description: string | null;
  dueDate: string | null;
  intervalDays: number;
};

export function applyTaskDetails(task: Task, input: Partial<TaskDetails>): TaskDetails {
  return {
    title: input.title ?? task.title,
    description: input.description !== undefined ? input.description : task.description,
    dueDate: input.dueDate !== undefined ? input.dueDate : task.dueDate,
    intervalDays: input.intervalDays !== undefined ? input.intervalDays : task.intervalDays,
  };
}

export function completeTask(
  task: Task,
  nextStatus: TaskStatus,
  today: string,
): {
  status: TaskStatus;
  dueDate: string | null;
  clearAssignee: boolean;
  clearedAssigneeUserId: number | null;
  nextDueDate: string | null;
} {
  if (nextStatus === "todo") {
    return {
      status: nextStatus,
      dueDate: null,
      clearAssignee: true,
      clearedAssigneeUserId: task.assigneeUserId,
      nextDueDate: null,
    };
  }

  const nextDueDate = addDaysToDate(today, task.intervalDays);

  return {
    status: nextStatus,
    dueDate: nextDueDate,
    clearAssignee: false,
    clearedAssigneeUserId: null,
    nextDueDate,
  };
}
