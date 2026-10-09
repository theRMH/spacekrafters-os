import { supabase } from '../lib/supabase'
import type { Appointment } from '../types'

const TABLE = 'sks_appointments'

export async function getAllAppointments(): Promise<Appointment[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Appointment)
}

export async function upsertAppointment(appt: Appointment): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         appt.id,
    lead_id:    appt.leadId,
    owner_id:   appt.coordinatorId ?? null,
    status:     appt.status,
    data:       appt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// A true SQL UPDATE on an already-existing appointment, not an upsert — same
// fix as designService.ts's updateDesignPackage(). sks_appointments' UPDATE
// policy is fully open (USING(true) WITH CHECK(true)), but .upsert() is a SQL
// INSERT...ON CONFLICT DO UPDATE, so Postgres RLS also evaluates the INSERT
// policy (owner/admin/project_coordinator only) even when the row already
// exists — any other assignee's status-change/reschedule write was silently
// matching 0 rows. Use this for any write that only ever touches an existing
// row; keep upsertAppointment for actual appointment creation.
export async function updateAppointment(appt: Appointment): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).update({
    lead_id:    appt.leadId,
    owner_id:   appt.coordinatorId ?? null,
    status:     appt.status,
    data:       appt,
    updated_at: new Date().toISOString(),
  }).eq('id', appt.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteAppointment(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
