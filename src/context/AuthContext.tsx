import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { AuthUser, ManagedUser, Permission, UserRole } from '../types'
import { hasPermission } from '../utils/permissions'
import { syntheticEmailFromMobile } from '../utils/authIdentity'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getManagedUserByAuthId } from '../services/userService'
import { initUsersFromSupabase } from '../utils/userStorage'

export interface LoginResult {
  success: boolean
  error?: string
  // Set on success so the caller can route to the right landing page without
  // racing the setUser() state update below.
  role?: UserRole
}

interface AuthContextValue {
  user:                 AuthUser | null
  isLoggedIn:           boolean
  isAuthReady:          boolean
  loginWithCredentials: (mobile: string, password: string) => Promise<LoginResult>
  logout:               () => void
  can:                  (permission: Permission) => boolean
  updateProfile:        (updates: Partial<Pick<AuthUser, 'name' | 'photo'>>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toAuthUser(m: ManagedUser): AuthUser {
  const initials = m.fullName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  return {
    id: m.id, role: m.role, name: m.fullName, initials, email: m.email,
    displayRole: m.displayRole, roles: m.roles,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfileForSession(authUserId: string): Promise<void> {
      let managed: ManagedUser | null
      try {
        managed = await getManagedUserByAuthId(authUserId)
      } catch {
        // Fetch failed (e.g. a network blip right after a refresh) — retry once
        // rather than signing the user out over a request that never confirmed
        // they're missing.
        try {
          managed = await getManagedUserByAuthId(authUserId)
        } catch {
          return
        }
      }
      if (cancelled) return
      if (!managed || managed.status !== 'active') {
        setUser(null)
        await supabase?.auth.signOut()
        return
      }
      setUser(toAuthUser(managed))
    }

    let unsubscribe: (() => void) | undefined

    async function init() {
      if (!isSupabaseConfigured || !supabase) {
        await initUsersFromSupabase().catch(() => {})
        if (!cancelled) setIsAuthReady(true)
        return
      }

      // Restore the auth session first so initUsersFromSupabase() runs with the
      // right RLS context — calling it before getSession() meant every load hit
      // sks_managed_users as an anonymous request, always saw 0 rows, and tried
      // (and failed) to reseed defaults even when a valid session existed. With
      // no session at all (logged out), skip it entirely — an anonymous reseed
      // attempt can only fail RLS, and loginWithCredentials() populates the
      // cache itself once a session exists.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await initUsersFromSupabase().catch(() => {})
        await loadProfileForSession(session.user.id)
      }
      if (!cancelled) setIsAuthReady(true)

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (cancelled) return
        if (newSession) loadProfileForSession(newSession.user.id)
        else setUser(null)
      })
      unsubscribe = () => subscription.unsubscribe()
    }
    init()

    return () => { cancelled = true; unsubscribe?.() }
  }, [])

  async function loginWithCredentials(mobile: string, password: string): Promise<LoginResult> {
    if (!supabase) return { success: false, error: 'Not configured.' }
    const email = syntheticEmailFromMobile(mobile)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return { success: false, error: 'Invalid phone number or password.' }
    }
    const managed = await getManagedUserByAuthId(data.session.user.id)
    if (!managed) {
      await supabase.auth.signOut()
      return { success: false, error: 'Invalid phone number or password.' }
    }
    // A fresh login (no persisted session at boot) means the mount-time
    // initUsersFromSupabase() never ran authenticated, so the local managed-users
    // cache is still empty — populate it now so screens that read it via
    // loadManagedUsers() (e.g. Settings' own-profile-name sync) work immediately.
    await initUsersFromSupabase().catch(() => {})
    if (managed.status === 'inactive') {
      await supabase.auth.signOut()
      return { success: false, error: 'This user is inactive. Please contact Admin.' }
    }
    setUser(toAuthUser(managed))
    return { success: true, role: managed.role }
  }

  function logout() {
    setUser(null)
    supabase?.auth.signOut()
  }

  function can(permission: Permission): boolean {
    if (!user) return false
    return hasPermission(user.roles ?? user.role, permission)
  }

  function updateProfile(updates: Partial<Pick<AuthUser, 'name' | 'photo'>>) {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, ...updates }
      if (updates.name) {
        next.initials = updates.name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
      }
      return next
    })
  }

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isAuthReady, loginWithCredentials, logout, can, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
