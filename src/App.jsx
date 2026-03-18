import { Routes, Route, Navigate } from 'react-router-dom'
import { Component } from 'react'
import { useAuth } from './AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import PendingPage from './pages/PendingPage'
import SuperAdminDashboard from './pages/SuperAdminDashboard'

// ── Error Boundary — catches any crash and shows readable error ─
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
            <div className="text-center mb-4"><span className="text-5xl">⚠️</span></div>
            <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 text-center mb-4">Please refresh the page. If the problem persists, sign out and sign back in.</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-600 font-mono break-all">
                {this.state.error?.message || String(this.state.error)}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
              >
                🔄 Refresh Page
              </button>
              <button
                onClick={() => { localStorage.clear(); window.location.href = '/login' }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { user, role, approved, loading, logout } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="font-semibold">Loading...</p>
      </div>
    </div>
  )

  function approvedHome() {
    if (role === 'superadmin' || role === 'readonly') return <SuperAdminDashboard />
    return <Dashboard />
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login"
          element={!user ? <LoginPage /> : <Navigate to="/" />}
        />
        <Route path="/pending"
          element={
            user && !approved
              ? <PendingPage logout={logout} />
              : <Navigate to={user ? '/' : '/login'} />
          }
        />
        <Route path="/*"
          element={
            !user     ? <Navigate to="/login"   /> :
            !approved ? <Navigate to="/pending" /> :
                        <ErrorBoundary>{approvedHome()}</ErrorBoundary>
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}

