import { useState, useEffect, useCallback } from 'react'
import { getToken, onMessage }              from 'firebase/messaging'
import { doc, setDoc, serverTimestamp }     from 'firebase/firestore'
import { messagingPromise }                 from '../firebase'
import { db }                              from '../firebase'

const VAPID_KEY = 'BH0WqwsibHm1EvNWi99ZxO8CEYmgWTRxrkIXGbT2xzfG2OLrz9MCj8p-7YG1Kuqqi69PBB-yGIRPSnhs_i91y_g'

// Save FCM token to Firestore under /fcmTokens/{uid}
async function saveFCMToken(uid, token, projectId, flatNumber, role) {
  if (!uid || !token) return
  await setDoc(doc(db, 'fcmTokens', uid), {
    token,
    uid,
    projectId:  projectId  || null,
    flatNumber: flatNumber || null,
    role:       role       || 'resident',
    updatedAt:  serverTimestamp(),
  })
}

export function usePushNotifications({ uid, projectId, flatNumber, role }) {
const [permission, setPermission] = useState(
  typeof Notification !== 'undefined' ? Notification.permission : 'denied'
)
  const [token,         setToken]         = useState(null)
  const [notification,  setNotification]  = useState(null)  // latest foreground message
  const [loading,       setLoading]       = useState(false)

  // Request permission and get token
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false
    setLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        setLoading(false)
        return false
      }

      const messaging = await messagingPromise
      if (!messaging) { setLoading(false); return false }

      const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY })
      if (fcmToken) {
        setToken(fcmToken)
        await saveFCMToken(uid, fcmToken, projectId, flatNumber, role)
      }
      setLoading(false)
      return true
    } catch (err) {
      console.error('[FCM] Error getting token:', err)
      setLoading(false)
      return false
    }
  }, [uid, projectId, flatNumber, role])

  // Auto-request if already granted (refresh token on mount)
  useEffect(() => {
    if (!uid) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      requestPermission()
    }
  }, [uid])

  // Listen for foreground messages
  useEffect(() => {
    let unsub = () => {}
    messagingPromise.then(messaging => {
      if (!messaging) return
      unsub = onMessage(messaging, (payload) => {
        console.log('[FCM] Foreground message:', payload)
        const { title, body, icon } = payload.notification || {}
        setNotification({ title, body, icon, data: payload.data, id: Date.now() })

        // Auto-dismiss after 8 seconds
        setTimeout(() => setNotification(null), 8000)
      })
    })
    return () => unsub()
  }, [])

  return { permission, token, notification, loading, requestPermission, setNotification }
}
