self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('kajibun', {
      body: '家事の通知があります。',
      icon: '/vite.svg',
      badge: '/vite.svg',
      data: {
        url: '/',
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
