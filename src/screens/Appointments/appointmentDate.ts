// Pure date/time helpers for the appointment scheduling flow — kept separate
// from AppointmentsScreen.tsx so they're independently testable (no React
// rendering needed) and reusable from LeadStatusSheet.tsx/MDTasksScreen.tsx's
// reschedule flow.

import type { Appointment } from '../../types'

export function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function toLocalInputValue(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function todayInputValue(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function nowTimeInputValue(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function isPastScheduledAt(value: string): boolean {
  const d = new Date(value)
  return !isNaN(d.getTime()) && d.getTime() < Date.now()
}

// A DateField+TimeField pair produces a bare "YYYY-MM-DDTHH:mm" string with no
// timezone info — every write path that persists one must run it through this
// first. A bare string is interpreted as local time by whichever device/server
// happens to read it back, which can silently shift the actual scheduled time
// (e.g. a server process in UTC reading a value a browser in IST wrote). This
// always produces a proper absolute UTC ISO string ("...Z") instead, which is
// unambiguous everywhere it's read. Safe to call on an already-proper ISO
// string too (round-trips to the same instant), so it's fine as a defensive
// normalization at both the write site and any point something is read back.
export function toProperIso(value: string): string {
  return new Date(value).toISOString()
}

// A compact, derived "where is this appointment in the reschedule/approval
// flow" label — never stored, always computed from the real status +
// reschedule-approval fields, so there's no second status system to keep in
// sync with the real one.
export type AppointmentStage = 'scheduled' | 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled'

// Appends a labeled note rather than overwriting whatever's already in the
// appointment's existing notes field — used so Complete/Cancel actions can
// record an optional reason without a new dedicated field.
export function mergeNote(existing: string | undefined, label: string, note: string): string | undefined {
  if (!note.trim()) return existing
  const line = `${label}: ${note.trim()}`
  return existing ? `${existing}\n\n${line}` : line
}

export function appointmentStage(appt: Appointment): AppointmentStage {
  if (appt.status === 'completed') return 'completed'
  if (appt.status === 'cancelled') return 'cancelled'
  if (appt.status === 'rescheduled') {
    // rescheduleRequestStatus is always set to 'requested' the moment status
    // becomes 'rescheduled' (LeadStatusSheet.submitReschedule) and flips to
    // 'rejected' on MD reject (MDTasksScreen.handleDecision) — 'accepted'
    // can't coexist with status==='rescheduled' (accept always reverts status
    // to 'scheduled' in the same write), so the final fallback here is
    // unreachable today, kept only as a safe default for unanticipated data.
    return appt.rescheduleRequestStatus === 'rejected' ? 'rejected' : 'pending'
  }
  // status === 'scheduled'
  return appt.rescheduleRequestStatus === 'accepted' ? 'approved' : 'scheduled'
}
