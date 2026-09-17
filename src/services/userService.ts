import { supabase } from '../lib/supabase'
import type { ManagedUser } from '../types'

const TABLE = 'sks_managed_users'

export async function getAllManagedUsers(): Promise<ManagedUser[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as ManagedUser)
}

// Safe, password-free directory of every user (name/role/status only) — for
// populating "assign a person" dropdowns. sks_managed_users' own SELECT policy
// only allows reading your own row or every row as an owner, so this goes
// through the sks_managed_users_directory() SECURITY DEFINER function instead,
// which every authenticated role can call (see supabase/rls-managed-users-directory.sql).
// Mobile/email/password aren't in this table — never render/use them from
// results returned by this function.
interface DirectoryRow {
  id: string
  full_name: string
  role: string
  status: 'active' | 'inactive'
  display_role: string | null
  roles: string[] | null
  display_roles: string[] | null
  department: string | null
}
export async function getManagedUsersDirectory(): Promise<ManagedUser[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('sks_managed_users_directory')
  if (error || !data) return []
  return (data as DirectoryRow[]).map(r => ({
    id:            r.id,
    fullName:      r.full_name,
    mobile:        '',
    email:         '',
    password:      '',
    role:          r.role as ManagedUser['role'],
    displayRole:   r.display_role ?? '',
    // The RPC returns `[]` (not null) for accounts created without an
    // explicit roles array (e.g. Raymond Thirupugazh, Rinoshika) — treating
    // that as "no roles at all" broke hasRole()/hasPermission()'s `??`
    // fallback to the single `role` field everywhere this directory feeds
    // into a permission check, so normalize it to undefined here instead.
    roles:         (r.roles && r.roles.length > 0 ? r.roles : undefined) as ManagedUser['roles'],
    displayRoles:  r.display_roles ?? undefined,
    department:    r.department ?? undefined,
    status:        r.status,
    createdBy:     '',
    createdByRole: '',
    createdAt:     '',
    updatedAt:     '',
  }))
}

// Looks up the managed-user profile linked to a Supabase Auth session (auth.users.id).
// Throws on a real fetch error (network blip, RLS issue) instead of returning
// null, so callers can tell that apart from "no matching row" — treating a
// transient error as "user doesn't exist" was signing people out on refresh.
export async function getManagedUserByAuthId(authUserId: string): Promise<ManagedUser | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from(TABLE).select('data').eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data.data as ManagedUser) : null
}

// Creates/updates the Supabase Auth account matching a managed user's mobile
// number + password — must go through the admin-user-sync Edge Function since
// that requires the service role key, which the browser must never hold.
// Best-effort: a failure here (e.g. the function isn't deployed yet) doesn't
// block saving the managed-user record, but the new/changed login won't work
// until this succeeds — surfaced to the caller so the UI can warn the admin.
export async function syncManagedUserAuth(
  managedUserId: string, mobile: string, password?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'No active session.' }
  const { data, error } = await supabase.functions.invoke('admin-user-sync', {
    body: { managedUserId, mobile, password },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: data?.ok === true, error: data?.error }
}

// Deletes a managed user's Supabase Auth account and their sks_managed_users
// row — same Edge Function as syncManagedUserAuth, since removing the login
// credential also requires the service role key.
export async function deleteManagedUser(managedUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'No active session.' }
  const { data, error } = await supabase.functions.invoke('admin-user-sync', {
    body: { managedUserId, action: 'delete' },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: data?.ok === true, error: data?.error }
}

export async function upsertManagedUser(user: ManagedUser): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from(TABLE).upsert({
    id:         user.id,
    email:      user.email,
    full_name:  user.fullName,
    role:       user.role,
    status:     user.status,
    data:       user,            // full object including password for cross-device auth
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) console.error('[SpaceKrafters] user sync error:', error.message)
}

// Edits an EXISTING row a non-owner is updating for themself (self-service
// profile edit). upsert() routes through Postgres' INSERT policy even for a
// row that already exists (INSERT ... ON CONFLICT under the hood), and
// sks_managed_users' INSERT policy is owner-only — so a non-owner editing their
// own name/photo via upsertManagedUser() would silently fail RLS (42501,
// swallowed by the caller's .catch()). A plain UPDATE is gated by the UPDATE
// policy instead, which does allow auth_user_id = auth.uid() (self-edit).
export async function updateManagedUserFields(user: ManagedUser): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from(TABLE).update({
    email:      user.email,
    full_name:  user.fullName,
    role:       user.role,
    status:     user.status,
    data:       user,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)
  if (error) console.error('[SpaceKrafters] user update error:', error.message)
}

export async function upsertManagedUsers(users: ManagedUser[]): Promise<void> {
  if (!supabase || users.length === 0) return
  const rows = users.map(user => ({
    id:         user.id,
    email:      user.email,
    full_name:  user.fullName,
    role:       user.role,
    status:     user.status,
    data:       user,            // full object including password for cross-device auth
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) console.error('[SpaceKrafters] users bulk sync error:', error.message)
}
