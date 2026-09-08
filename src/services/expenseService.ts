import { supabase } from '../lib/supabase'
import type { ExpenseRequest } from '../types'

const TABLE = 'sks_expense_requests'

export async function getAllExpenseRequests(): Promise<ExpenseRequest[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as ExpenseRequest)
}

export async function upsertExpenseRequest(req: ExpenseRequest): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:           req.id,
    project_id:   req.projectId ?? null,
    requested_by: req.requestedBy,
    status:       req.status,
    data:         req,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
