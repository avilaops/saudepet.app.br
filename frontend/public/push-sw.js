/* Handler de Web Push, importado pelo service worker gerado (workbox
 * importScripts). Recebe o payload JSON do backend e mostra a notificação;
 * o clique foca a aba existente ou abre a URL da notificação. */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Saúde Pet', body: event.data.text() };
  }
  const title = payload.title || 'Saúde Pet';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/notification-icon.png',
      tag: payload.tag || undefined,
      data: { url: payload.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abertas) => {
      for (const aba of abertas) {
        if ('focus' in aba) {
          aba.navigate(url);
          return aba.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
