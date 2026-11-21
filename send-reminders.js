importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDmfx8Nhi-Kkx6voN9vt4QIIUsSd3cRxuA",
  authDomain: "agenda-34c88.firebaseapp.com",
  databaseURL: "https://agenda-34c88-default-rtdb.firebaseio.com",
  projectId: "agenda-34c88",
  storageBucket: "agenda-34c88.firebasestorage.app",
  messagingSenderId: "849353479073",
  appId: "1:849353479073:web:b4a33b750ed7c500eff1e0"
});

const messaging = firebase.messaging();
const PLANNER_URL = 'https://zoebastidas26-sketch.github.io/Planner2027/';

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || '🖤 Kuromi Planner';
  const tag = data.tag || `kuromi-${Date.now()}`;

  return self.registration.showNotification(title, {
    body: data.body || 'Tienes un recordatorio pendiente en tu agenda.',
    icon: data.icon || 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png',
    badge: data.icon || 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || PLANNER_URL }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || PLANNER_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(PLANNER_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
