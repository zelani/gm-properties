// firebase-messaging-sw.js
// Place this file in your /public folder
// This service worker handles background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            "AIzaSyDfFxqIIuy6nlu6IH36-60ApgQuM6p8uE8",
  authDomain:        "gm-jelani-heights-80159.firebaseapp.com",
  projectId:         "gm-jelani-heights-80159",
  storageBucket:     "gm-jelani-heights-80159.firebasestorage.app",
  messagingSenderId: "689035838710",
  appId:             "1:689035838710:web:e0655bc63ee1c4ae29d8d7",
})

const messaging = firebase.messaging()

// Handle background messages (when app is not in foreground)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload)

  const { title, body, icon, data } = payload.notification || {}

  self.registration.showNotification(title || 'GM Property Hub', {
    body:    body  || 'You have a new notification',
    icon:    icon  || '/icons/icon-192.png',
    badge:        '/icons/icon-192.png',
    tag:          data?.tag || 'gm-property',
    data:         data || {},
    vibrate:      [200, 100, 200],
    actions: [
      { action: 'open',    title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss'  },
    ],
  })
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus()
      }
      return clients.openWindow('/')
    })
  )
})
