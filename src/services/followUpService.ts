import { supabase } from '../lib/supabase'
import type { FollowUp } from '../types'

const TABLE = 'sks_follow_ups'

export async function getAllFollowUps(): Promise<FollowUp[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as FollowUp)
}

export async function upsertFollowUp(followUp: FollowUp): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         followUp.id,
    lead_id:    followUp.leadId,
    owner_id:   followUp.ownerId ?? null,
    status:     followUp.status,
    data:       followUp,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteFollowUp(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
