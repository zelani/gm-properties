import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const ALL_ROLES = [
  { value: 'resident',     label: 'Resident',     color: 'bg-blue-100 text-blue-700'    },
  { value: 'projectadmin', label: 'Project Admin', color: 'bg-green-100 text-green-700'  },
  { value: 'readonly',     label: 'Read Only',     color: 'bg-gray-100 text-gray-700'    },
  { value: 'superadmin',   label: 'Super Admin',   color: 'bg-purple-100 text-purple-700'},
  { value: 'admin',        label: 'Admin',         color: 'bg-indigo-100 text-indigo-700'},
  { value: 'auditor',      label: 'Auditor',       color: 'bg-teal-100 text-teal-700'    },
  { value: 'guest',        label: 'Guest',         color: 'bg-yellow-100 text-yellow-700'},
]

function RoleBadge({ role }) {
  const r = ALL_ROLES.find(x => x.value === role)
  const cls = r ? r.color : 'bg-gray-100 text-gray-600'
  const lbl = r ? r.label : role
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{lbl}</span>
}

export default function UserApprovalsPanel({ projectId }) {
  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('pending')
  const [projects, setProjects] = useState({})

  async function loadUsers() {
    setLoading(true)
    try {
      const pSnap = await getDocs(collection(db, 'projects'))
      const pm = {}
      pSnap.docs.forEach(d => { pm[d.id] = d.data().name })
      setProjects(pm)

      const snap = await getDocs(collection(db, 'users'))
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      if (projectId) {
        list = list.filter(u => u.projectId === projectId || !u.projectId)
      }

      list.sort((a, b) => {
        if (a.approved === b.approved) return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)
        return a.approved ? 1 : -1
      })
      setUsers(list)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [projectId])

  async function approve(uid) {
    try {
      await updateDoc(doc(db,'users',uid), { approved: true })
      setUsers(us => us.map(u => u.id===uid ? {...u,approved:true} : u))
    } catch(e) { alert('Error: '+e.message) }
  }

  async function reject(uid, name) {
    if (!window.confirm(`Reject and permanently delete account for ${name}?\n\nThis cannot be undone.`)) return
    try {
      await deleteDoc(doc(db,'users',uid))
      setUsers(us => us.filter(u => u.id!==uid))
    } catch(e) { alert('Error: '+e.message) }
  }

  async function changeRole(uid, newRole) {
    try {
      await updateDoc(doc(db,'users',uid), { role: newRole })
      setUsers(us => us.map(u => u.id===uid ? {...u,role:newRole} : u))
    } catch(e) { alert('Error: '+e.message) }
  }

  async function revokeAccess(uid, name) {
    if (!window.confirm(`Revoke access for ${name}?\n\nThey will be blocked immediately and shown the pending screen. You can re-approve any time.`)) return
    try {
      await updateDoc(doc(db,'users',uid), { approved: false })
      setUsers(us => us.map(u => u.id===uid ? {...u,approved:false} : u))
    } catch(e) { alert('Error: '+e.message) }
  }

  function fmtDate(ts) {
    if (!ts) return '—'
    const d = ts.seconds ? new Date(ts.seconds*1000) : new Date(ts)
    return d.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})
  }

  const pending  = users.filter(u => !u.approved)
  const approved = users.filter(u =>  u.approved)
  const visible  = filter==='pending' ? pending : filter==='approved' ? approved : users

  return (
    <div className="space-y-5">

      {/* Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          {[
            [pending.length,  'Pending',  'bg-orange-50 border-orange-200 text-orange-600'],
            [approved.length, 'Approved', 'bg-green-50 border-green-200 text-green-600'],
            [users.length,    'Total',    'bg-gray-50 border-gray-200 text-gray-600'],
          ].map(([n,l,cls])=>(
            <div key={l} className={`border rounded-xl px-4 py-2 text-center ${cls}`}>
              <p className="text-xl font-bold">{n}</p>
              <p className="text-xs font-semibold">{l}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {[['pending','⏳ Pending'],['approved','✅ Active'],['all','All']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              className={"px-3 py-1.5 rounded-lg text-xs font-bold transition "+(filter===v?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200")}>
              {l}
            </button>
          ))}
          <button onClick={loadUsers} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">🔄</button>
        </div>
      </div>

      {/* SuperAdmin note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <strong>ℹ️ How to create SuperAdmin / ReadOnly:</strong> These roles cannot self-register.
        Approve a pending user first, then use the role dropdown to promote them to SuperAdmin or ReadOnly.
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"/>
        </div>
      )}

      {!loading && visible.length===0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{filter==='pending'?'🎉':'👥'}</p>
          <p className="font-semibold">{filter==='pending'?'No pending approvals':'No users found'}</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(u=>(
          <div key={u.id} className={"bg-white rounded-2xl border shadow-sm overflow-hidden "+(u.approved?"border-gray-100":"border-orange-200")}>

            {!u.approved && (
              <div className="bg-orange-50 border-b border-orange-200 px-4 py-1.5">
                <span className="text-xs font-bold text-orange-600">⏳ AWAITING APPROVAL</span>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-gray-800 text-sm">{u.fullName||u.name||'—'}</h3>
                    <RoleBadge role={u.role||'resident'}/>
                    {u.flatNumber && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-semibold">Flat {u.flatNumber}</span>
                    )}
                    {u.approved && (
                      <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-semibold">✅ Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  {u.phone && <p className="text-xs text-gray-400 mt-0.5">📞 +91 {u.phone}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                    {u.projectId && projects[u.projectId] && (
                      <p className="text-xs text-indigo-600 font-semibold">🏢 {projects[u.projectId]}</p>
                    )}
                    {u.referredBy && (
                      <p className="text-xs text-purple-600 font-semibold">👤 Approver: {u.referredBy}</p>
                    )}
                    <p className="text-xs text-gray-400">📅 {fmtDate(u.createdAt)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  {!u.approved ? (
                    <div className="flex gap-2">
                      <button onClick={()=>approve(u.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition">
                        ✓ Approve
                      </button>
                      <button onClick={()=>reject(u.id, u.fullName||u.email)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-bold hover:bg-red-200 transition">
                        ✗ Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center flex-wrap">
                      <select value={u.role||'resident'} onChange={e=>changeRole(u.id,e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white">
                        {ALL_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button onClick={()=>revokeAccess(u.id,u.fullName||u.email)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition">
                        🚫 Revoke
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
