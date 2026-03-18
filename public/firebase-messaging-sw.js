// firebase-messaging-sw.js
// Place in /public folder — handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// ⚠️ Must match src/firebase.js exactly
firebase.initializeApp({
  apiKey:            "AIzaSyAEzox72TcZM0pOZ3nmO_IWrJKhULUGm7I",
  authDomain:        "gm-properties-amir.firebaseapp.com",
  projectId:         "gm-properties-amir",
  storageBucket:     "gm-properties-amir.firebasestorage.app",
  messagingSenderId: "780755949257",
  appId:             "1:780755949257:web:f2c7c57d98bb9c8e5f9f18",
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload)
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || 'GM Property Hub', {
    body:    body  || 'You have a new notification',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     'gm-property',
    vibrate: [200, 100, 200],
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus()
      return clients.openWindow('/')
    })
  )
})
