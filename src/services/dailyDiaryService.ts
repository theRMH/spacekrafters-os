import { supabase } from '../lib/supabase'
import type { DailyDiaryEntry } from '../types'

const TABLE = 'sks_daily_diary'

export async function getAllDiaryEntries(): Promise<DailyDiaryEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as DailyDiaryEntry)
}

// Needs the owner DELETE policy in supabase/owner-edit-policies.sql — without it
// Postgres silently deletes 0 rows and returns no error, so confirm a row went.
export async function deleteDiaryEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Delete was blocked by the database (owner delete policy not applied yet).' }
  return { ok: true }
}

export async function upsertDiaryEntry(entry: DailyDiaryEntry): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         entry.id,
    project_id: entry.projectId,
    created_by: entry.createdBy,
    data:       entry,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
