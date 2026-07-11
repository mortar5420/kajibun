import { ApiError, request } from '../shared/api/request';

export { ApiError } from '../shared/api/request';
export {
  deleteCurrentUserAvatar,
  getCurrentUser,
  getLoginUrl,
  logout,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from '../features/profile/api';
export type { UserProfileInput } from '../features/profile/api';
export {
  createTask,
  deleteTask,
  getTasks,
  reassignTask,
  updateTask,
  updateTaskStatus,
} from '../features/tasks/api';
export type { TaskInput } from '../features/tasks/api';

type VapidPublicKeyResponse = {
  publicKey: string | null;
};

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
