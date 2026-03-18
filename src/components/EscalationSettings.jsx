import { useState } from 'react'
import { saveEscalationConfig } from '../hooks/useEscalation'

export default function EscalationSettings({ projectId, config, onSaved }) {
  const [form,    setForm]    = useState({
    amberDay:       config?.amberDay       ?? 10,
    redDay:         config?.redDay         ?? 15,
    escalateMonths: config?.escalateMonths ?? 2,
  })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (form.amberDay >= form.redDay) return setError('Red day must be later than amber day.')
    if (form.amberDay < 1 || form.redDay > 31) return setError('Days must be between 1 and 31.')
    if (form.escalateMonths < 1) return setError('Escalation months must be at least 1.')

    setSaving(true)
    try {
      await saveEscalationConfig(projectId, form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSaved?.(form)
    } catch (err) {
      setError('Error saving: ' + err.message)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">⚙️</span>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Escalation Rules</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              These rules apply to <strong>unpaid</strong> flats for the current month.
              They run automatically when admin opens the app.
            </p>
          </div>
        </div>

        {/* Visual timeline */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto">
          {[1,5,10,15,20,25,31].map(d => (
            <div key={d} className={`flex-1 h-6 rounded text-xs flex items-center justify-center font-bold min-w-[28px] ${
              d < form.amberDay  ? 'bg-gray-100 text-gray-400' :
              d < form.redDay    ? 'bg-amber-100 text-amber-700' :
                                   'bg-red-100 text-red-600'
            }`}>
              {d}
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-xs mb-4 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block"/><span className="text-gray-500">Grace period</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-300 inline-block"/><span className="text-amber-700">Amber — visual flag only</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block"/><span className="text-red-600">Red — WhatsApp reminder sent</span></span>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-amber-700 mb-1">
              🟡 Amber Flag — Day
            </label>
            <input type="number" min="1" max="28" value={form.amberDay}
              onChange={e => setForm({...form, amberDay: parseInt(e.target.value)||10})}
              className="w-full px-3 py-2.5 border-2 border-amber-200 rounded-xl text-sm font-bold text-amber-800 bg-amber-50 focus:outline-none focus:border-amber-400"
            />
            <p className="text-xs text-amber-600 mt-1">Flag unpaid flats amber</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-red-600 mb-1">
              🔴 Red + WhatsApp — Day
            </label>
            <input type="number" min="1" max="31" value={form.redDay}
              onChange={e => setForm({...form, redDay: parseInt(e.target.value)||15})}
              className="w-full px-3 py-2.5 border-2 border-red-200 rounded-xl text-sm font-bold text-red-700 bg-red-50 focus:outline-none focus:border-red-400"
            />
            <p className="text-xs text-red-500 mt-1">Flag red + send reminder</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-purple-700 mb-1">
              📲 Escalate — Months
            </label>
            <input type="number" min="1" max="12" value={form.escalateMonths}
              onChange={e => setForm({...form, escalateMonths: parseInt(e.target.value)||2})}
              className="w-full px-3 py-2.5 border-2 border-purple-200 rounded-xl text-sm font-bold text-purple-800 bg-purple-50 focus:outline-none focus:border-purple-400"
            />
            <p className="text-xs text-purple-600 mt-1">Alert supervisor after X months</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 space-y-1">
        <p>📅 <strong>Day 1–{form.amberDay-1}</strong> — Grace period, no flags</p>
        <p>🟡 <strong>Day {form.amberDay}–{form.redDay-1}</strong> — Flat flagged amber in collections grid</p>
        <p>🔴 <strong>Day {form.redDay}+</strong> — Flat flagged red + WhatsApp reminder sent automatically</p>
        <p>📲 <strong>{form.escalateMonths} consecutive months unpaid</strong> — Supervisor notified via WhatsApp</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {error}</div>
      )}

      <button type="submit" disabled={saving}
        className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-50 transition">
        {saving ? 'Saving...' : saved ? '✅ Saved!' : '💾 Save Escalation Rules'}
      </button>
    </form>
  )
}
