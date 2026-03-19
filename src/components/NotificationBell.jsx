import { useState } from 'react'

export default function NotificationBell({ permission, onRequestPermission, loading, recentCount = 0 }) {
  const [showPrompt,  setShowPrompt]  = useState(false)
  const [showGranted, setShowGranted] = useState(false)

  // ── Granted — show active bell with info popup ─────────
  if (permission === 'granted') {
    return (
      <div className="relative">
        <button
          onClick={() => setShowGranted(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-green-400 hover:bg-gray-700 transition"
          title="Push notifications active — click for info"
        >
          🔔
          <span className="hidden sm:inline text-green-400">Alerts On</span>
        </button>

        {showGranted && (
          <div className="absolute right-0 top-8 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">✅</span>
              <p className="font-bold text-gray-800 text-sm">Notifications Active</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              You will receive alerts for payment updates, meeting notices and building announcements — even when the app is closed.
            </p>
            <p className="text-xs text-gray-400">
              To disable, go to your browser/phone settings and block notifications for this site.
            </p>
            <button onClick={() => setShowGranted(false)}
              className="mt-3 w-full py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200">
              Close
            </button>
          </div>
        )}

        {/* Close on outside click */}
        {showGranted && (
          <div className="fixed inset-0 z-40" onClick={() => setShowGranted(false)}/>
        )}
      </div>
    )
  }

  // ── Denied — show blocked indicator ──────────────────
  if (permission === 'denied') {
    return (
      <div className="relative">
        <button
          onClick={() => setShowPrompt(v => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:bg-gray-700 transition"
          title="Notifications blocked"
        >
          🔕
        </button>
        {showPrompt && (
          <div className="absolute right-0 top-8 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50">
            <p className="font-bold text-gray-800 text-sm mb-1">Notifications Blocked</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              To enable notifications, tap the 🔒 lock icon in your browser address bar and allow notifications for this site.
            </p>
            <button onClick={() => setShowPrompt(false)}
              className="mt-3 w-full py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold">Close</button>
          </div>
        )}
        {showPrompt && <div className="fixed inset-0 z-40" onClick={() => setShowPrompt(false)}/>}
      </div>
    )
  }

  // ── Default — not yet asked ───────────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setShowPrompt(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition animate-pulse"
      >
        🔔 Enable Alerts
      </button>

      {showPrompt && (
        <div className="absolute right-0 top-8 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-3xl">🔔</span>
            <div>
              <p className="font-bold text-gray-800 text-sm">Stay informed instantly</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Get notified about payment confirmations, meeting notices and updates — even when the app is closed.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => { await onRequestPermission(); setShowPrompt(false) }}
              disabled={loading}
              className="flex-1 py-2 bg-purple-600 text-white rounded-xl font-bold text-xs hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {loading ? 'Enabling...' : '✓ Enable Notifications'}
            </button>
            <button onClick={() => setShowPrompt(false)}
              className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs hover:bg-gray-200">
              Later
            </button>
          </div>
        </div>
      )}
      {showPrompt && <div className="fixed inset-0 z-40" onClick={() => setShowPrompt(false)}/>}
    </div>
  )
}
