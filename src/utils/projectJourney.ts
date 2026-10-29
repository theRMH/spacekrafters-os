import { PROJECT_STAGE_LABEL } from '../screens/ProjectWorkspace/ProjectStatusSheet'
import type { Appointment, Lead, Project, Quotation, SiteVisit } from '../types'

export interface JourneyEvent {
  key: string
  label: string
  note?: string
  by?: string
  at: string
}

// Every stage of the real journey this app actually has data for — pre-
// conversion (Lead/Appointment/Site Visit/Quotation) plus post-conversion
// (Project.statusHistory, using this app's own stage names, not invented
// ones). Nothing here is fabricated: every entry traces to a real field.
// Shared by every project-detail page (MD's OutstandingProjectDetailScreen,
// the non-MD MyProjectDetailScreen) so they can never drift apart.
export function buildJourney(opts: {
  project: Project; lead?: Lead; appointments: Appointment[]; siteVisits: SiteVisit[]; quotation?: Quotation
}): JourneyEvent[] {
  const { project, lead, appointments, siteVisits, quotation } = opts
  const events: JourneyEvent[] = []

  if (lead) {
    // lead.activity already starts with its own "Lead Created" entry — only
    // add a fallback one here for older leads that predate that activity log.
    if (!lead.activity?.length) events.push({ key: 'lead-created', label: 'Lead Created', at: lead.createdAt })
    for (const a of lead.activity ?? []) {
      events.push({ key: `lead-activity-${a.id}`, label: a.label, note: a.note, by: a.updatedBy, at: a.updatedAt })
    }
  }
  for (const appt of appointments) {
    events.push({ key: `appt-${appt.id}`, label: 'Appointment Scheduled', note: appt.location, by: appt.coordinatorName, at: appt.createdAt })
  }
  for (const sv of siteVisits) {
    events.push({ key: `sv-${sv.id}`, label: sv.status === 'scheduled' ? 'Site Visit Planned' : 'Site Visit', note: sv.status === 'scheduled' ? undefined : `${sv.rooms.length} room(s) measured`, by: sv.teamMemberNames?.join(', '), at: sv.visitDate })
  }
  if (quotation) {
    events.push({ key: 'quote-created', label: 'Quotation Created', by: quotation.createdBy, at: quotation.createdAt })
    for (const h of quotation.statusHistory ?? []) {
      events.push({ key: `quote-${h.at}-${h.status}`, label: h.label, note: h.note, by: h.by, at: h.at })
    }
  }
  events.push({ key: 'project-created', label: 'Project Created', by: project.coordinatorName, at: project.createdAt })
  for (const h of project.statusHistory ?? []) {
    events.push({ key: `stage-${h.updatedAt}-${h.stage}`, label: PROJECT_STAGE_LABEL[h.stage as keyof typeof PROJECT_STAGE_LABEL] ?? h.stage, note: h.note, by: h.updatedBy, at: h.updatedAt })
  }
  if (project.handoverSignedAt) {
    events.push({ key: 'handover', label: 'Handover Signed Off', by: project.handoverSignedBy, at: project.handoverSignedAt })
  }

  return events
    .filter(e => !!e.at)
    .sort((a, b) => a.at.localeCompare(b.at))
}
