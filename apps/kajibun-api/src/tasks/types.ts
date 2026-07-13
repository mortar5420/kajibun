export type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  interval_days: number;
  assignee_user_id: number | null;
  assignee_email: string | null;
  assignee_name: string | null;
  assignee_picture_url: string | null;
  assignee_avatar_object_key: string | null;
  assignee_avatar_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserLookup = {
  id: number;
  email: string;
};

export type TaskInput = {
  title?: unknown;
  description?: unknown;
  dueDate?: unknown;
  intervalDays?: unknown;
};

export type TaskResponse = {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  intervalDays: number;
  assignee: string | null;
  assigneeUserId: string | null;
  assigneePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
