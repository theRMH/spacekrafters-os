import { supabase } from '../lib/supabase'
import type { AttendanceRecord } from '../types'

const TABLE = 'sks_attendance'

export async function getAllAttendance(): Promise<AttendanceRecord[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('date', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as AttendanceRecord)
}

export async function upsertAttendance(record: AttendanceRecord): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         record.id,
    user_id:    record.userId,
    date:       record.date,
    data:       record,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,date' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
