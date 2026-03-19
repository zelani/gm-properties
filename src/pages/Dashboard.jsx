import { useState } from 'react'
import { useAuth }            from '../AuthContext'
import AppContent             from '../components/AppContent'
import UserApprovalsPanel     from '../components/UserApprovalsPanel'
import InstallPrompt          from '../components/InstallPrompt'
import ForegroundNotification from '../components/ForegroundNotification'
import { usePushNotifications } from '../hooks/usePushNotifications'

export default function Dashboard() {
  const { user, role, flatNumber, userName, projectId, logout } = useAuth()
  const [showUsers,     setShowUsers]     = useState(false)
  const [bellDismissed, setBellDismissed] = useState(false)

  const isAdmin    = role === 'admin' || role === 'projectadmin'
  const isResident = role === 'resident'

  // Push notifications — fully safe, never crashes Dashboard
  let pushState = {
    permission: 'default', notification: null, loading: false,
    requestPermission: async () => {}, setNotification: () => {},
  }
  try {
    pushState = usePushNotifications({ uid: user?.uid, projectId, flatNumber, role })
  } catch (e) {
    console.warn('[Push] non-fatal:', e)
  }
  const { permission, notification, loading: notifLoading, requestPermission, setNotification } = pushState

  return (
    <div>
      <ForegroundNotification notification={notification} onDismiss={() => setNotification(null)}/>
      <InstallPrompt />

      {/* ── Top bar ─────────────────────────────────────── */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-300 truncate max-w-[140px]">{user?.email}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
            isAdmin    ? 'bg-green-500' :
            isResident ? 'bg-blue-500'  : 'bg-gray-500'
          }`}>
            {isAdmin ? '🔑 Admin' : isResident ? '🏠 Resident' : '👁️ View Only'}
          </span>
          {isResident && flatNumber && (
            <span className="text-gray-400 flex-shrink-0">Flat {flatNumber}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <button onClick={() => setShowUsers(v => !v)}
              className={`px-3 py-1 rounded font-semibold transition ${
                showUsers ? 'bg-indigo-600' : 'bg-gray-600 hover:bg-gray-500'
              }`}>
              👥 Users
            </button>
          )}
          <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Notification opt-in banner — residents only ── */}
      {!isAdmin && permission === 'default' && !bellDismissed && (
        <div className="bg-purple-600 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0">🔔</span>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">Enable push notifications</p>
              <p className="text-purple-200 text-xs mt-0.5">
                Get alerts for payment updates, meetings and notices — even when the app is closed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={async () => { await requestPermission() }}
              disabled={notifLoading}
              className="px-4 py-2 bg-white text-purple-700 rounded-xl font-bold text-xs hover:bg-purple-50 transition disabled:opacity-60 whitespace-nowrap"
            >
              {notifLoading ? 'Enabling...' : '✓ Enable'}
            </button>
            <button onClick={() => setBellDismissed(true)}
              className="text-purple-300 hover:text-white text-xl font-bold leading-none px-1">×</button>
          </div>
        </div>
      )}

      {/* ── Enabled confirmation (dismissible) ─────────── */}
      {!isAdmin && permission === 'granted' && !bellDismissed && (
        <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <p className="text-xs font-semibold">Push notifications active — you'll be alerted for payment updates and notices</p>
          </div>
          <button onClick={() => setBellDismissed(true)}
            className="text-green-300 hover:text-white text-xl font-bold leading-none">×</button>
        </div>
      )}

      {/* ── Blocked warning ────────────────────────────── */}
      {!isAdmin && permission === 'denied' && !bellDismissed && (
        <div className="bg-gray-700 text-white px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0">🔕</span>
            <p className="text-xs text-gray-300 truncate">Notifications blocked — go to browser Settings → Site Settings → Notifications to enable</p>
          </div>
          <button onClick={() => setBellDismissed(true)}
            className="text-gray-400 hover:text-white text-xl font-bold flex-shrink-0">×</button>
        </div>
      )}

      {/* ── Banners ─────────────────────────────────────── */}
      {!isAdmin && !isResident && (
        <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2 text-center text-xs font-semibold text-yellow-700">
          👁️ You are in <strong>View-Only Mode</strong>. Contact your admin to make changes.
        </div>
      )}
      {isResident && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-xs font-semibold text-blue-700">
          🏠 Welcome, {userName} — Flat {flatNumber}
        </div>
      )}

      {/* ── User approvals ──────────────────────────────── */}
      {isAdmin && showUsers && (
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800">👥 User Management</h2>
                <p className="text-xs text-gray-500 mt-0.5">Approve registrations, change roles, revoke access</p>
              </div>
              <button onClick={() => setShowUsers(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
            </div>
            <UserApprovalsPanel projectId={projectId} />
          </div>
        </div>
      )}

      {/* ── Main app ───────────────────────────────────── */}
      <AppContent
        isAdmin={isAdmin}
        role={role || 'resident'}
        flatNumber={flatNumber}
        currentUser={userName || user?.email}
        projectId={projectId}
      />
    </div>
  )
}
