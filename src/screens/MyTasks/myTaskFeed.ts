import { PROJECT_STAGE_LABEL, ROLE_FOR_PROJECT_STAGE } from '../ProjectWorkspace/ProjectStatusSheet'
import { LEAD_STATUS_LABEL } from '../Leads/LeadStatusSheet'
import type {
  Appointment, AuthUser, DailyReport, DailyTask, ExpenseRequest, Lead,
  LeaveApplication, MaterialRequestForm, Project, PurchaseOrder, PurchaseRequest,
  SiteVisit, Task, UserRole,
} from '../../types'

export interface MyTaskItem {
  key: string
  at: string
  title: string
  badge: string
  badgeCls: string
  client: string
  details: string[]
  person: string
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

const MRF_STATUS_LABEL: Record<string, string> = {
  pending_qs: 'Fill Material Details', pending_coordinator_approval: 'Approve MRF', pending_procurement: 'Procurement Action',
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
      client: p.name, details: [`${p.clientName}`, `Current stage: ${PROJECT_STAGE_LABEL[p.stage]}`],
      person: p.assignedToName ? `Assigned: ${p.assignedToName}` : 'Assigned: your role',
      linkTo: `/my-tasks/project/${p.id}`,
    })
  }

  // 2. Lead — exact person match, mirrors LeadsScreen's own `assignedOnly` filter.
  for (const l of leads) {
    if (l.assignedToId !== user.id) continue
    items.push({
      key: `lead-${l.id}`, at: l.updatedAt,
      title: `Lead: ${LEAD_STATUS_LABEL[l.status]}`, badge: 'Lead', badgeCls: 'bg-sky-50 text-sky-700',
      client: l.name, details: [`${l.city}`, l.leadNumber ? `Lead ID: ${l.leadNumber}` : ''].filter(Boolean),
      person: `Owner: ${l.ownerName}`,
      linkTo: `/leads/${l.id}`,
    })
  }

  // 3. MRF — pending for my role.
  const mrfRoleStatus: Partial<Record<UserRole, string>> = {
    qs: 'pending_qs', project_coordinator: 'pending_coordinator_approval', purchase: 'pending_procurement', accounts: 'pending_procurement',
  }
  const myMrfStatus = mrfRoleStatus[role]
  if (myMrfStatus) {
    for (const m of mrfs) {
      if (m.status !== myMrfStatus) continue
      const project = projectById.get(m.projectId)
      items.push({
        key: `mrf-${m.id}`, at: m.updatedAt,
        title: MRF_STATUS_LABEL[m.status] ?? 'MRF Action Needed', badge: 'MRF', badgeCls: 'bg-violet-50 text-violet-700',
        client: project?.name ?? m.projectId, details: [m.materialDetails ?? 'No details yet'],
        person: project ? `Client: ${project.clientName}` : '',
        linkTo: `/projects/${m.projectId}?tab=mrf`,
      })
    }
  }

  // 4. My project tasks — mirrors the exact filter ProjectWorkspaceScreen/TasksScreen already apply per-project, aggregated across all projects.
  for (const t of tasks) {
    if (t.assigneeId !== user.id || t.status === 'completed') continue
    const project = projectById.get(t.projectId)
    items.push({
      key: `task-${t.id}`, at: t.deadline ?? t.updatedAt,
      title: t.title, badge: 'Task', badgeCls: t.status === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700',
      client: project?.name ?? 'Unknown Project', details: [t.deadline ? `Due ${fmtDateTime(t.deadline)}` : 'No due date'],
      person: project?.clientName ? `Client: ${project.clientName}` : '',
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
      client: leadById.get(a.leadId)?.name ?? a.clientName, details: [fmtDateTime(a.scheduledAt), a.location],
      person: '', linkTo: '/appointments',
    })
  }
  for (const v of siteVisits) {
    if (!isToday(v.visitDate)) continue
    if (!(v.teamMemberIds ?? []).includes(user.id)) continue
    items.push({
      key: `sv-${v.id}`, at: v.visitDate,
      title: 'Site Visit Today', badge: 'Site Visit', badgeCls: 'bg-purple-50 text-purple-700',
      client: leadById.get(v.leadId)?.name ?? v.leadId, details: [fmtDateTime(v.visitDate), `${v.rooms.length} room(s)`],
      person: '', linkTo: '/site-visits',
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
      client: project?.name ?? r.projectId, details: [r.editRequestReason ?? 'Edit requested'],
      person: `By: ${r.createdByName}`, linkTo: '/daily-reports',
    })
  }

  // 7. Role-gated approval queues — only included if this role actually has the matching permission elsewhere in the app.
  if (role === 'admin') {
    for (const l of leaveApplications ?? []) {
      if (l.status !== 'pending') continue
      items.push({
        key: `leave-${l.id}`, at: l.updatedAt,
        title: 'Approve Leave Request', badge: 'Leave', badgeCls: 'bg-pink-50 text-pink-700',
        client: l.userName, details: [`${l.fromDate} → ${l.toDate}`, l.reason],
        person: '', linkTo: '/leave',
      })
    }
  }
  if (role === 'accounts') {
    for (const e of expenseRequests ?? []) {
      if (e.status !== 'requested') continue
      items.push({
        key: `expense-${e.id}`, at: e.updatedAt,
        title: 'Approve Expense', badge: 'Expense', badgeCls: 'bg-rose-50 text-rose-700',
        client: e.requestedByName, details: [e.purpose, `₹${e.amount.toLocaleString('en-IN')}`],
        person: '', linkTo: '/expenses',
      })
    }
  }
  if (role === 'purchase') {
    for (const pr of purchaseRequests ?? []) {
      if (pr.status !== 'approved' && pr.status !== 'quoted') continue
      items.push({
        key: `pr-${pr.id}`, at: pr.updatedAt,
        title: pr.status === 'approved' ? 'Get Quotes / Raise PO' : 'Raise Purchase Order', badge: 'Procurement', badgeCls: 'bg-indigo-50 text-indigo-700',
        client: pr.description, details: [`${pr.quantity} ${pr.unit}`],
        person: '', linkTo: '/procurement',
      })
    }
    for (const po of purchaseOrders ?? []) {
      if (po.status !== 'issued' && po.status !== 'received') continue
      items.push({
        key: `po-${po.id}`, at: po.updatedAt,
        title: po.status === 'issued' ? 'Receive Goods' : 'Enter Vendor Bill', badge: 'Procurement', badgeCls: 'bg-indigo-50 text-indigo-700',
        client: `PO ₹${po.amount.toLocaleString('en-IN')}`, details: [],
        person: '', linkTo: '/procurement',
      })
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at))
}
