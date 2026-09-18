import { supabase } from '../lib/supabase'
import type { MaterialRequestForm } from '../types'

const TABLE = 'sks_mrfs'

export async function getAllMRFs(): Promise<MaterialRequestForm[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as MaterialRequestForm)
}

export async function upsertMRF(mrf: MaterialRequestForm): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         mrf.id,
    project_id: mrf.projectId,
    status:     mrf.status,
    data:       mrf,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
