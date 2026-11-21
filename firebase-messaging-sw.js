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
  const notif = payload.notification || {};
  const webNotif = (payload.webpush && payload.webpush.notification) || {};
  const dataPayload = payload.data || {};

  const title = notif.title || webNotif.title || dataPayload.title || '🖤 Kuromi Planner';
  const tag = webNotif.tag || dataPayload.tag || `kuromi-${Date.now()}`;
  const targetUrl =
    (payload.webpush && payload.webpush.fcmOptions && payload.webpush.fcmOptions.link) ||
    dataPayload.url ||
    PLANNER_URL;

  const options = {
    body: notif.body || webNotif.body || dataPayload.body || 'Tienes un recordatorio pendiente en tu agenda.',
    icon: notif.icon || webNotif.icon || 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png',
    tag,
    renotify: true,
    requireInteraction: true,
    data: { url: targetUrl }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || PLANNER_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(PLANNER_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
