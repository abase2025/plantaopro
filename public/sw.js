/* PlantãoPro — Service Worker para Web Push notifications.
   O backend envia o payload via web-push; aqui escutamos e mostramos a notificação. */

self.addEventListener('push', function (event) {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { title: 'PlantãoPro', body: event.data.text() }; }
  const title = data.title || 'PlantãoPro';
  const options = {
    body: data.body || '',
    icon: 'https://abase2025.github.io/plantoopro/favicon.ico',
    badge: 'https://abase2025.github.io/plantoopro/favicon.ico',
    data: data.data || {},
    tag: 'plantaopro-' + (data.data?.plantaoId || 'x'),
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const plantaoId = event.notification.data?.plantaoId;
  const url = 'https://abase2025.github.io/plantoopro/#/dashboard' + (plantaoId ? '?p=' + plantaoId : '');
  event.waitUntil(clients.matchAll({ type: 'window' }).then(function (clientList) {
    for (const c of clientList) { if (c.url.includes('plantoopro') && 'focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
self.addEventListener('install', function (event) { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
