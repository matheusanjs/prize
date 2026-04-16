/* Prize Clube — Push Notification Service Worker */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* ─── Push event: display notification ─── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Prize Clube', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || 'prize-clube',
    data: payload.data || {},
    actions: payload.actions || [],
    vibrate: [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Prize Clube', options)
  );
});

/* ─── Notification click: route to correct page ─── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Route based on data.url or infer from notification type
  if (data.url) {
    url = data.url;
  } else if (data.chargeId) {
    url = '/faturas';
  } else if (data.reservationId) {
    url = '/boats';
  } else if (data.swapId) {
    url = '/reservations';
  }

  // Handle action buttons
  if (event.action === 'confirm' && data.reservationId) {
    url = '/boats';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing window
      for (const client of clients) {
        if (new URL(client.url).pathname === url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no matching window, try any open window and navigate
      for (const client of clients) {
        if ('navigate' in client) {
          return client.navigate(url).then((c) => c && c.focus());
        }
      }
      // Last resort: open new window
      return self.clients.openWindow(url);
    })
  );
});
