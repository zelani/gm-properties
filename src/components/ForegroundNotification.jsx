export default function ForegroundNotification({ notification, onDismiss }) {
  if (!notification) return null

  const icons = {
    payment_received: '✅',
    payment_reminder: '🔔',
    meeting:          '📋',
    notice:           '📢',
    complaint:        '🎫',
  }

  const icon = icons[notification.data?.type] || '🔔'

  return (
    <div className="fixed top-4 right-4 z-[200] max-w-sm w-full animate-bounce-once">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 border border-purple-500 border-opacity-50">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">{notification.title}</p>
            {notification.body && (
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">{notification.body}</p>
            )}
          </div>
          <button onClick={onDismiss}
            className="text-gray-400 hover:text-white text-xl font-bold leading-none flex-shrink-0 ml-1">×</button>
        </div>
        {/* Progress bar — auto dismisses in 8s */}
        <div className="mt-3 h-0.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full animate-shrink-bar"/>
        </div>
      </div>
      <style>{`
        @keyframes shrink-bar { from { width: 100% } to { width: 0% } }
        .animate-shrink-bar { animation: shrink-bar 8s linear forwards; }
        @keyframes bounce-once { 0%,100%{transform:translateY(0)} 20%{transform:translateY(-8px)} 40%{transform:translateY(0)} }
        .animate-bounce-once { animation: bounce-once 0.5s ease; }
      `}</style>
    </div>
  )
}
