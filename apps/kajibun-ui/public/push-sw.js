self.addEventListener('push', (event) => {
  event.waitUntil(
    getNotificationPayload().then((notification) =>
      self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: '/vite.svg',
        badge: '/vite.svg',
        data: {
          url: notification.url,
        },
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }

      return self.clients.openWindow(url);
    }),
  );
});

async function getNotificationPayload() {
  try {
    const response = await fetch('/api/notifications/latest', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      if (data.notification?.title && data.notification?.body) {
        return data.notification;
      }
    }
  } catch {
    // Fall back to a generic notification when the app session is unavailable.
  }

  return {
    title: 'kajibun',
    body: '家事の通知があります。',
    url: '/',
  };
}
