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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '🖤 Kuromi Planner';
  const options = {
    body: payload.notification?.body || 'Tienes un recordatorio pendiente en tu agenda.',
    icon: 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png',
    data: { url: 'https://zoebastidas26-sketch.github.io/Planner2027/' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || 'https://zoebastidas26-sketch.github.io/Planner2027/')
  );
});
