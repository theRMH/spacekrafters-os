import { supabase } from '../lib/supabase'
import type { AuditLog } from '../types'

const TABLE = 'sks_audit_log'

export async function getAllAuditLogs(): Promise<AuditLog[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => ({
    id: r.id,
    projectId: r.project_id ?? undefined,
    action: r.action,
    description: r.description,
    createdBy: r.created_by,
    createdByRole: r.created_by_role,
    createdAt: r.created_at,
  }))
}

export async function addAuditLog(entry: AuditLog): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).insert({
    id:              entry.id,
    project_id:      entry.projectId ?? null,
    action:          entry.action,
    description:     entry.description,
    data:            entry,
    created_by:      entry.createdBy,
    created_by_role: entry.createdByRole,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
