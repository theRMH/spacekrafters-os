import { supabase } from '../lib/supabase'
import type { DailyTask } from '../types'

const TABLE = 'sks_daily_tasks'

export async function getAllDailyTasks(): Promise<DailyTask[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('date', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as DailyTask)
}

export async function upsertDailyTask(task: DailyTask): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:          task.id,
    assignee_id: task.assigneeId,
    date:        task.date,
    status:      task.status,
    data:        task,
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Distinct from upsertDailyTask above: this issues a real UPDATE (PATCH),
// not an upsert (POST ... ON CONFLICT). An upsert's INSERT-vs-conflict path
// makes Postgres evaluate the table's INSERT policy even when the row
// already exists and the net effect is just an update — since only MD can
// INSERT here, an employee flipping their own task's status via
// upsertDailyTask() would 403 on the INSERT policy despite the UPDATE
// policy correctly allowing it. A genuine UPDATE only ever needs the UPDATE
// policy, which does allow assignee_id = sks_my_id().
export async function updateDailyTaskStatus(task: DailyTask): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE)
    .update({ status: task.status, data: task, updated_at: new Date().toISOString() })
    .eq('id', task.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteDailyTask(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
