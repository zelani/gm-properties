import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { Home } from 'lucide-react'

// ── Only these roles are available for self-registration ──────
// SuperAdmin and ReadOnly CANNOT self-register.
// They must be created by an existing SuperAdmin via User Management panel.
const ROLES = [
  { value: "resident",     label: "Resident",     desc: "Owner or tenant of a flat" },
  { value: "projectadmin", label: "Project Admin", desc: "Manage a specific building" },
]

const APPROVERS = ["Amer", "Ali", "Other"]

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [projects,   setProjects]   = useState([])

  // Shared
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')

  // Register-only
  const [fullName,   setFullName]   = useState('')
  const [phone,      setPhone]      = useState('')
  const [role,       setRole]       = useState('resident')
  const [projectId,  setProjectId]  = useState('')
  const [flatNumber, setFlatNumber] = useState('')
  const [flats,      setFlats]      = useState([])
  const [confirmPwd, setConfirmPwd] = useState('')
  const [referredBy, setReferredBy] = useState('')

  const needsProject = role === 'resident' || role === 'projectadmin'
  const needsFlat    = role === 'resident'
  // ALL self-registered roles require approval — no exceptions
  // SuperAdmin/ReadOnly cannot self-register at all

  // Load projects for dropdown
  useEffect(() => {
    if (!isRegister) return
    getDocs(collection(db, 'projects'))
      .then(snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }, [isRegister])

  // When project changes, load its flat list
  useEffect(() => {
    if (!projectId) { setFlats([]); setFlatNumber(''); return }
    const proj = projects.find(p => p.id === projectId)
    setFlats(proj?.flats || [])
    setFlatNumber('')
  }, [projectId, projects])

  function switchMode(toRegister) {
    setIsRegister(toRegister); setError('')
    setEmail(''); setPassword(''); setFullName('')
    setPhone(''); setRole('resident'); setProjectId('')
    setFlatNumber(''); setConfirmPwd(''); setReferredBy('')
  }

  function clear(fn) { return (e) => { fn(e.target.value); setError('') } }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isRegister) {
      if (!fullName.trim())                               return setError('Please enter your full name.')
      if (!/^\d{10}$/.test(phone.replace(/\D/g, '')))    return setError('Please enter a valid 10-digit phone number.')
      if (needsProject && !projectId)                     return setError('Please select your building / project.')
      if (needsFlat && !flatNumber)                       return setError('Please select your flat number.')
      if (!referredBy)                                    return setError('Please select an approver name.')
      if (password.length < 6)                            return setError('Password must be at least 6 characters.')
      if (password !== confirmPwd)                        return setError('Passwords do not match.')
    }

    setLoading(true)
    try {
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(cred.user, { displayName: fullName.trim() })
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid:        cred.user.uid,
          fullName:   fullName.trim(),
          email:      email.trim().toLowerCase(),
          phone:      phone.replace(/\D/g, ''),
          role:       role,
          projectId:  needsProject ? projectId : null,
          flatNumber: needsFlat ? parseInt(flatNumber) : null,
          approverName: referredBy,   // consistent field name used by UserApprovalsPanel
          approved:   false,  // ALL self-registered users require approval — no exceptions
          createdAt:  serverTimestamp(),
        })
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use':   'This email is already registered. Please sign in.',
        'auth/invalid-email':          'The email address is not valid.',
        'auth/user-not-found':         'No account found with this email.',
        'auth/wrong-password':         'Incorrect password.',
        'auth/invalid-credential':     'Incorrect email or password.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/too-many-requests':      'Too many attempts. Please try again later.',
      }
      setError(msgs[err.code] || err.message.replace('Firebase: ', '').replace(/\(auth.*\)/, ''))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="text-center pt-8 pb-4 px-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Home size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">GM Residential Group</h1>
          <p className="text-gray-500 text-sm mt-0.5">Management Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">

          {isRegister && (<>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
              <input type="text" value={fullName} onChange={clear(setFullName)}
                placeholder="e.g. Rajesh Kumar" required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number *</label>
              <div className="flex gap-2">
                <span className="px-3 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-500 font-semibold">+91</span>
                <input type="tel" value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g,'').slice(0,10)); setError('') }}
                  placeholder="10-digit number" required
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role *</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <button key={r.value} type="button"
                    onClick={() => { setRole(r.value); setProjectId(''); setFlatNumber(''); setError('') }}
                    className={
                      "text-left px-3 py-2.5 rounded-xl border-2 transition " +
                      (role === r.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300")
                    }
                  >
                    <p className="font-bold text-xs">{r.label}</p>
                    <p className="text-xs opacity-60 mt-0.5 leading-tight">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Project selector — residents and project admins */}
            {needsProject && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {role === 'projectadmin' ? 'Your Building *' : 'Your Building *'}
                </label>
                {projects.length === 0
                  ? <p className="text-xs text-orange-500 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                      No buildings registered yet. Ask your Super Admin to create your building first.
                    </p>
                  : <select value={projectId} onChange={clear(setProjectId)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">— Select your building —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.address}</option>)}
                    </select>
                }
              </div>
            )}

            {/* Flat selector — residents only, after project selected */}
            {needsFlat && projectId && flats.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Flat Number *</label>
                <select value={flatNumber} onChange={clear(setFlatNumber)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">— Select your flat —</option>
                  {flats.map(f => <option key={f} value={f}>Flat {f}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Approver Name *</label>
              <select value={referredBy} onChange={clear(setReferredBy)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">— Select approver —</option>
                {APPROVERS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                This helps the admin verify your identity before approving access.
              </p>
            </div>

          </>)}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email *</label>
            <input type="email" value={email} onChange={clear(setEmail)}
              placeholder="you@email.com" required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password *</label>
            <input type="password" value={password} onChange={clear(setPassword)}
              placeholder="••••••••" required minLength={6}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm Password *</label>
              <input type="password" value={confirmPwd} onChange={clear(setConfirmPwd)}
                placeholder="••••••••" required minLength={6}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Request Access →' : 'Sign In →'}
          </button>

          <p className="text-center text-sm text-gray-500 pt-1">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
            <button type="button" onClick={() => switchMode(!isRegister)}
              className="text-blue-600 font-semibold ml-1 hover:underline"
            >
              {isRegister ? 'Sign In' : 'Register'}
            </button>
          </p>

        </form>
      </div>
    </div>
  )
}
