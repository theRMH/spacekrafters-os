// The single place a Quotation's PC/MD status actually changes — called by
// both QuotationsScreen.tsx's own Detail sheet and the compact Lead-page
// status card (QuotationStatusCard.tsx), so there is exactly one
// implementation of the transition + history + notify + Lead-advance logic.
// Screen-specific downstream concerns (project contractValue sync on
// client_approved, the legacy 'rejected' audit log, totals/sections/send-to-
// client/advance-payment) stay in QuotationsScreen.tsx — those aren't part of
// the plain status transition and aren't reachable from the compact card
// (which only ever acts while the Lead is still at 'quotation_drafted').
import { upsertQuotation } from '../../services/quotationService'
import { getManagedUsersDirectory } from '../../services/userService'
import { sendNotification } from '../../utils/notifications'
import { statusToSyncFromQuotation } from '../Leads/leadPipeline'
import type { Quotation, QuotationStatus, QuotationStatusHistoryItem, Lead, UserRole } from '../../types'

const STATUS_HISTORY_LABEL: Partial<Record<QuotationStatus, string>> = {
  pending_pc_review:   'Sent to PC for review',
  internal_review:     'PC approved — sent to MD for approval',
  internally_approved: 'MD approved',
  sent_to_client:       'Sent to client',
  client_approved:      'Client approved',
  revision_requested:   'Client rejected the quotation',
}

interface ActionResult { ok: boolean; error?: string; updated?: Quotation }

export async function changeQuotationStatus(params: {
  quotation: Quotation
  status: QuotationStatus
  decidedByName: string
  decidedByRole?: UserRole
  note?: string
  labelOverride?: string
  leadLabel?: string
  // Needed only to drive the Lead-advance side effect — omit for callers
  // that don't have the lead loaded (the side effect is then just skipped).
  lead?: Lead
  updateLead?: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
}): Promise<ActionResult> {
  const { quotation: q, status, decidedByName, decidedByRole, note, labelOverride, leadLabel, lead, updateLead } = params
  const label = labelOverride ?? (status === 'rejected'
    ? (q.status === 'internal_review' ? 'MD rejected' : 'Client rejected')
    : STATUS_HISTORY_LABEL[status] ?? status)
  // revision_requested = the client rejected it; the reason is kept so the MD (and later the PC) can read it.
  const isRejection = status === 'rejected' || status === 'pc_rejected' || status === 'md_rejected' || status === 'revision_requested'
  const wasClientRejected = q.status === 'revision_requested'
  const entry: QuotationStatusHistoryItem = { status, label, note: note?.trim() || undefined, by: decidedByName, byRole: decidedByRole, at: new Date().toISOString() }
  const updated: Quotation = {
    ...q, status,
    sentAt: status === 'sent_to_client' ? new Date().toISOString() : q.sentAt,
    approvedAt: status === 'client_approved' ? new Date().toISOString() : q.approvedAt,
    rejectionReason: isRejection ? (note ?? (wasClientRejected ? q.rejectionReason : undefined)) : undefined,
    statusHistory: [...(q.statusHistory ?? []), entry],
    updatedAt: new Date().toISOString(),
  }
  const result = await upsertQuotation(updated)
  if (!result.ok) return { ok: false, error: result.error }

  if (status === 'pending_pc_review') await notifyPcPending(updated, leadLabel)
  if (status === 'internal_review') await notifyMdPending(updated, leadLabel)
  if (status === 'revision_requested') await notifyPcClientRejected(updated, leadLabel)

  if (lead && updateLead) {
    // The lead's status follows the quotation (Sent to MD, MD Approved, Sent to Client, Client Approved, …),
    // and the step is logged in its activity.
    const next = statusToSyncFromQuotation(lead.status, updated)
    await updateLead(lead.id, next ? { status: next } : {}, status === 'revision_requested' ? `Client rejected the quotation${note ? `: ${note}` : ''}` : label)
  }

  return { ok: true, updated }
}

// Records an advance decision on an already-client-approved quotation
// ('Proceed with Advance' / 'Proceed without Advance' / recording a payment
// that arrives later) — a field patch, not a status transition, so it's a
// separate function from changeQuotationStatus above. Single implementation
// shared by QuotationsScreen.tsx's own Advance Payment sheet and the
// compact Lead-page card (QuotationStatusCard.tsx).
export async function recordQuotationAdvanceDecision(params: {
  quotation: Quotation
  patch: Partial<Quotation>
  label: string
  note: string
  decidedByName: string
  decidedByRole?: UserRole
  lead?: Lead
  updateLead?: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
}): Promise<ActionResult> {
  const { quotation: q, patch, label, note, decidedByName, decidedByRole, lead, updateLead } = params
  const entry: QuotationStatusHistoryItem = { status: q.status, label, note: note || undefined, by: decidedByName, byRole: decidedByRole, at: new Date().toISOString() }
  const updated: Quotation = {
    ...q, ...patch,
    statusHistory: [...(q.statusHistory ?? []), entry],
    updatedAt: new Date().toISOString(),
  }
  const result = await upsertQuotation(updated)
  if (!result.ok) return { ok: false, error: result.error }
  // The choice (and any payment) is also copied onto the lead — the project created from it starts with this advance received.
  if (lead && updateLead) {
    const payment = {
      ...(patch.advanceStatus ? { advanceStatus: patch.advanceStatus } : {}),
      ...(patch.advancePaymentReceived ? { advancePaymentAmount: patch.advancePaymentAmount, advancePaymentRef: patch.advancePaymentRef } : {}),
    }
    await updateLead(lead.id, payment, `${label} — ${note}`)
  }
  return { ok: true, updated }
}

async function notifyMdPending(q: Quotation, leadLabel?: string) {
  const mdIds = (await getManagedUsersDirectory()).filter(u => u.role === 'owner').map(u => u.id)
  await sendNotification(mdIds, 'Quotation Pending MD Approval', `${leadLabel ?? q.leadId} — sent to MD for approval.`, '/approval')
}
async function notifyPcClientRejected(q: Quotation, leadLabel?: string) {
  const pcIds = (await getManagedUsersDirectory()).filter(u => u.role === 'project_coordinator').map(u => u.id)
  await sendNotification(pcIds, 'Client Rejected Quotation', `${leadLabel ?? q.leadId} — edit the quotation and send it to the MD again.`, `/quotations?quotationId=${q.id}`)
}
async function notifyPcPending(q: Quotation, leadLabel?: string) {
  const pcIds = (await getManagedUsersDirectory()).filter(u => u.role === 'project_coordinator').map(u => u.id)
  // PC doesn't have access to /approval (owner-only) — deep-link straight to
  // this exact quotation instead, via QuotationsScreen's own ?quotationId=
  // query-param effect.
  await sendNotification(pcIds, 'Quotation Pending PC Review', `${leadLabel ?? q.leadId} — waiting for PC review.`, `/quotations?quotationId=${q.id}`)
}
