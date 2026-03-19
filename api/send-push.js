// api/send-push.js
// Vercel Serverless Function — sends FCM (Android/Chrome) and Web Push (Safari iOS)

import { GoogleAuth } from 'google-auth-library'
import webpush        from 'web-push'

const PROJECT_ID    = 'gm-properties-amir'
const VAPID_PUBLIC  = 'BH0WqwsibHm1EvNWi99ZxO8CEYmgWTRxrkIXGbT2xzfG2OLrz9MCj8p-7YG1Kuqqi69PBB-yGIRPSnhs_i91y_g'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY

async function getAccessToken() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON env var not set')
  const serviceAccount = JSON.parse(raw)
  const auth   = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })
  const client = await auth.getClient()
  const t      = await client.getAccessToken()
  return t.token
}

async function sendFCM(token, title, body, type, data, accessToken) {
  const payload = {
    message: {
      token,
      notification: { title: title || 'GM Property Hub', body: body || '' },
      data: { type: type || 'notice' },
      webpush: {
        notification: {
          title: title || 'GM Property Hub',
          body:  body  || '',
          icon:  '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        fcm_options: { link: '/' },
      },
    },
  }
  console.log('[FCM] Sending to token:', token.slice(0, 20) + '...')
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  )
  const responseText = await response.text()
  console.log('[FCM] Response:', response.status, responseText.slice(0, 200))
  return response.ok
}

async function sendWebPush(subscriptionStr, title, body, type) {
  console.log('[WebPush] VAPID_PRIVATE set:', !!VAPID_PRIVATE)
  if (!VAPID_PRIVATE) {
    console.error('[WebPush] VAPID_PRIVATE_KEY env var not set in Vercel')
    return false
  }
  try {
    webpush.setVapidDetails('mailto:admin@gmproperties.com', VAPID_PUBLIC, VAPID_PRIVATE)
    let subscription
    try {
      subscription = JSON.parse(subscriptionStr)
    } catch (e) {
      console.error('[WebPush] Failed to parse subscription:', subscriptionStr.slice(0, 100))
      return false
    }
    console.log('[WebPush] Endpoint:', subscription.endpoint?.slice(0, 60) + '...')
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || 'GM Property Hub',
        body:  body  || '',
        icon:  '/icons/icon-192.png',
        data:  { type },
      })
    )
    console.log('[WebPush] ✅ Sent successfully')
    return true
  } catch (err) {
    console.error('[WebPush] Error:', err.statusCode, err.message)
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { tokens, title, body, type, data = {} } = req.body
  console.log('[Push] Received — tokens:', tokens?.length, 'title:', title, 'type:', type)

  if (!tokens || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' })
  }

  try {
    const hasFCM    = tokens.some(t => t.token?.trim() && !t.token.trim().startsWith('{'))
    const hasSafari = tokens.some(t => t.token?.trim().startsWith('{') || t.tokenType === 'safari')
    console.log('[Push] FCM tokens:', hasFCM, '— Safari tokens:', hasSafari)

    let accessToken = null
    if (hasFCM) {
      try {
        accessToken = await getAccessToken()
        console.log('[FCM] Access token obtained ✅')
      } catch (e) {
        console.error('[FCM] Access token failed:', e.message)
      }
    }

    let sent = 0, failed = 0

    await Promise.all(tokens.map(async (tokenDoc) => {
      const tokenStr  = tokenDoc.token?.trim()
      const tokenType = tokenDoc.tokenType || 'fcm'
      if (!tokenStr) { failed++; return }

      const isSafari = tokenStr.startsWith('{') || tokenType === 'safari'
      console.log('[Push] Sending via:', isSafari ? 'WebPush/Safari' : 'FCM')

      let ok = false
      if (isSafari) {
        ok = await sendWebPush(tokenStr, title, body, type)
      } else if (accessToken) {
        ok = await sendFCM(tokenStr, title, body, type, data, accessToken)
      } else {
        console.error('[Push] No access token for FCM send')
      }

      if (ok) sent++; else failed++
    }))

    console.log('[Push] Done — sent:', sent, 'failed:', failed)
    return res.status(200).json({ sent, failed })

  } catch (err) {
    console.error('[Push] Fatal error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
