self.addEventListener('push', (event) => {
  const notification = getNotificationPayload(event);

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        url: notification.url,
      },
    }),
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

function getNotificationPayload(event) {
  try {
    const data = event.data?.json();
    if (data?.title && data?.body) {
      return data;
    }
  } catch {
    // Fall back to a generic notification when the push payload is unavailable.
  }

  return {
    title: 'kajibun',
    body: '家事の通知があります。',
    url: '/',
  };
}
