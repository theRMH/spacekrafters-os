// Shared appointment-mutation helper — the exact same field semantics as
// MDTasksScreen.tsx's handleDecision(), so the Tasks screen's in-page
// reschedule-approval mini-flow writes identical data through the identical
// persistence call (upsertAppointment) rather than inventing any new status
// or field. Kept as a standalone function rather than refactoring that
// already-working, already-tested file to import from here — lower risk,
// same semantics, verified field-by-field against its current code.
import { upsertAppointment } from '../../services/appointmentService'
import { toProperIso } from './appointmentDate'
import { sendNotification } from '../../utils/notifications'
import type { Appointment, Lead, UserRole } from '../../types'

interface ActionResult { ok: boolean; error?: string; updated?: Appointment }

// Mirrors MDTasksScreen.handleDecision()'s field writes exactly.
export async function decideAppointmentReschedule(
  appt: Appointment, approved: boolean, mdNotes: string, decidedByName: string, decidedByRole?: UserRole,
): Promise<ActionResult> {
  const now = new Date().toISOString()
  const updated: Appointment = {
    ...appt,
    status: approved ? 'scheduled' : appt.status,
    scheduledAt: approved
      ? (appt.rescheduledDate ? toProperIso(appt.rescheduledDate) : appt.scheduledAt)
      : appt.scheduledAt,
    rescheduleRequestStatus: approved ? 'accepted' : 'rejected',
    rescheduleAcceptedBy: approved ? decidedByName : undefined,
    rescheduleAcceptedAt: approved ? now : undefined,
    rescheduleMdNotes: mdNotes.trim() || undefined,
    rescheduleHistory: [...(appt.rescheduleHistory ?? []), {
      decision: approved ? 'accepted' as const : 'rejected' as const,
      by: decidedByName, byRole: decidedByRole, at: now,
      note: mdNotes.trim() || undefined,
      reason: appt.rescheduleReason,
      requestedBy: appt.rescheduleRequestedBy,
      requestedAt: appt.rescheduleRequestedAt,
      newDate: appt.rescheduledDate,
    }],
    updatedAt: now,
  }
  const result = await upsertAppointment(updated)
  return { ...result, updated: result.ok ? updated : undefined }
}

// The single, centralized reschedule-decision flow — Appointment update
// (above) + the Lead's own advance-to-Site-Visit side effect + the owner
// notification, all in one place. This used to be duplicated three ways
// (LeadStatusSheet.tsx, TasksScreen.tsx's in-page mini-flow, and the old
// MDTasksScreen.tsx) because the real decision screen kept moving around;
// now that the Approval page is the single place this decision is made,
// there's exactly one copy of the field writes to keep correct.
//
// Deliberately does NOT touch assignedToId/assignedToName/assignedRole —
// advancing a lead's status never reassigns it to a different person. The
// lead keeps whoever is currently responsible (its owner, or whoever they
// explicitly handed it to) until that person — not an automatic stage
// transition — explicitly hands it to someone else.
export async function decideRescheduleAndAdvanceLead(params: {
  appt: Appointment
  approved: boolean
  notes: string
  lead: Lead
  decidedByName: string
  decidedByRole?: UserRole
  updateLead: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
}): Promise<{ ok: boolean; error?: string }> {
  const { appt, approved, notes, lead, decidedByName, decidedByRole, updateLead } = params
  const result = await decideAppointmentReschedule(appt, approved, notes, decidedByName, decidedByRole)
  if (!result.ok || !result.updated) return { ok: false, error: result.error ?? 'Could not record decision.' }

  const advance = approved && lead.status === 'qualified'
  const note = approved
    ? 'MD accepted the appointment reschedule' + (advance ? ' — site visit scheduled' : '') + (notes.trim() ? `: ${notes.trim()}` : '')
    : `MD rejected the appointment reschedule${notes.trim() ? `: ${notes.trim()}` : ''}`
  await updateLead(lead.id, advance ? { status: 'site_visit_scheduled' } : {}, note)
  if (lead.ownerId) {
    await sendNotification(
      [lead.ownerId],
      approved ? 'Reschedule Accepted' : 'Reschedule Rejected',
      `${lead.name} (${lead.leadNumber ?? lead.id}) — ${approved ? 'MD accepted the reschedule.' : 'MD rejected the reschedule.'}${notes.trim() ? ` Notes: ${notes.trim()}` : ''}`,
    )
  }
  return { ok: true }
}
