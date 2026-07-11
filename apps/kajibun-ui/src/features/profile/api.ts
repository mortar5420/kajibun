import { ApiError, apiUrl, request } from '../../shared/api/request';
import type { User } from '../../types/user';

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
    return normalizeUser(data.user);
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

  return normalizeUser(data.user);
}

export async function uploadCurrentUserAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.set('avatar', file);

  const data = await request<{ user: UserResponse }>('/me/avatar', {
    method: 'POST',
    body: formData,
  });

  return normalizeUser(data.user);
}

export async function deleteCurrentUserAvatar(): Promise<User | null> {
  const data = await request<{ user: UserResponse | null }>('/me/avatar', {
    method: 'DELETE',
  });

  return data.user ? normalizeUser(data.user) : null;
}

function normalizeUser(user: UserResponse): User {
  return {
    ...user,
    id: String(user.id),
  };
}
