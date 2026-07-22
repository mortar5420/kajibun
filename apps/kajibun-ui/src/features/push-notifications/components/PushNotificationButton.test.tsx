import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { getVapidPublicKey, sendTestPush, subscribePush } from '../api';
import { PushNotificationButton } from './PushNotificationButton';

vi.mock('../api', () => ({
  getVapidPublicKey: vi.fn(),
  sendTestPush: vi.fn(),
  subscribePush: vi.fn(),
}));

const subscriptionJson = {
  endpoint: 'https://push.example.test/send/abc',
  keys: {
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  },
};

let showNotification: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVapidPublicKey).mockResolvedValue('vapid-public-key');
  vi.mocked(sendTestPush).mockResolvedValue();
  vi.mocked(subscribePush).mockResolvedValue();

  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    },
  });

  showNotification = vi.fn().mockResolvedValue(undefined);
  const registration = {
    showNotification,
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue({
        toJSON: () => subscriptionJson,
      }),
      subscribe: vi.fn(),
    },
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
});

test('syncs an existing browser push subscription before sending a test notification', async () => {
  render(<PushNotificationButton />);

  await userEvent.click(await screen.findByRole('button', { name: 'テスト通知を送信' }));

  await waitFor(() => expect(sendTestPush).toHaveBeenCalledTimes(1));
  expect(subscribePush).toHaveBeenCalledWith(subscriptionJson);
  expect(vi.mocked(subscribePush).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(sendTestPush).mock.invocationCallOrder[0],
  );
});

test('shows a local notification from the service worker registration', async () => {
  render(<PushNotificationButton />);

  await userEvent.click(await screen.findByRole('button', { name: '端末通知テスト' }));

  await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
  expect(showNotification).toHaveBeenCalledWith('kajibun 端末通知テスト', {
    body: '端末側で通知表示できるかのテストです。',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: {
      url: '/',
    },
  });
  expect(sendTestPush).not.toHaveBeenCalled();
});
