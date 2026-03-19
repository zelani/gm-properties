import { useState, useEffect, useCallback } from 'react'
import { getToken, onMessage }              from 'firebase/messaging'
import { doc, setDoc, serverTimestamp }     from 'firebase/firestore'
import { messagingPromise }                 from '../firebase'
import { db }                               from '../firebase'

const VAPID_KEY = 'BH0WqwsibHm1EvNWi99ZxO8CEYmgWTRxrkIXGbT2xzfG2OLrz9MCj8p-7YG1Kuqqi69PBB-yGIRPSnhs_i91y_g'

// ── Detect Safari iOS PWA ─────────────────────────────────
function isSafariIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
  const isStandalone = window.navigator.standalone === true
  return isIOS && (isSafari || isStandalone)
}

// ── Convert VAPID base64 to Uint8Array for native push ───
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// ── Save token to Firestore ───────────────────────────────
async function saveFCMToken(uid, token, projectId, flatNumber, role, tokenType = 'fcm') {
  if (!uid || !token) return
  try {
    await setDoc(doc(db, 'fcmTokens', uid), {
      token,
      tokenType,   // 'fcm' or 'safari'
      uid,
      projectId:  projectId  || null,
      flatNumber: flatNumber || null,
      role:       role       || 'resident',
      updatedAt:  serverTimestamp(),
    })
    console.log('[Push] Token saved to Firestore:', tokenType)
  } catch (e) {
    console.error('[Push] Failed to save token:', e)
  }
}

export function usePushNotifications({ uid, projectId, flatNumber, role }) {
  const [permission,   setPermission]   = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const [token,        setToken]        = useState(null)
  const [notification, setNotification] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [debugMsg,     setDebugMsg]     = useState('')

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setDebugMsg('Notifications not supported on this browser')
      return false
    }
    setLoading(true)
    setDebugMsg('Requesting permission...')

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      setDebugMsg('Permission: ' + result)

      if (result !== 'granted') {
        setLoading(false)
        return false
      }

      // ── Path 1: Safari iOS PWA ───────────────────────────
      // Firebase Messaging doesn't work on Safari — use native Web Push API
      if (isSafariIOS()) {
        setDebugMsg('Safari iOS detected — using Web Push API...')
        try {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setDebugMsg('Push not supported on this Safari version (need iOS 16.4+)')
            setLoading(false)
            return false
          }

          // Register service worker
          const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
          await navigator.serviceWorker.ready
          setDebugMsg('Service worker ready')

          // Subscribe to push
          const sub = await swReg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
          })

          // Convert subscription to string token for storage
          const subStr = JSON.stringify(sub.toJSON())
          setToken(subStr)
          await saveFCMToken(uid, subStr, projectId, flatNumber, role, 'safari')
          setDebugMsg('✅ Safari push subscription saved!')
          setLoading(false)
          return true
        } catch (safariErr) {
          setDebugMsg('Safari push error: ' + safariErr.message)
          console.error('[Push] Safari error:', safariErr)
          setLoading(false)
          return false
        }
      }

      // ── Path 2: Chrome / Android / Desktop (FCM) ────────
      setDebugMsg('Getting FCM token...')
      const messaging = await messagingPromise
      if (!messaging) {
        setDebugMsg('FCM messaging not available on this browser')
        setLoading(false)
        return false
      }

      const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY })
      if (fcmToken) {
        setToken(fcmToken)
        await saveFCMToken(uid, fcmToken, projectId, flatNumber, role, 'fcm')
        setDebugMsg('✅ FCM token saved!')
      } else {
        setDebugMsg('No FCM token returned — check VAPID key and service worker')
      }
      setLoading(false)
      return !!fcmToken

    } catch (err) {
      console.error('[FCM] Error:', err)
      setDebugMsg('Error: ' + err.message)
      setLoading(false)
      return false
    }
  }, [uid, projectId, flatNumber, role])

  // Auto-request if already granted on mount
  useEffect(() => {
    if (!uid) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      requestPermission()
    }
  }, [uid])

  // Listen for foreground messages (FCM only — Safari handles via SW)
  useEffect(() => {
    let unsub = () => {}
    messagingPromise.then(messaging => {
      if (!messaging) return
      unsub = onMessage(messaging, (payload) => {
        console.log('[FCM] Foreground message:', payload)
        const { title, body, icon } = payload.notification || {}
        setNotification({ title, body, icon, data: payload.data, id: Date.now() })
        setTimeout(() => setNotification(null), 8000)
      })
    }).catch(() => {})
    return () => unsub()
  }, [])

  return { permission, token, notification, loading, debugMsg, requestPermission, setNotification }
}
