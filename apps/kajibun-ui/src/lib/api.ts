import type { Task, TaskStatus } from '../types/task';
import type { User } from '../types/user';
import { ApiError, apiUrl, request } from '../shared/api/request';

export { ApiError } from '../shared/api/request';

export type TaskInput = {
  title: string;
  description: string | null;
  dueDate: string | null;
  intervalDays: number;
};

type VapidPublicKeyResponse = {
  publicKey: string | null;
};

export type UserProfileInput = {
  name: string;
};

type UserResponse = Omit<User, 'id'> & {
  id: number | string;
};

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

export async function updateCurrentUserProfile(input: UserProfileInput): Promise<User> {
  const data = await request<{ user: UserResponse }>('/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return {
    ...data.user,
    id: String(data.user.id),
  };
}

export async function uploadCurrentUserAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.set('avatar', file);

  const data = await request<{ user: UserResponse }>('/me/avatar', {
    method: 'POST',
    body: formData,
  });

  return {
    ...data.user,
    id: String(data.user.id),
  };
}

export async function deleteCurrentUserAvatar(): Promise<User | null> {
  const data = await request<{ user: UserResponse | null }>('/me/avatar', {
    method: 'DELETE',
  });

  return data.user
    ? {
        ...data.user,
        id: String(data.user.id),
      }
    : null;
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

export async function getVapidPublicKey(): Promise<string | null> {
  const data = await request<VapidPublicKeyResponse>('/push/vapid-public-key');
  return data.publicKey;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await request<{ ok: boolean }>('/push-subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function sendTestPush(): Promise<void> {
  const data = await request<{ ok: boolean; status: 'sent' | 'failed' | 'pending' }>('/push/test', {
    method: 'POST',
  });
  if (!data.ok) {
    throw new ApiError(`Push test was not sent: ${data.status}`, 400, 'push_test_not_sent');
  }
}
