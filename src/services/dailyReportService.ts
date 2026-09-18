import { supabase } from '../lib/supabase'
import type { DailyReport } from '../types'

const TABLE = 'sks_daily_reports'

export async function getAllDailyReports(): Promise<DailyReport[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as DailyReport)
}

export async function upsertDailyReport(report: DailyReport): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id: report.id, project_id: report.projectId, data: report, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
