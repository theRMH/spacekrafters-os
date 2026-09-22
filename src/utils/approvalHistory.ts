import type { Appointment, DesignPackage, Quotation, RescheduleDecisionItem, UserRole } from '../types'

// Builds one approval-history entry (who did it, in which role, when). Shared by
// the Design Center and the MD Task tab so every approval action is stamped the
// same way.
export function approvalHistoryEntry<S extends string>(
  status: S,
  label: string,
  user: { name: string; role: UserRole } | null | undefined,
  note?: string,
) {
  return { status, label, note: note || undefined, by: user?.name ?? 'Unknown', byRole: user?.role, at: new Date().toISOString() }
}

// The labels the MD's Approve / Reject actions write into a quotation's or
// design package's history.
export const isMdDecisionLabel = (label: string) => label === 'MD approved' || label === 'MD rejected'

// The labels the client-approval stage (Approval → Quotation, recorded by the
// MD on the client's behalf) writes into a quotation's history — a separate
// decision from the MD's own internal approval above.
export const isClientDecisionLabel = (label: string) => label === 'Client approved' || label === 'Client requested a revision'

// A quotation / design can only be in these statuses after the MD approved it.
// Items approved before approval history was recorded (2026-09-21) are in one
// of them but have no "MD approved" entry — they're still approved records and
// must not vanish from the history.
const PAST_MD_APPROVAL = ['internally_approved', 'sent_to_client', 'client_approved', 'revision_requested']
export function isApprovedBeforeHistory(item: { status: string; statusHistory?: { label: string }[] }): boolean {
  return PAST_MD_APPROVAL.includes(item.status) && !(item.statusHistory ?? []).some(h => h.label === 'MD approved')
}

// Every MD decision on a reschedule request. Decisions made before the decision
// log existed only left the latest request's fields on the appointment — still
// report that one.
export function rescheduleDecisions(a: Appointment): RescheduleDecisionItem[] {
  if ((a.rescheduleHistory ?? []).length > 0) return a.rescheduleHistory!
  if (a.rescheduleRequestStatus === 'accepted' || a.rescheduleRequestStatus === 'rejected') {
    return [{
      decision: a.rescheduleRequestStatus,
      by: a.rescheduleAcceptedBy ?? 'MD',
      at: a.rescheduleAcceptedAt ?? a.updatedAt,
      note: a.rescheduleMdNotes,
      reason: a.rescheduleReason,
    }]
  }
  return []
}

// Number of MD decisions (accepted + rejected) recorded across all three
// approval types — the "Done" figure on the MD Task page.
export function countMdDecisions(quotations: Quotation[], packages: DesignPackage[], appointments: Appointment[]): number {
  const fromHistory = (items: { statusHistory?: { label: string }[] }[]) =>
    items.reduce((n, item) => n + (item.statusHistory ?? []).filter(h => isMdDecisionLabel(h.label)).length, 0)
  const legacy = quotations.filter(isApprovedBeforeHistory).length + packages.filter(isApprovedBeforeHistory).length
  return fromHistory(quotations) + fromHistory(packages) + legacy + appointments.reduce((n, a) => n + rescheduleDecisions(a).length, 0)
}
