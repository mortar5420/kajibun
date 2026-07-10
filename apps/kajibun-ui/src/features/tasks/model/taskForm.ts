import type { Task } from '../../../types/task';
import type { TaskInput } from '../api';

const DEFAULT_INTERVAL_DAYS = 1;

export type TaskFormState = Omit<TaskInput, 'intervalDays'> & {
  intervalDaysText: string;
};

export const emptyTaskFormState: TaskFormState = {
  title: '',
  description: '',
  dueDate: '',
  intervalDaysText: String(DEFAULT_INTERVAL_DAYS),
};

export function taskToFormState(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? '',
    dueDate: task.dueDate ?? '',
    intervalDaysText: String(task.intervalDays),
  };
}

export function normalizeTaskForm(form: TaskFormState): TaskInput {
  const intervalDays = Number(form.intervalDaysText);

  return {
    title: form.title.trim(),
    description: form.description?.trim() ? form.description.trim() : null,
    dueDate: form.dueDate?.trim() ? form.dueDate.trim() : null,
    intervalDays: Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : DEFAULT_INTERVAL_DAYS,
  };
}
