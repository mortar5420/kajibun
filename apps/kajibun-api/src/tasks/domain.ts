import { addDaysToDate } from "../shared/date";

export type Task = {
  id: number;
  title: string;
  description: string | null;
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
  today: string,
  nextAssigneeUserId: number,
): {
  dueDate: string | null;
  assigneeUserId: number;
  nextDueDate: string | null;
} {
  const nextDueDate = addDaysToDate(today, task.intervalDays);

  return {
    dueDate: nextDueDate,
    assigneeUserId: nextAssigneeUserId,
    nextDueDate,
  };
}
