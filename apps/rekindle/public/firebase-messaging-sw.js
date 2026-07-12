/* public/firebase-messaging-sw.js
 * Background handler for Firebase Cloud Messaging web push.
 *
 * This is a classic service worker (no bundler), so it loads the Firebase
 * "compat" builds from gstatic and reads the PUBLIC web config from the query
 * string it was registered with (see usePushNotifications.ts). Firebase web
 * config is not secret, so passing it via the URL is fine.
 */
/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
const cfg = {
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId'),
};

try {
  if (cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId) {
    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();

    // Fired when a data/notification message arrives while the app is in the
    // background. FCM auto-displays `notification` payloads, so we only handle
    // the case explicitly to attach the deep-link and icon.
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      const data = payload.data || {};
      const title = n.title || data.title || 'ReKindle';
      self.registration.showNotification(title, {
        body: n.body || data.body || '',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        data: { url: data.link || data.url || '/' },
      });
    });
  } else {
    console.warn('[fcm-sw] missing Firebase config in registration URL');
  }
} catch (e) {
  console.error('[fcm-sw] init failed:', e && e.message);
}

// Focus an existing tab or open the deep link on click.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
