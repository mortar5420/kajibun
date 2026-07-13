export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  intervalDays: number;
  assignee: string | null;
  assigneeUserId: string | null;
  assigneePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
