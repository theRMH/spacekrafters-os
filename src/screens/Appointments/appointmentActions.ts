// Shared appointment-mutation helper — the exact same field semantics as
// MDTasksScreen.tsx's handleDecision(), so the Tasks screen's in-page
// reschedule-approval mini-flow writes identical data through the identical
// persistence call (upsertAppointment) rather than inventing any new status
// or field. Kept as a standalone function rather than refactoring that
// already-working, already-tested file to import from here — lower risk,
// same semantics, verified field-by-field against its current code.
import { upsertAppointment } from '../../services/appointmentService'
import { toProperIso } from './appointmentDate'
import type { Appointment, UserRole } from '../../types'

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
