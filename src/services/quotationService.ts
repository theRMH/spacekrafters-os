import { supabase } from '../lib/supabase'
import type { Quotation } from '../types'

const TABLE = 'sks_quotations'

export async function getAllQuotations(): Promise<Quotation[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Quotation)
}

export async function upsertQuotation(quotation: Quotation): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         quotation.id,
    lead_id:    quotation.leadId,
    project_id: quotation.projectId ?? null,
    status:     quotation.status,
    data:       quotation,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteQuotation(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteQuotations(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().in('id', ids)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
