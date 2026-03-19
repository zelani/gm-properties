// api/send-push.js
import { GoogleAuth } from 'google-auth-library'
import webpush        from 'web-push'

const PROJECT_ID    = 'gm-properties-amir'
const VAPID_PUBLIC = 'BDTYvV9mFC8jmkWScU4y2H11Fs02AteyTMdw6nZ33xaVDTSOu2_c3byoSyul6NMZKg0NilvIioOfhQKLk8h8vt4'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY

async function getAccessToken() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON not set')
  const serviceAccount = JSON.parse(raw)
  const auth   = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })
  const client = await auth.getClient()
  const t      = await client.getAccessToken()
  return t.token
}

async function sendFCM(token, title, body, type, accessToken) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: title || 'GM Property Hub', body: body || '' },
          data: { type: type || 'notice' },
          webpush: {
            notification: { title: title || 'GM Property Hub', body: body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
            fcm_options: { link: '/' },
          },
        },
      }),
    }
  )
  const text = await response.text()
  console.log('[FCM] Status:', response.status, '| Response:', text.slice(0, 150))
  return response.ok
}

async function sendWebPush(subscriptionStr, title, body, type) {
  if (!VAPID_PRIVATE) {
    console.error('[WebPush] ❌ VAPID_PRIVATE_KEY not set in Vercel env vars')
    return false
  }
  try {
    // Parse the subscription — handle both string and object
    let subscription = subscriptionStr
    if (typeof subscriptionStr === 'string') {
      subscription = JSON.parse(subscriptionStr)
    }
    console.log('[WebPush] Endpoint:', subscription.endpoint?.slice(0, 80))
    webpush.setVapidDetails('mailto:admin@gmproperties.com', VAPID_PUBLIC, VAPID_PRIVATE)
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: title || 'GM Property Hub', body: body || '', icon: '/icons/icon-192.png', data: { type } })
    )
    console.log('[WebPush] ✅ Sent!')
    return true
  } catch (err) {
    console.error('[WebPush] ❌ Error:', err.statusCode, err.message)
    return false
  }
}

// Determine if a token is a Safari Web Push subscription
function isSafariToken(tokenStr, tokenType) {
  if (tokenType === 'safari') return true
  if (typeof tokenStr !== 'string') return false
  const s = tokenStr.trim()
  // Safari subscriptions are JSON objects with an 'endpoint' field pointing to apple.com
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s)
      return typeof parsed.endpoint === 'string'
    } catch {
      return false
    }
  }
  return false
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { tokens, title, body, type } = req.body
  console.log('[Push] Request — token count:', tokens?.length, '| title:', title, '| type:', type)

  if (!tokens || tokens.length === 0) return res.status(400).json({ error: 'No tokens' })

  // Log each token for debugging
  tokens.forEach((t, i) => {
    const tokenStr = t.token || t  // handle both {token, tokenType} and plain string
    const tokenType = t.tokenType || 'unknown'
    const preview = typeof tokenStr === 'string' ? tokenStr.slice(0, 40) : String(tokenStr).slice(0, 40)
    console.log(`[Push] Token[${i}] type=${tokenType} | starts_with=${preview} | isSafari=${isSafariToken(tokenStr, tokenType)}`)
  })

  try {
    // Separate FCM and Safari tokens
    const safariTokens = []
    const fcmTokens    = []

    tokens.forEach(t => {
      const tokenStr  = t.token || t
      const tokenType = t.tokenType || 'fcm'
      if (isSafariToken(tokenStr, tokenType)) {
        safariTokens.push(tokenStr)
      } else if (typeof tokenStr === 'string' && tokenStr.length > 10) {
        fcmTokens.push(tokenStr)
      }
    })

    console.log('[Push] Safari tokens:', safariTokens.length, '| FCM tokens:', fcmTokens.length)

    let sent = 0, failed = 0

    // Send Safari Web Push
    for (const sub of safariTokens) {
      const ok = await sendWebPush(sub, title, body, type)
      if (ok) sent++; else failed++
    }

    // Send FCM
    if (fcmTokens.length > 0) {
      let accessToken = null
      try {
        accessToken = await getAccessToken()
        console.log('[FCM] Access token obtained')
      } catch (e) {
        console.error('[FCM] Auth error:', e.message)
      }
      if (accessToken) {
        for (const token of fcmTokens) {
          const ok = await sendFCM(token, title, body, type, accessToken)
          if (ok) sent++; else failed++
        }
      }
    }

    console.log('[Push] Done — sent:', sent, '| failed:', failed)
    return res.status(200).json({ sent, failed })

  } catch (err) {
    console.error('[Push] Fatal:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
