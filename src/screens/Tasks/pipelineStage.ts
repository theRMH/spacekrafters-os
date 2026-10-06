// Derives each Lead's position in the real end-to-end pipeline (Lead status,
// refined by its appointment sub-state while qualified, then handed off to
// the linked Project's own stage once won) — nothing here is stored; it's
// recomputed from the existing Lead/Appointment/Project fields every render,
// so there's no second status system that can drift out of sync with the
// real one. Kept out of appointmentDate.ts specifically to avoid a circular
// import: this module imports LEAD_STATUS_LABEL/PROJECT_STAGE_LABEL from
// LeadStatusSheet.tsx/ProjectStatusSheet.tsx, both of which already import
// from appointmentDate.ts.
import { appointmentStage } from '../Appointments/appointmentDate'
import { LEAD_STATUS_LABEL } from '../Leads/LeadStatusSheet'
import { PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import type { Lead, LeadStatus, Appointment, Project, ProjectStage } from '../../types'

export type PipelineStage =
  | Exclude<LeadStatus, 'qualified' | 'won'>
  | 'qualified_no_appointment' | 'qualified_scheduled' | 'qualified_pending_approval' | 'qualified_rejected'
  | 'won_pending_project'
  | `project_${ProjectStage}`

export type PipelineBucket = 'lead' | 'qualified' | 'site_visit' | 'requirements_quotation' | 'won_pending_project' | 'project' | 'lost'

export function pipelineStage(lead: Lead, appointments: Appointment[], projects: Project[]): PipelineStage {
  if (lead.status === 'qualified') {
    // Mirrors LeadStatusSheet's own appointment selection exactly: a
    // cancelled appointment is filtered out before picking the most recent
    // one, so a lead whose only appointment was cancelled reads as having
    // none, not as "scheduled".
    const relevant = appointments
      .filter(a => a.leadId === lead.id && a.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latest = relevant[0]
    if (!latest) return 'qualified_no_appointment'
    const stage = appointmentStage(latest)
    if (stage === 'pending') return 'qualified_pending_approval'
    if (stage === 'rejected') return 'qualified_rejected'
    return 'qualified_scheduled'
  }
  if (lead.status === 'won') {
    // Assumes at most one non-product-sale Project per Lead — not enforced
    // elsewhere (ProjectsScreen's "from Won Lead" picker doesn't exclude
    // already-converted leads either); pre-existing gap, not introduced here.
    const project = projects.find(p => p.leadId === lead.id && p.type !== 'product_sale')
    return project ? (`project_${project.stage}` as PipelineStage) : 'won_pending_project'
  }
  return lead.status
}

export function pipelineBucket(stage: PipelineStage): PipelineBucket {
  if (stage === 'lost') return 'lost'
  if (stage === 'new' || stage === 'contacted') return 'lead'
  if (stage.startsWith('qualified_')) return 'qualified'
  if (stage === 'site_visit_scheduled' || stage === 'site_visit_done') return 'site_visit'
  if (stage === 'won_pending_project') return 'won_pending_project'
  if (stage.startsWith('project_')) return 'project'
  return 'requirements_quotation' // requirements_captured, quotation_drafted, internally_approved, design_in_progress, design_approved, sent_to_client, negotiating, client_approved
}

export const BUCKET_LABEL: Record<PipelineBucket, string> = {
  lead:                    'Lead',
  qualified:               'Appointment',
  site_visit:              'Site Visit',
  requirements_quotation:  'Requirements/Quotation',
  won_pending_project:     'Won',
  project:                 'Project',
  lost:                    'Lost',
}

export const BUCKET_ORDER: PipelineBucket[] = ['lead', 'qualified', 'site_visit', 'requirements_quotation', 'won_pending_project', 'project', 'lost']

// qualified_rejected has no distinct action UI in LeadStatusSheet today —
// opening it shows the same body as qualified_scheduled. Still a real,
// correct label/badge distinction on the card, just not a different screen.
export function pipelineStageLabel(stage: PipelineStage): string {
  if (stage.startsWith('project_')) {
    const ps = stage.slice('project_'.length) as ProjectStage
    return PROJECT_STAGE_LABEL[ps]
  }
  switch (stage) {
    case 'qualified_no_appointment':   return 'Qualified — No Appointment'
    case 'qualified_scheduled':        return 'Appointment Scheduled'
    case 'qualified_pending_approval': return 'Pending MD Approval'
    case 'qualified_rejected':         return 'Reschedule Rejected'
    case 'won_pending_project':        return 'Won'
    default:                           return LEAD_STATUS_LABEL[stage as LeadStatus]
  }
}

// The StatusBadge key used purely for color — falls back to a plain LeadStatus
// or ProjectStage value wherever one already has a real color defined, so
// only the handful of synthetic qualified_*/won_pending_project stages use
// StatusBadge's generic grey fallback. The label is always overridden
// separately via pipelineStageLabel(), this only drives the pill's tint.
export function pipelineBadgeStatus(stage: PipelineStage): string {
  return stage.startsWith('project_') ? stage.slice('project_'.length) : stage
}
