import { request } from '../../shared/api/request';
import type { Task, TaskStatus } from '../../types/task';

export type TaskInput = {
  title: string;
  description: string | null;
  dueDate: string | null;
  intervalDays: number;
};

export async function getTasks(): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>('/tasks');
  return data.tasks;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const data = await request<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return data.task;
}

export async function updateTask(taskId: string, input: TaskInput): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return data.task;
}

export async function deleteTask(taskId: string): Promise<void> {
  await request<{ ok: boolean }>(`/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export async function reassignTask(taskId: string, assigneeUserId: string | null): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${taskId}/assignee`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeUserId }),
  });

  return data.task;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${taskId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  return data.task;
}
