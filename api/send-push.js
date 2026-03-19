// api/send-push.js
// Vercel Serverless Function
// Handles BOTH FCM tokens (Android/Chrome) and Safari Web Push subscriptions

import { GoogleAuth } from 'google-auth-library'
import webpush        from 'web-push'

const PROJECT_ID = 'gm-properties-amir'

const VAPID_PUBLIC  = 'BH0WqwsibHm1EvNWi99ZxO8CEYmgWTRxrkIXGbT2xzfG2OLrz9MCj8p-7YG1Kuqqi69PBB-yGIRPSnhs_i91y_g'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY   // add this to Vercel env vars

async function getAccessToken() {
  const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON)
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const client = await auth.getClient()
  const token  = await client.getAccessToken()
  return token.token
}

// Send via FCM v1 API (Chrome / Android)
async function sendFCM(token, title, body, type, data, accessToken) {
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: title || 'GM Property Hub', body: body || '' },
            data: { type: type || 'notice', ...data },
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
        }),
      }
    )
    return response.ok
  } catch { return false }
}

// Send via Web Push (Safari iOS PWA)
async function sendWebPush(subscriptionStr, title, body, type) {
  if (!VAPID_PRIVATE) {
    console.error('[WebPush] VAPID_PRIVATE_KEY not set')
    return false
  }
  try {
    webpush.setVapidDetails(
      'mailto:admin@gmproperties.com',
      VAPID_PUBLIC,
      VAPID_PRIVATE
    )
    const subscription = JSON.parse(subscriptionStr)
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || 'GM Property Hub',
        body:  body  || '',
        icon:  '/icons/icon-192.png',
        data:  { type },
      })
    )
    return true
  } catch (err) {
    console.error('[WebPush] Error:', err.message)
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tokens, title, body, type, data = {} } = req.body

  if (!tokens || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' })
  }

  try {
    // Get FCM access token once for all FCM sends
    let accessToken = null
    const hasFCMTokens = tokens.some(t => !t.token?.startsWith('{'))
    if (hasFCMTokens) {
      try { accessToken = await getAccessToken() } catch (e) {
        console.error('[FCM] Auth error:', e.message)
      }
    }

    let sent = 0, failed = 0

    await Promise.all(tokens.map(async (tokenDoc) => {
      const tokenStr  = tokenDoc.token
      const tokenType = tokenDoc.tokenType || 'fcm'

      if (!tokenStr) { failed++; return }

      let ok = false

      // Detect Safari subscription (JSON string starting with {)
      const isSafariSub = tokenStr.trim().startsWith('{')

      if (isSafariSub || tokenType === 'safari') {
        ok = await sendWebPush(tokenStr, title, body, type)
      } else {
        if (accessToken) {
          ok = await sendFCM(tokenStr, title, body, type, data, accessToken)
        }
      }

      if (ok) sent++; else failed++
    }))

    return res.status(200).json({ sent, failed })

  } catch (err) {
    console.error('[Push] Handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}
