import { useState } from 'react'

const LEVEL_CONFIG = {
  escalated: { label: '📲 Escalated',      bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', desc: 'Supervisor notified' },
  red:       { label: '🔴 Red — Overdue',   bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',       desc: 'WhatsApp reminder sent' },
  amber:     { label: '🟡 Amber — Warning', bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',   desc: 'Payment not yet received' },
}

export default function EscalationPanel({
  escalationMap,
  data,
  FLATS,
  config,
  running,
  lastRun,
  onRunEscalation,
  isAdmin,
}) {
  const [expanded, setExpanded] = useState(true)

  const escalated = FLATS.filter(f => escalationMap[f] === 'escalated')
  const red       = FLATS.filter(f => escalationMap[f] === 'red')
  const amber     = FLATS.filter(f => escalationMap[f] === 'amber')
  const total     = escalated.length + red.length + amber.length

  if (total === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
        <span className="text-3xl">✅</span>
        <div>
          <p className="font-bold text-green-700">All clear — no escalations</p>
          <p className="text-xs text-green-600 mt-0.5">All flats are paid or within grace period</p>
        </div>
      </div>
    )
  }

  function FlatCard({ flat, level }) {
    const fd     = data?.flats?.[flat]
    const name   = fd?.currentTenant?.name || fd?.ownerName || `Flat ${flat}`
    const phone  = fd?.currentTenant?.phone || fd?.ownerPhone || ''
    const cfg    = LEVEL_CONFIG[level]
    const today  = new Date()
    const c      = data?.collections?.[flat]?.[today.getFullYear() + '-' + today.getMonth()]
    const amount = c?.amount || 5000

    return (
      <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-3 flex items-center justify-between gap-3`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-800 text-sm">Flat {flat}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.badge}`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{name}</p>
          <p className="text-xs text-gray-400">₹{amount.toLocaleString()} due</p>
        </div>
        {phone && phone !== '9999999999' && (
          <a href={`tel:${phone}`}
            className="flex-shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition"
            onClick={e => e.stopPropagation()}>
            📞 Call
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🔔</span>
          <div className="text-left">
            <p className="font-bold text-gray-800">Arrears Escalation</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {escalated.length > 0 && <span className="text-purple-600 font-semibold">{escalated.length} escalated · </span>}
              {red.length > 0       && <span className="text-red-600 font-semibold">{red.length} red · </span>}
              {amber.length > 0     && <span className="text-amber-600 font-semibold">{amber.length} amber</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{total} flagged</span>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">

          {/* Config summary */}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 font-semibold">
              🟡 Amber from day {config.amberDay}
            </span>
            <span className="px-2 py-1 bg-red-50 border border-red-200 rounded-lg text-red-700 font-semibold">
              🔴 Red + WhatsApp from day {config.redDay}
            </span>
            <span className="px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 font-semibold">
              📲 Escalate after {config.escalateMonths} months
            </span>
          </div>

          {/* Escalated flats */}
          {escalated.length > 0 && (
            <div>
              <p className="text-xs font-bold text-purple-700 mb-2">📲 Escalated — Supervisor Notified ({escalated.length})</p>
              <div className="space-y-2">
                {escalated.map(f => <FlatCard key={f} flat={f} level="escalated"/>)}
              </div>
            </div>
          )}

          {/* Red flats */}
          {red.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 mb-2">🔴 Red — WhatsApp Reminder ({red.length})</p>
              <div className="space-y-2">
                {red.map(f => <FlatCard key={f} flat={f} level="red"/>)}
              </div>
            </div>
          )}

          {/* Amber flats */}
          {amber.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-600 mb-2">🟡 Amber — Visual Warning ({amber.length})</p>
              <div className="space-y-2">
                {amber.map(f => <FlatCard key={f} flat={f} level="amber"/>)}
              </div>
            </div>
          )}

          {/* Run now button */}
          {isAdmin && (
            <div className="pt-2 border-t border-gray-100">
              <button onClick={onRunEscalation} disabled={running}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {running
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/><span>Running checks...</span></>
                  : <><span>⚡</span><span>Run Escalation Check Now</span></>
                }
              </button>
              {lastRun && (
                <p className="text-xs text-center text-gray-500 mt-2">
                  Last run at {lastRun.time} — {lastRun.sent} reminder{lastRun.sent !== 1 ? 's' : ''} sent
                  {lastRun.escalated > 0 && `, ${lastRun.escalated} supervisor alert${lastRun.escalated !== 1 ? 's' : ''}`}
                  {lastRun.skipped > 0 && `, ${lastRun.skipped} skipped`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
