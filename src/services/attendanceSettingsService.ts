import { supabase } from '../lib/supabase'
import type { AttendanceSettings } from '../types'

const TABLE = 'sks_integration_settings'
const ROW_ID = 'attendance'

export async function getAttendanceSettings(): Promise<AttendanceSettings | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle()
  if (error || !data) return null
  return data.data as AttendanceSettings
}

export async function upsertAttendanceSettings(settings: AttendanceSettings): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id: ROW_ID,
    data: settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
