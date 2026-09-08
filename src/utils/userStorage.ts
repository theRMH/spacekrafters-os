import type { ManagedUser } from '../types'
import { getAllManagedUsers, getManagedUsersDirectory, upsertManagedUsers, updateManagedUserFields } from '../services/userService'
import { ROLE_LABELS } from '../data/permissions'

let _cache: ManagedUser[] = []

export function loadManagedUsers(): ManagedUser[] {
  return _cache
}

export function saveManagedUsers(users: ManagedUser[]): void {
  _cache = users
  upsertManagedUsers(users).catch(() => {})
}

// Updates a single user's own profile (name/photo) — unlike saveManagedUsers,
// only sends this one row remotely rather than re-upserting every cached user,
// since a non-owner session is only ever allowed to write its own row under RLS.
export function updateManagedUserProfile(updated: ManagedUser): void {
  _cache = _cache.map(u => u.id === updated.id ? updated : u)
  updateManagedUserFields(updated).catch(() => {})
}

export async function initUsersFromSupabase(): Promise<void> {
  // `users` is RLS-limited to rows this session can fully read (its own row,
  // or every row if it's an owner). `directory` is the safe, password-free
  // view of every user's name/role — see rls-managed-users-directory.sql.
  const [users, directory] = await Promise.all([getAllManagedUsers(), getManagedUsersDirectory()])

  const authoritative = users.length > 0 ? users : (seedDefaultUsers(), _cache)

  // Fill in everyone else visible only through the safe directory (every
  // other user, under RLS, for a non-owner session) — display-only rows with
  // blank mobile/email/password, never written back to Supabase.
  const knownIds = new Set(authoritative.map(u => u.id))
  const directoryOnly = directory.filter(d => !knownIds.has(d.id))
  _cache = [...authoritative, ...directoryOnly]
}

export function isEmailTaken(email: string, excludeId?: string): boolean {
  const norm = email.trim().toLowerCase()
  return _cache.some(u => u.email.toLowerCase() === norm && u.id !== excludeId)
}

export function isMobileTaken(mobile: string, excludeId?: string): boolean {
  const norm = mobile.replace(/\D/g, '')
  return _cache.some(u => u.mobile.replace(/\D/g, '') === norm && u.id !== excludeId)
}

// ─── Seed users — one per role ─────────────────────────────────────────────

const SEED_DATE = '2026-01-01T00:00:00.000Z'

export const DEFAULT_SEED_USERS: ManagedUser[] = [
  {
    id:            'seed_owner',
    fullName:      'Owner',
    mobile:        '9000000001',
    email:         'owner@spacekrafters.in',
    password:      'SKS@Owner25',
    role:          'owner',
    displayRole:   ROLE_LABELS.owner,
    department:    'Management',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_accounts',
    fullName:      'Accounts Lead',
    mobile:        '9000000002',
    email:         'accounts@spacekrafters.in',
    password:      'SKS@Acc25',
    role:          'accounts',
    displayRole:   ROLE_LABELS.accounts,
    department:    'Finance',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_pc',
    fullName:      'Project Coordinator',
    mobile:        '9000000003',
    email:         'coordinator@spacekrafters.in',
    password:      'SKS@PC25',
    role:          'project_coordinator',
    displayRole:   ROLE_LABELS.project_coordinator,
    department:    'Projects',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_site_engineer',
    fullName:      'Site Engineer',
    mobile:        '9000000004',
    email:         'site@spacekrafters.in',
    password:      'SKS@SE25',
    role:          'site_engineer',
    displayRole:   ROLE_LABELS.site_engineer,
    department:    'Site',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_designer',
    fullName:      'Designer',
    mobile:        '9000000005',
    email:         'designer@spacekrafters.in',
    password:      'SKS@Des25',
    role:          'designer',
    displayRole:   ROLE_LABELS.designer,
    department:    'Design',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_qs',
    fullName:      'Quantity Surveyor',
    mobile:        '9000000006',
    email:         'qs@spacekrafters.in',
    password:      'SKS@QS25',
    role:          'qs',
    displayRole:   ROLE_LABELS.qs,
    department:    'Estimation',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_purchase',
    fullName:      'Purchase Lead',
    mobile:        '9000000007',
    email:         'purchase@spacekrafters.in',
    password:      'SKS@Pur25',
    role:          'purchase',
    displayRole:   ROLE_LABELS.purchase,
    department:    'Procurement',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
  {
    id:            'seed_admin',
    fullName:      'Admin',
    mobile:        '9000000008',
    email:         'admin@spacekrafters.in',
    password:      'SKS@Adm25',
    role:          'admin',
    displayRole:   ROLE_LABELS.admin,
    department:    'Administration',
    status:        'active',
    createdBy:     'system',
    createdByRole: 'owner',
    createdAt:     SEED_DATE,
    updatedAt:     SEED_DATE,
  },
]

export function seedDefaultUsers(): void {
  if (_cache.length > 0) return
  saveManagedUsers(DEFAULT_SEED_USERS)
}

export function getActiveManagedUsersByDisplayRole(displayRole: string): string[] {
  return _cache
    .filter(u => u.status === 'active' && u.displayRole === displayRole)
    .map(u => u.fullName)
}
