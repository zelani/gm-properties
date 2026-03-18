import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Default escalation config
const DEFAULTS = { amberDay: 10, redDay: 15, escalateMonths: 2 }

// ── Load escalation config from project doc ───────────────────
async function loadConfig(projectId) {
  if (!projectId) return DEFAULTS
  try {
    const snap = await getDoc(doc(db, 'projects', projectId))
    if (!snap.exists()) return DEFAULTS
    const d = snap.data()
    return {
      amberDay:       parseInt(d.escalationAmberDay  ?? DEFAULTS.amberDay),
      redDay:         parseInt(d.escalationRedDay    ?? DEFAULTS.redDay),
      escalateMonths: parseInt(d.escalationMonths    ?? DEFAULTS.escalateMonths),
    }
  } catch { return DEFAULTS }
}

// ── Save escalation config to project doc ────────────────────
export async function saveEscalationConfig(projectId, config) {
  if (!projectId) return
  await setDoc(doc(db, 'projects', projectId), {
    escalationAmberDay:  config.amberDay,
    escalationRedDay:    config.redDay,
    escalationMonths:    config.escalateMonths,
  }, { merge: true })
}

// ── Check if a flat has been reminded this month ─────────────
async function wasRemindedThisMonth(projectId, flatNum, year, month) {
  try {
    const key  = `${year}-${month}-${flatNum}`
    const snap = await getDoc(doc(db, 'projects', projectId, 'escalationLog', key))
    return snap.exists()
  } catch { return false }
}

// ── Mark flat as reminded this month ────────────────────────
async function markReminded(projectId, flatNum, year, month, type = 'whatsapp') {
  try {
    const key = `${year}-${month}-${flatNum}`
    await setDoc(doc(db, 'projects', projectId, 'escalationLog', key), {
      flatNum, year, month, type, sentAt: serverTimestamp()
    })
  } catch { /* non-critical */ }
}

// ── Count consecutive unpaid months going backwards ──────────
function countConsecutiveUnpaid(collections, flat, currentYear, currentMonth, maxCheck) {
  let count = 0
  for (let i = 1; i <= maxCheck; i++) {
    let y = currentYear, m = currentMonth - i
    if (m < 0) { m += 12; y-- }
    const c = collections?.[flat]?.[`${y}-${m}`]
    if (c && !c.paid) count++
    else break
  }
  return count
}

// ── Main hook ─────────────────────────────────────────────────
export function useEscalation({ data, projectId, FLATS, isAdmin }) {
  const [config,         setConfig]         = useState(DEFAULTS)
  const [escalationMap,  setEscalationMap]  = useState({}) // { [flat]: 'amber'|'red'|'escalated' }
  const [reminderLog,    setReminderLog]    = useState({}) // { [flat]: true } — already sent this month
  const [running,        setRunning]        = useState(false)
  const [lastRun,        setLastRun]        = useState(null)

  // Load config on mount
  useEffect(() => {
    loadConfig(projectId).then(setConfig)
  }, [projectId])

  // Recompute escalation map whenever data or config changes
  useEffect(() => {
    if (!data?.collections || !FLATS) return
    const today   = new Date()
    const day     = today.getDate()
    const year    = today.getFullYear()
    const month   = today.getMonth()
    const map     = {}

    FLATS.forEach(flat => {
      const c = data.collections?.[flat]?.[`${year}-${month}`]
      if (!c || c.paid || c.advance) return  // paid or advance — no flag

      const consecutive = countConsecutiveUnpaid(
        data.collections, flat, year, month, config.escalateMonths
      )

      if (consecutive >= config.escalateMonths - 1) {
        map[flat] = 'escalated'  // supervisor alert level
      } else if (day >= config.redDay) {
        map[flat] = 'red'        // WhatsApp reminder level
      } else if (day >= config.amberDay) {
        map[flat] = 'amber'      // visual warning only
      }
    })

    setEscalationMap(map)
  }, [data, config, FLATS])

  // ── Run escalation: send WhatsApp reminders for red/escalated flats ──
  const runEscalation = useCallback(async (sendWhatsAppFn, supervisorPhone, projectName) => {
    if (!isAdmin || !data?.collections || !FLATS || !sendWhatsAppFn) return
    setRunning(true)

    const today  = new Date()
    const year   = today.getFullYear()
    const month  = today.getMonth()
    const monthLabel = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

    const results = { sent: 0, skipped: 0, escalated: 0 }

    for (const flat of FLATS) {
      const level = escalationMap[flat]
      if (!level || level === 'amber') { results.skipped++; continue }

      const fd    = data.flats?.[flat]
      if (!fd)    { results.skipped++; continue }

      const name  = fd.currentTenant?.name  || fd.ownerName  || `Flat ${flat}`
      const phone = fd.currentTenant?.phone || fd.ownerPhone || ''
      const c     = data.collections[flat]?.[`${year}-${month}`]
      const amount= c?.amount || 5000

      // Skip if already reminded this month
      const alreadySent = await wasRemindedThisMonth(projectId, flat, year, month)
      if (alreadySent) { results.skipped++; continue }

      if (phone && phone !== '9999999999' && phone.replace(/\D/g,'').length === 10) {
        try {
          // Send WhatsApp using maintenance_due template
          await sendWhatsAppFn(phone, 'maintenance_due', [name, String(flat), monthLabel, String(amount)])
          await markReminded(projectId, flat, year, month, level === 'escalated' ? 'escalated' : 'whatsapp')
          results.sent++

          // If escalated — also notify supervisor
          if (level === 'escalated' && supervisorPhone) {
            const supPhone = supervisorPhone.replace(/\D/g,'')
            if (supPhone.length === 10) {
              const supMsg = [
                projectName || 'Your Building',
                String(flat),
                monthLabel,
                String(amount),
              ]
              await sendWhatsAppFn(supervisorPhone, 'maintenance_due', supMsg)
              results.escalated++
            }
          }
        } catch { results.skipped++ }
      } else {
        results.skipped++
      }
    }

    setLastRun({ ...results, time: new Date().toLocaleTimeString() })
    setRunning(false)
    return results
  }, [escalationMap, data, FLATS, projectId, isAdmin])

  return { config, escalationMap, reminderLog, running, lastRun, runEscalation }
}
