import { supabase } from '../lib/supabase'
import type { WeeklyPlanEntry } from '../types'

const TABLE = 'sks_weekly_plans'

export async function getAllWeeklyPlans(): Promise<WeeklyPlanEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('date', { ascending: true })
  if (error || !data) return []
  return data.map(r => r.data as WeeklyPlanEntry)
}

export async function upsertWeeklyPlan(entry: WeeklyPlanEntry): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         entry.id,
    user_id:    entry.userId,
    date:       entry.date,
    data:       entry,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,date' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteWeeklyPlan(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
