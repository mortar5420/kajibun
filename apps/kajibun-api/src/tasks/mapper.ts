import type { Task } from "./domain";
import type { TaskResponse, TaskRow } from "./types";

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    intervalDays: row.interval_days,
    assigneeUserId: row.assignee_user_id,
    assigneeEmail: row.assignee_email,
    assigneeName: row.assignee_name,
    assigneePictureUrl: row.assignee_picture_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTaskResponse(task: Task): TaskResponse {
  return {
    id: String(task.id),
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    dueDate: task.dueDate,
    intervalDays: task.intervalDays,
    assignee: task.assigneeName ?? task.assigneeEmail,
    assigneeUserId: task.assigneeUserId === null ? null : String(task.assigneeUserId),
    assigneePictureUrl: task.assigneePictureUrl,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
