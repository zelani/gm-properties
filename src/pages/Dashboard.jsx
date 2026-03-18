import { useState } from 'react'
import { useAuth }         from '../AuthContext'
import AppContent          from '../components/AppContent'
import UserApprovalsPanel  from '../components/UserApprovalsPanel'
import InstallPrompt       from '../components/InstallPrompt'
import ForegroundNotification from '../components/ForegroundNotification'
import NotificationBell    from '../components/NotificationBell'
import { usePushNotifications } from '../hooks/usePushNotifications'

// Safe wrapper — if push notifications crash for any reason, the page still loads
function SafeNotificationBell({ uid, projectId, flatNumber, role }) {
  try {
    const { permission, notification, loading, requestPermission, setNotification } =
      usePushNotifications({ uid, projectId, flatNumber, role })
    return { permission, notification, loading, requestPermission, setNotification }
  } catch (e) {
    console.warn('[Push] Hook error (non-fatal):', e)
    return {
      permission: 'denied',
      notification: null,
      loading: false,
      requestPermission: async () => {},
      setNotification: () => {},
    }
  }
}

export default function Dashboard() {
  const { user, role, flatNumber, userName, projectId, logout } = useAuth()
  const [showUsers, setShowUsers] = useState(false)

  const isAdmin    = role === 'admin' || role === 'projectadmin'
  const isResident = role === 'resident'

  // Push notifications — fully safe, never crashes Dashboard
  let pushState = {
    permission: 'default',
    notification: null,
    loading: false,
    requestPermission: async () => {},
    setNotification: () => {},
  }
  try {
    const result = usePushNotifications({
      uid:        user?.uid,
      projectId,
      flatNumber,
      role,
    })
    pushState = result
  } catch (e) {
    console.warn('[Push] usePushNotifications error (non-fatal):', e)
  }

  const { permission, notification, loading: notifLoading, requestPermission, setNotification } = pushState

  return (
    <div>
      <ForegroundNotification notification={notification} onDismiss={() => setNotification(null)}/>
      <InstallPrompt />

      {/* Top bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-300">{user?.email}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold ${
            isAdmin    ? 'bg-green-500' :
            isResident ? 'bg-blue-500'  :
                         'bg-gray-500'
          }`}>
            {isAdmin ? '🔑 Admin' : isResident ? '🏠 Resident' : '👁️ View Only'}
          </span>
          {isResident && flatNumber && (
            <span className="text-gray-400">Flat {flatNumber}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin && (
            <NotificationBell
              permission={permission}
              onRequestPermission={requestPermission}
              loading={notifLoading}
            />
          )}
          {isAdmin && (
            <button onClick={() => setShowUsers(v => !v)}
              className={`px-3 py-1 rounded font-semibold transition ${
                showUsers ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-600 hover:bg-gray-500'
              }`}>
              👥 Users
            </button>
          )}
          <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">
            Sign Out
          </button>
        </div>
      </div>

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

