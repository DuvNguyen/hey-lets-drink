// Service Worker for Hey Let's Drink PWA
const CACHE_NAME = 'hey-lets-drink-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for Push event from server
self.addEventListener('push', (event) => {
  let data = {
    title: 'Lịch uống thuốc',
    body: 'Đến giờ uống thuốc theo lịch hẹn.',
    tag: 'med-reminder',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'med-reminder',
    renotify: true,
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    actions: [
      { action: 'take', title: 'Xác nhận đã uống' },
      { action: 'close', title: 'Đóng' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle Notification Clicks & Action Buttons
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const medData = event.notification.data || {};
  const targetUrl = medData.url || '/';

  // If user clicked "Xác nhận đã uống" button directly on notification
  if (event.action === 'take' && medData.medicationId) {
    event.waitUntil(
      fetch(`/api/medications/${medData.medicationId}/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch((err) => console.error('Error confirming dose from notification:', err))
    );
    return;
  }

  // Open or focus the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
