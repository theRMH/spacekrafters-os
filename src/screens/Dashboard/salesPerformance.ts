import { PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import { leadStatusLabel } from '../Leads/LeadStatusSheet'
import type { Lead, LeadStatus, Project } from '../../types'

// Sales-pipeline bucketing: a lead moves Active -> Negotiation, then once it's
// Won it's tracked through its linked Project's own stage (Production until
// the project closes, then Done). 'lost' leads aren't shown — they don't fit
// any of the reference's 4 funnel stages. Active/Negotiation genuinely have
// no contract value yet in this data model (no quotation-value join here) —
// showing ₹0 for them is real, not a placeholder.
export const ACTIVE_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visit_done', 'requirements_captured']
export const NEGOTIATION_STATUSES: LeadStatus[] = ['quotation_drafted', 'sent_to_md', 'md_rejected', 'client_rejected', 'internally_approved', 'design_in_progress', 'design_approved', 'sent_to_client', 'negotiating', 'client_approved']

export interface SalesRecord {
  key: string
  name: string
  stageLabel: string
  amount: number
  updatedAt: string
  assignedTo: string
  linkTo: string
}
export interface SalesBucket { count: number; value: number; records: SalesRecord[] }
export interface SalesPersonPerf { name: string; active: SalesBucket; negotiation: SalesBucket; production: SalesBucket; done: SalesBucket }

function emptyBucket(): SalesBucket { return { count: 0, value: 0, records: [] } }

// Pure — shared by DashboardScreen (the summary list) and SalesPersonDetailScreen
// (the drill-down page), so both are guaranteed to agree with each other and
// there's only one place that ever reads leads/projects into this shape.
export function buildSalesPerformance(leads: Lead[], projects: Project[]): SalesPersonPerf[] {
  const projectByLeadId = new Map<string, Project>()
  for (const p of projects) if (p.leadId) projectByLeadId.set(p.leadId, p)

  const byPerson = new Map<string, SalesPersonPerf>()
  const ensure = (name: string) => {
    if (!byPerson.has(name)) byPerson.set(name, { name, active: emptyBucket(), negotiation: emptyBucket(), production: emptyBucket(), done: emptyBucket() })
    return byPerson.get(name)!
  }

  for (const lead of leads) {
    const name = lead.ownerName || 'Unassigned'
    const person = ensure(name)
    if (ACTIVE_STATUSES.includes(lead.status)) {
      person.active.count++
      person.active.records.push({
        key: lead.id, name: lead.name, stageLabel: leadStatusLabel(lead), amount: 0,
        updatedAt: lead.updatedAt, assignedTo: name, linkTo: `/leads/${lead.id}`,
      })
      continue
    }
    if (NEGOTIATION_STATUSES.includes(lead.status)) {
      person.negotiation.count++
      person.negotiation.records.push({
        key: lead.id, name: lead.name, stageLabel: leadStatusLabel(lead), amount: 0,
        updatedAt: lead.updatedAt, assignedTo: name, linkTo: `/leads/${lead.id}`,
      })
      continue
    }
    if (lead.status === 'won') {
      const project = projectByLeadId.get(lead.id)
      const value = project?.contractValue ?? 0
      const record: SalesRecord = project
        ? { key: project.id, name: project.name, stageLabel: PROJECT_STAGE_LABEL[project.stage], amount: value, updatedAt: project.updatedAt, assignedTo: name, linkTo: `/projects/${project.id}` }
        : { key: lead.id, name: lead.name, stageLabel: 'Won', amount: 0, updatedAt: lead.updatedAt, assignedTo: name, linkTo: `/leads/${lead.id}` }
      if (project?.status === 'closed') { person.done.count++; person.done.value += value; person.done.records.push(record) }
      else { person.production.count++; person.production.value += value; person.production.records.push(record) }
    }
  }

  return [...byPerson.values()]
    .sort((a, b) => (b.active.count + b.negotiation.count + b.production.count + b.done.count) - (a.active.count + a.negotiation.count + a.production.count + a.done.count))
}
