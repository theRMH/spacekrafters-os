import type { UserRole, Permission, AuthUser } from '../types'
import { ROLE_PERMISSIONS, SCREEN_PERMISSIONS } from '../data/permissions'

// Accepts either a single role or every role assigned to a multi-role user —
// permission is granted if ANY assigned role grants it.
export function hasPermission(role: UserRole | UserRole[], permission: Permission): boolean {
  const roles = Array.isArray(role) ? role : [role]
  return roles.some(r => ROLE_PERMISSIONS[r]?.includes(permission) ?? false)
}

// Does this user hold `role` among ALL their assigned roles (not just the
// single active `role` field)? Use this instead of `user?.role === 'x'` so
// multi-role accounts get every role's features without switching.
export function hasRole(user: Pick<AuthUser, 'role' | 'roles'> | null | undefined, role: UserRole): boolean {
  if (!user) return false
  return (user.roles ?? [user.role]).includes(role)
}

export function canAccessScreen(role: UserRole | UserRole[], screenPath: string): boolean {
  const required = SCREEN_PERMISSIONS[screenPath]
  if (!required) return true
  return hasPermission(role, required)
}

export function getDefaultRoute(role: UserRole): string {
  switch (role) {
    case 'owner':                return '/dashboard'
    default:                     return '/my-tasks'
  }
}
