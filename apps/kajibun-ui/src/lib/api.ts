import type { Task, TaskStatus } from '../types/task';
import type { User } from '../types/user';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type TaskInput = {
  title: string;
  description: string | null;
  dueDate: string | null;
  intervalDays: number;
};

type UserResponse = Omit<User, 'id'> & {
  id: number | string;
};

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Ignore non-JSON error responses.
    }

    throw new ApiError(
      body.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body.error?.code,
    );
  }

  return (await response.json()) as T;
}

export function getLoginUrl(): string {
  const returnTo = typeof window === 'undefined' ? '' : `?return_to=${encodeURIComponent(window.location.origin)}`;
  return apiUrl(`/auth/login${returnTo}`);
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const data = await request<{ user: UserResponse }>('/me');
    return {
      ...data.user,
      id: String(data.user.id),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  });
}

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
