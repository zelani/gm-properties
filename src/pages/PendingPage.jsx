import { Home } from 'lucide-react'

export default function PendingPage({ logout }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">

        <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⏳</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">Approval Pending</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Your account has been created successfully. A managing committee member will review
          your registration and approve your access shortly.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left space-y-1.5">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">What happens next</p>
          <p className="text-xs text-blue-600">✅ Your account has been created</p>
          <p className="text-xs text-blue-600">⏳ Admin reviews your request</p>
          <p className="text-xs text-blue-600">🔔 You will get access once approved</p>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          If you need urgent access, please contact the managing committee directly.
        </p>

        <button
          onClick={logout}
          className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
