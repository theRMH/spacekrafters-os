import type { LeadStatus, Quotation } from '../../types'

// The lead flow is 7 stages: New → Contacted → Site Visit → Requirements → Quotation → Payment → Project.
// Inside the Quotation stage the lead's status follows the quotation step by step (Quotation Created → Sent to MD →
// MD Approved → Sent to Client → Client Approved), so the status shown always says where things stand.
// Older leads may still hold a retired status (qualified, site_visit_scheduled, design_*, negotiating) —
// coreStatus() maps those onto the stage they belong to, so they keep working.
export const PIPELINE: { status: LeadStatus; label: string }[] = [
  { status: 'new',                   label: 'New' },
  { status: 'contacted',             label: 'Contacted' },
  { status: 'site_visit_done',       label: 'Site Visit' },
  { status: 'requirements_captured', label: 'Requirements' },
  { status: 'quotation_drafted',     label: 'Quotation' },
  { status: 'client_approved',       label: 'Payment' },
  { status: 'won',                   label: 'Project' },
]

export function coreStatus(status: LeadStatus): LeadStatus {
  switch (status) {
    case 'qualified': case 'site_visit_scheduled': return 'contacted'
    case 'sent_to_md': case 'md_rejected': case 'client_rejected': case 'internally_approved':
    case 'design_in_progress': case 'design_approved': case 'sent_to_client': case 'negotiating': return 'quotation_drafted'
    default: return status
  }
}

// The stages that move on their own as the real records progress (up to client approval). Won/Lost are
// deliberate decisions and are never touched by the catch-up in LeadStatusSheet.
export const AUTO_STAGES: LeadStatus[] = ['new', 'contacted', 'site_visit_done', 'requirements_captured', 'quotation_drafted', 'client_approved']

// The lead status that matches a quotation's current step (null = leave the lead as it is).
export function leadStatusForQuotation(status: Quotation['status']): LeadStatus | null {
  switch (status) {
    case 'draft': case 'pending_pc_review': return 'quotation_drafted'
    case 'internal_review': return 'sent_to_md'
    case 'md_rejected': case 'pc_rejected': return 'md_rejected'
    case 'internally_approved': return 'internally_approved'
    case 'sent_to_client': return 'sent_to_client'
    case 'revision_requested': return 'client_rejected'
    case 'client_approved': return 'client_approved'
    default: return null
  }
}

// What the lead's status should become according to its quotation, when it is behind or out of step (so the
// status shown always matches the quotation). Never moves a lead backwards past its stage, and never
// touches Won/Lost.
export function statusToSyncFromQuotation(current: LeadStatus, quotation: Quotation | null): LeadStatus | null {
  const desired = quotation ? leadStatusForQuotation(quotation.status) : null
  if (!desired || desired === current) return null
  const curIdx = AUTO_STAGES.indexOf(coreStatus(current))
  const wantIdx = AUTO_STAGES.indexOf(coreStatus(desired))
  return curIdx !== -1 && curIdx <= wantIdx ? desired : null
}
