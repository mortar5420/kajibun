import type { TaskResponse, TaskRow } from "./types";

export function toTaskResponse(task: TaskRow): TaskResponse {
  return {
    id: String(task.id),
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    dueDate: task.due_date,
    intervalDays: task.interval_days,
    assignee: task.assignee_name ?? task.assignee_email,
    assigneeUserId: task.assignee_user_id === null ? null : String(task.assignee_user_id),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}
