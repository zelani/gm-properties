import { useState } from 'react'

export default function NotificationBell({ permission, onRequestPermission, loading }) {
  const [showPrompt, setShowPrompt] = useState(false)

  if (permission === 'granted') {
    return (
      <div className="relative group">
        <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-green-400 font-semibold"
          title="Push notifications enabled">
          🔔 <span className="hidden sm:inline">Notifications On</span>
        </button>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400"
        title="Notifications blocked — please enable in browser settings">
        🔕
      </button>
    )
  }

  // Default — not yet asked
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
                Get notified about payment confirmations, meeting notices, and updates — even when the app is closed.
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
    </div>
  )
}
