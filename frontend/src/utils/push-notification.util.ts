/**
 * Utilitário de Notificações Web Push (PWA & Navegador)
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('⚠️ Notificações de navegador não suportadas neste dispositivo.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function showWebPushNotification(title: string, options: NotificationOptions = {}): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notificationOptions = {
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      ...options
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, notificationOptions);
      });
    } else {
      new Notification(title, notificationOptions);
    }
  } catch (err) {
    console.error('❌ Erro ao exibir notificação Web Push:', err);
  }
}
