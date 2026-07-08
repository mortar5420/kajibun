export type TaskStatus = 'todo' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  intervalDays: number;
  assignee: string | null;
  assigneeUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
