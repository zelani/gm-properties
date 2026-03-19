import { useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

const NOTIF_TYPES = [
  { value: 'payment_received', label: '✅ Payment Received',  scope: 'flat',    color: 'bg-green-50 border-green-200 text-green-700'  },
  { value: 'payment_reminder', label: '🔔 Payment Reminder',  scope: 'flat',    color: 'bg-orange-50 border-orange-200 text-orange-700'},
  { value: 'meeting',          label: '📋 Meeting Notice',    scope: 'all',     color: 'bg-blue-50 border-blue-200 text-blue-700'     },
  { value: 'notice',           label: '📢 General Notice',    scope: 'all',     color: 'bg-yellow-50 border-yellow-200 text-yellow-700'},
  { value: 'complaint',        label: '🎫 Complaint Update',  scope: 'flat',    color: 'bg-purple-50 border-purple-200 text-purple-700'},
]

// Send push via Firebase Cloud Messaging REST API
// This uses the FCM HTTP v1 API via your Vercel serverless function
async function sendPushNotification({ tokens, title, body, type, data = {} }) {
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 }

  // We call our own Vercel API route which holds the FCM server key securely
  try {
    const res = await fetch('/api/send-push', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body, type, data }),
    })
    const result = await res.json()
    return result
  } catch (err) {
    console.error('[Push] Error:', err)
    return { sent: 0, failed: tokens.length, error: err.message }
  }
}

export default function PushNotifyPanel({ projectId, flats = [], isAdmin }) {
  const [type,      setType]      = useState('notice')
  const [title,     setTitle]     = useState('')
  const [body,      setBody]      = useState('')
  const [flatNum,   setFlatNum]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [result,    setResult]    = useState(null)

  const selectedType = NOTIF_TYPES.find(t => t.value === type) || NOTIF_TYPES[3]
  const isFlatScoped = selectedType.scope === 'flat'

  async function handleSend() {
    if (!title.trim()) return alert('Please enter a notification title.')
    if (isFlatScoped && !flatNum) return alert('Please select a flat for this notification type.')

    setSending(true)
    setResult(null)

    try {
      // Get FCM tokens from Firestore
      // For flat-scoped: get tokens where projectId matches AND flatNumber matches
      // For all: get all tokens for this project
      let tokenQuery
      if (isFlatScoped && flatNum) {
        tokenQuery = query(
          collection(db, 'fcmTokens'),
          where('projectId',  '==', projectId),
          where('flatNumber', '==', parseInt(flatNum))
        )
      } else {
        tokenQuery = query(
          collection(db, 'fcmTokens'),
          where('projectId', '==', projectId)
        )
      }

      const snap   = await getDocs(tokenQuery)
      const tokens = snap.docs
        .map(d => ({ token: d.data().token, tokenType: d.data().tokenType || 'fcm' }))
        .filter(t => t.token)

      if (tokens.length === 0) {
        setResult({ sent: 0, failed: 0, message: 'No devices registered for push notifications in this selection.' })
        setSending(false)
        return
      }

      const res = await sendPushNotification({
        tokens,
        title: title.trim(),
        body:  body.trim(),
        type,
        data: { type, projectId, flatNumber: flatNum || '' },
      })

      setResult({ ...res, message: `✅ Sent to ${res.sent || tokens.length} device${tokens.length !== 1 ? 's' : ''}.` })
      setTitle('')
      setBody('')
      setFlatNum('')

    } catch (err) {
      setResult({ error: err.message })
    }
    setSending(false)
  }

  if (!isAdmin) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🔔</span>
        <h3 className="font-bold text-gray-800">Push Notification</h3>
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">In-App &amp; Home Screen</span>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-1 gap-2">
        <label className="block text-xs font-bold text-gray-500 mb-1">Notification Type</label>
        <div className="flex flex-wrap gap-2">
          {NOTIF_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => { setType(t.value); setFlatNum('') }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                type === t.value ? t.color + ' border-current' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope indicator */}
      <div className={`text-xs px-3 py-2 rounded-xl border font-semibold ${selectedType.color}`}>
        {isFlatScoped
          ? '🎯 Sends to a specific flat only'
          : '📡 Sends to ALL residents of this project'
        }
      </div>

      {/* Flat picker — only for flat-scoped types */}
      {isFlatScoped && (
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Select Flat *</label>
          <select value={flatNum} onChange={e => setFlatNum(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
            <option value="">— Select flat —</option>
            {flats.map(f => <option key={f} value={f}>Flat {f}</option>)}
          </select>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">Title *</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder={
            type === 'payment_received' ? 'e.g. Payment Received — March 2026' :
            type === 'payment_reminder' ? 'e.g. Maintenance Due — March 2026'  :
            type === 'meeting'          ? 'e.g. Monthly Meeting — 20th March'  :
            'Notification title'
          }
          className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"/>
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">Message</label>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          rows={2} placeholder="Additional details (optional)..."
          className="w-full px-3 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"/>
      </div>

      {/* Result */}
      {result && (
        <div className={`text-xs px-4 py-3 rounded-xl font-semibold border ${
          result.error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {result.error ? `⚠️ ${result.error}` : result.message}
        </div>
      )}

      <button onClick={handleSend} disabled={sending}
        className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
        {sending
          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/><span>Sending...</span></>
          : <><span>🔔</span><span>Send Push Notification</span></>
        }
      </button>
    </div>
  )
}
