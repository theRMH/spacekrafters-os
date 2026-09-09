import { supabase } from '../lib/supabase'
import type { PunchListItem } from '../types'

const TABLE = 'sks_punch_list_items'

export async function getAllPunchListItems(): Promise<PunchListItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PunchListItem)
}

export async function upsertPunchListItem(item: PunchListItem): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         item.id,
    project_id: item.projectId,
    status:     item.status,
    data:       item,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
