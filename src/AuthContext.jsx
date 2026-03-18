import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null)
  const [role,       setRole]       = useState(null)
  const [flatNumber, setFlatNumber] = useState(null)
  const [userName,   setUserName]   = useState(null)
  const [approved,   setApproved]   = useState(false)
  const [projectId,  setProjectId]  = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref  = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(ref)

        if (!snap.exists()) {
          // Legacy fallback — exists in Auth but not Firestore
          await setDoc(ref, {
            email:    firebaseUser.email,
            role:     'resident',
            approved: false,
          })
          setRole('resident')
          setFlatNumber(null)
          setUserName(firebaseUser.email)
          setApproved(false)
          setProjectId(null)
        } else {
          const data = snap.data()
          const r = data.role || 'resident'
          setRole(r)
          setFlatNumber(data.flatNumber || null)
          setUserName(data.fullName || data.name || firebaseUser.email)
          setProjectId(data.projectId || null)

          // ── Approval logic ──────────────────────────────────
          // EVERY role requires explicit approved:true in Firestore.
          // No role is ever auto-approved on login.
          // SuperAdmin/ReadOnly can only be assigned by an existing SuperAdmin
          // via UserApprovalsPanel — they still need approved:true set there.
          setApproved(data.approved === true)
        }
        setUser(firebaseUser)
      } else {
        setUser(null)
        setRole(null)
        setFlatNumber(null)
        setUserName(null)
        setApproved(false)
        setProjectId(null)
      }
      setLoading(false)
    })
  }, [])

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, role, flatNumber, userName,
      approved, projectId, loading, logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
