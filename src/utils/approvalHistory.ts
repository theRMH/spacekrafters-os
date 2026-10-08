import type { UserRole } from '../types'

// Builds one approval-history entry (who did it, in which role, when). Shared by
// the Design Center and the MD Task tab so every approval action is stamped the
// same way.
export function approvalHistoryEntry<S extends string>(
  status: S,
  label: string,
  user: { name: string; role: UserRole } | null | undefined,
  note?: string,
) {
  return { status, label, note: note || undefined, by: user?.name ?? 'Unknown', byRole: user?.role, at: new Date().toISOString() }
}
