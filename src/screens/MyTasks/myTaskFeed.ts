import { PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import { LEAD_STATUS_LABEL } from '../Leads/LeadStatusSheet'
import type {
  Appointment, AuthUser, DailyReport, DailyTask, ExpenseRequest, Lead,
  LeaveApplication, MaterialRequestForm, Project, PurchaseOrder, PurchaseRequest,
  SiteVisit, Task,
} from '../../types'

export interface MyTaskItem {
  key: string
  at: string
  title: string          // the action needed, e.g. "Submit Designing for Approval"
  badge: string
  badgeCls: string
  subjectLabel: string    // what `subject` is, e.g. "Client", "Lead", "Project"
  subject: string         // the client/lead/project/person this item is about
  meta: string[]          // short context chips — ID, value, date, phone, etc.
  note?: string           // an optional longer free-text line (a reason, a material list, ...)
  person?: string         // who else is involved/responsible, if a specific name is known (bare name, no "Assigned:" prefix — the UI adds that)
  linkTo: string
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
function fmtCurrency(n?: number): string {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`
}

const MRF_STATUS_LABEL: Record<string, string> = {
  pending_qs: 'Fill Material Details', rejected: 'Revise & Resubmit MRF',
  pending_coordinator_approval: 'Approve MRF', pending_procurement: 'Procurement Action',
}

// Pure, no React/router dependency — mirrors salesPerformance.ts's own shape
// (a `linkTo` string, not a callback), sourced entirely from real, already-
// fetched records. Every bucket below traces to a real status/assignment
// field this app already has; nothing here is invented or a separate task
// table. Not every source applies to every role — each block only fires for
// the role(s) that actually act on that real status, matching the existing
// permission gates those screens already use.
export function buildMyTaskFeed(opts: {
  user: AuthUser
  leads: Lead[]
  projects: Project[]
  tasks: Task[]
  mrfs: MaterialRequestForm[]
  appointments: Appointment[]
  siteVisits: SiteVisit[]
  dailyReports: DailyReport[]
  leaveApplications?: LeaveApplication[]
  expenseRequests?: ExpenseRequest[]
  purchaseRequests?: PurchaseRequest[]
  purchaseOrders?: PurchaseOrder[]
}): MyTaskItem[] {
  const { user, leads, projects, tasks, mrfs, appointments, siteVisits, dailyReports, leaveApplications, expenseRequests, purchaseRequests, purchaseOrders } = opts
  const role = user.role
  const items: MyTaskItem[] = []
  const projectById = new Map(projects.map(p => [p.id, p]))
  const leadById = new Map(leads.map(l => [l.id, l]))

  // 1. Project — my role's turn on the current stage (mirrors ProjectStatusSheet's own canAct gate: role match, not exact person — several people can share a role).
  for (const p of projects) {
    if (p.status === 'closed' || p.pendingStageRequest) continue
    if (p.assignedRole !== role) continue
    items.push({
      key: `stage-${p.id}`, at: p.updatedAt,
      title: `Submit ${PROJECT_STAGE_LABEL[p.stage]} for Approval`, badge: 'Project Stage', badgeCls: 'bg-teal-50 text-teal-700',
      subjectLabel: 'Project', subject: p.name,
      meta: [`Client: ${p.clientName}`, p.contractValue ? `Value: ${fmtCurrency(p.contractValue)}` : '', `Stage: ${PROJECT_STAGE_LABEL[p.stage]}`].filter(Boolean),
      person: p.assignedToName,
      linkTo: `/my-tasks/project/${p.id}`,
    })
  }

  // 2. Lead — mirrors LeadsScreen's own `assignedOnly` filter: a lead is
  // mine either as its owner (ownerId — what the Assign To picker actually
  // writes) or as whoever the current stage is waiting on (assignedToId).
  // assignedToId alone missed every freshly-assigned lead, which has none
  // until its first status transition.
  for (const l of leads) {
    if (l.ownerId !== user.id && l.assignedToId !== user.id) continue
    items.push({
      key: `lead-${l.id}`, at: l.updatedAt,
      title: `Lead: ${LEAD_STATUS_LABEL[l.status]}`, badge: 'Lead', badgeCls: 'bg-sky-50 text-sky-700',
      subjectLabel: 'Lead', subject: l.name,
      meta: [l.leadNumber ? `ID: ${l.leadNumber}` : '', l.city, l.phone].filter(Boolean),
      person: l.ownerName,
      linkTo: `/leads/${l.id}`,
    })
  }

  // 3. MRF — pending_qs/rejected go to whoever can act as QS (submit_mrf,
  // held by qs + owner); pending_coordinator_approval goes to the project's
  // actual Lead Owner (see resolveLeadOwner/canApprove in MRFPanel.tsx — the
  // approval step is a specific person, not a role); pending_procurement goes
  // to purchase/accounts.
  for (const m of mrfs) {
    if (m.status !== 'pending_qs' && m.status !== 'rejected' && m.status !== 'pending_coordinator_approval' && m.status !== 'pending_procurement') continue
    const project = projectById.get(m.projectId)
    const lead = project?.leadId ? leadById.get(project.leadId) : undefined
    if (m.status === 'pending_qs' || m.status === 'rejected') {
      if (role !== 'qs') continue
    } else if (m.status === 'pending_coordinator_approval') {
      if (lead?.ownerId !== user.id) continue
    } else {
      if (role !== 'purchase' && role !== 'accounts') continue
    }
    items.push({
      key: `mrf-${m.id}`, at: m.updatedAt,
      title: MRF_STATUS_LABEL[m.status] ?? 'MRF Action Needed', badge: 'MRF', badgeCls: 'bg-violet-50 text-violet-700',
      subjectLabel: 'Project', subject: project?.name ?? m.projectId,
      meta: [project ? `Client: ${project.clientName}` : ''].filter(Boolean),
      note: m.status === 'rejected' ? m.approvalNotes : m.materialDetails,
      linkTo: `/projects/${m.projectId}?tab=mrf`,
    })
  }

  // 4. My project tasks — mirrors the exact filter ProjectWorkspaceScreen/TasksScreen already apply per-project, aggregated across all projects.
  for (const t of tasks) {
    if (t.assigneeId !== user.id || t.status === 'completed') continue
    const project = projectById.get(t.projectId)
    items.push({
      key: `task-${t.id}`, at: t.deadline ?? t.updatedAt,
      title: t.title, badge: 'Task', badgeCls: t.status === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700',
      subjectLabel: 'Project', subject: project?.name ?? 'Unknown Project',
      meta: [project?.clientName ? `Client: ${project.clientName}` : '', t.deadline ? `Due ${fmtDateTime(t.deadline)}` : 'No due date'].filter(Boolean),
      note: t.description,
      linkTo: `/projects/${t.projectId}/tasks/${t.id}`,
    })
  }

  // 5. Today's appointments/site visits I'm assigned to.
  for (const a of appointments) {
    if (a.status === 'cancelled' || !isToday(a.scheduledAt)) continue
    if (!(a.assignedToIds ?? (a.coordinatorId ? [a.coordinatorId] : [])).includes(user.id)) continue
    items.push({
      key: `appt-${a.id}`, at: a.scheduledAt,
      title: 'Appointment Today', badge: 'Appointment', badgeCls: 'bg-amber-50 text-amber-700',
      subjectLabel: 'Lead', subject: leadById.get(a.leadId)?.name ?? a.clientName,
      meta: [fmtDateTime(a.scheduledAt), a.location].filter(Boolean),
      linkTo: '/appointments',
    })
  }
  for (const v of siteVisits) {
    if (!isToday(v.visitDate)) continue
    if (!(v.teamMemberIds ?? []).includes(user.id)) continue
    items.push({
      key: `sv-${v.id}`, at: v.visitDate,
      title: 'Site Visit Today', badge: 'Site Visit', badgeCls: 'bg-purple-50 text-purple-700',
      subjectLabel: 'Lead', subject: leadById.get(v.leadId)?.name ?? v.leadId,
      meta: [fmtDateTime(v.visitDate), `${v.rooms.length} room(s)`],
      linkTo: '/site-visits',
    })
  }

  // 6. Daily report edit requests waiting on me as the resolved Lead Owner.
  for (const r of dailyReports) {
    if (r.editRequestStatus !== 'pending') continue
    const project = projectById.get(r.projectId)
    const lead = project?.leadId ? leadById.get(project.leadId) : undefined
    const loId = lead?.ownerId ?? project?.coordinatorId
    if (loId !== user.id) continue
    items.push({
      key: `report-${r.id}`, at: r.updatedAt,
      title: 'Review Daily Report Edit Request', badge: 'Daily Report', badgeCls: 'bg-orange-50 text-orange-700',
      subjectLabel: 'Project', subject: project?.name ?? r.projectId,
      meta: [],
      note: r.editRequestReason,
      person: r.createdByName,
      linkTo: '/daily-reports',
    })
  }

  // 7. Role-gated approval queues — only included if this role actually has the matching permission elsewhere in the app.
  if (role === 'admin') {
    for (const l of leaveApplications ?? []) {
      if (l.status !== 'pending') continue
      items.push({
        key: `leave-${l.id}`, at: l.updatedAt,
        title: 'Approve Leave Request', badge: 'Leave', badgeCls: 'bg-pink-50 text-pink-700',
        subjectLabel: 'Staff', subject: l.userName,
        meta: [`${l.fromDate} → ${l.toDate}`],
        note: l.reason,
        linkTo: '/leave',
      })
    }
  }
  if (role === 'accounts') {
    for (const e of expenseRequests ?? []) {
      if (e.status !== 'requested') continue
      items.push({
        key: `expense-${e.id}`, at: e.updatedAt,
        title: 'Approve Expense', badge: 'Expense', badgeCls: 'bg-rose-50 text-rose-700',
        subjectLabel: 'Requested by', subject: e.requestedByName,
        meta: [fmtCurrency(e.amount)],
        note: e.purpose,
        linkTo: '/expenses',
      })
    }
  }
  if (role === 'purchase') {
    for (const pr of purchaseRequests ?? []) {
      if (pr.status !== 'approved' && pr.status !== 'quoted') continue
      items.push({
        key: `pr-${pr.id}`, at: pr.updatedAt,
        title: pr.status === 'approved' ? 'Get Quotes / Raise PO' : 'Raise Purchase Order', badge: 'Procurement', badgeCls: 'bg-indigo-50 text-indigo-700',
        subjectLabel: 'Item', subject: pr.description,
        meta: [`${pr.quantity} ${pr.unit}`],
        linkTo: '/procurement',
      })
    }
    for (const po of purchaseOrders ?? []) {
      if (po.status !== 'issued' && po.status !== 'received') continue
      items.push({
        key: `po-${po.id}`, at: po.updatedAt,
        title: po.status === 'issued' ? 'Receive Goods' : 'Enter Vendor Bill', badge: 'Procurement', badgeCls: 'bg-indigo-50 text-indigo-700',
        subjectLabel: 'Order', subject: fmtCurrency(po.amount),
        meta: [],
        linkTo: '/procurement',
      })
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at))
}
