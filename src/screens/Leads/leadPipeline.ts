import type { LeadStatus, Quotation } from '../../types'

// The lead flow is 7 stages: New → Contacted → Site Visit → Requirements → Quotation → Payment → Project.
// The status values below are the ones a lead moves through now. Older leads may still hold one of the
// retired values (qualified, site_visit_scheduled, internally_approved, design_in_progress, design_approved,
// sent_to_client, negotiating) — coreStatus() maps those onto the stage they belong to, so they keep working.
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
    case 'internally_approved': case 'design_in_progress': case 'design_approved':
    case 'sent_to_client': case 'negotiating': return 'quotation_drafted'
    default: return status
  }
}

// The stages that move on their own as the real records progress (up to client approval). Won/Lost are
// deliberate decisions and are never touched by the catch-up in LeadStatusSheet.
export const AUTO_STAGES: LeadStatus[] = ['new', 'contacted', 'site_visit_done', 'requirements_captured', 'quotation_drafted', 'client_approved']

// The earliest stage a lead can be at, judging by its quotation. Used to catch a lead up when it is behind
// its quotation (e.g. the client approved the quotation but the lead still says Quotation).
export function impliedMinLeadStatus(quotation: Quotation | null): LeadStatus | null {
  if (!quotation) return null
  return quotation.status === 'client_approved' ? 'client_approved' : 'quotation_drafted'
}
