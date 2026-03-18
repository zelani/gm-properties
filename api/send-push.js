// api/send-push.js
// Vercel Serverless Function
// Sends FCM push notifications server-side (keeps FCM service account key secret)
//
// Environment variable needed in Vercel:
//   FCM_SERVICE_ACCOUNT_JSON  — the full JSON content of your Firebase service account key
//
// How to get the service account key:
//   Firebase Console → Project Settings → Service accounts → Generate new private key
//   Copy the entire JSON content and paste it as the FCM_SERVICE_ACCOUNT_JSON env var in Vercel

import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = 'gm-jelani-heights-80159'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tokens, title, body, type, data = {} } = req.body

  if (!tokens || tokens.length === 0) {
    return res.status(400).json({ error: 'No tokens provided' })
  }

  try {
    const accessToken = await getAccessToken()
    let sent = 0, failed = 0

    // FCM v1 API — send one message per token (supports per-token error handling)
    await Promise.all(tokens.map(async (token) => {
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
                notification: {
                  title: title || 'GM Property Hub',
                  body:  body  || '',
                },
                data: {
                  type:       type        || 'notice',
                  projectId:  data.projectId  || '',
                  flatNumber: data.flatNumber || '',
                  click_action: 'FLUTTER_NOTIFICATION_CLICK',
                },
                webpush: {
                  notification: {
                    title: title || 'GM Property Hub',
                    body:  body  || '',
                    icon:  '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    vibrate: [200, 100, 200],
                  },
                  fcm_options: { link: '/' },
                },
              },
            }),
          }
        )
        if (response.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }))

    return res.status(200).json({ sent, failed })

  } catch (err) {
    console.error('[FCM] Send error:', err)
    return res.status(500).json({ error: err.message })
  }
}
