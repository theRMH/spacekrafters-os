import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, CalendarCheck, MapPin, Clock, CheckCircle2, ClipboardList, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { ApprovalHistory } from './ApprovalHistory'
import { ApprovalReviewSheets, fmtCurrency, fmtDateTime, submitter } from './ApprovalReviewSheets'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllAppointments, upsertAppointment } from '../../services/appointmentService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllProjects } from '../../services/projectService'
import { getAllTasks } from '../../services/taskService'
import { getManagedUsersDirectory } from '../../services/userService'
import { PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import { ROLE_FOR_LEAD_STATUS } from '../Leads/LeadStatusSheet'
import { sendNotification } from '../../utils/notifications'
import { countMdDecisions } from '../../utils/approvalHistory'
import type { Appointment, Quotation, DesignPackage, DesignVersion, Project, Task, TaskStatus, ManagedUser } from '../../types'

const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  not_started:       { label: 'Pending',           cls: 'bg-slate-100 text-slate-500' },
  in_progress:       { label: 'In Progress',       cls: 'bg-blue-50 text-blue-700' },
  completed:         { label: 'Done',              cls: 'bg-emerald-50 text-emerald-700' },
  blocked:           { label: 'Blocked',           cls: 'bg-red-50 text-red-700' },
  awaiting_material: { label: 'Awaiting Material', cls: 'bg-amber-50 text-amber-700' },
}

const TASK_LIST_LIMIT = 20

function fmtDate(val?: string): string {
  if (!val) return 'No due date'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// One card in "Ready for Next Step" — a reschedule request, quotation or design
// that is waiting on the MD.
interface TaskItem {
  key: string
  at: string
  title: string
  badge: string
  badgeCls: string
  client: string
  details: string[]
  person: string
  open: () => void
}

export default function MDTasksScreen() {
  const { user } = useAuth()
  const { leads, updateLead } = useCRM()
  const navigate = useNavigate()
  const approvalsRef = useRef<HTMLDivElement>(null)

  const [tasks, setTasks] = useState<Task[]>([])
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  const [doneHistoryOpen, setDoneHistoryOpen] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [packages, setPackages] = useState<DesignPackage[]>([])
  const [versions, setVersions] = useState<DesignVersion[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [reviewQuote, setReviewQuote] = useState<Quotation | null>(null)
  const [reviewDesign, setReviewDesign] = useState<DesignPackage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Bumped after every reschedule decision so the history below refetches.
  const [historyKey, setHistoryKey] = useState(0)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [mdNotes, setMdNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })
  const [users, setUsers] = useState<ManagedUser[]>([])

  async function load() {
    setIsLoading(true)
    const [appts, q, p, v, pr, t, u] = await Promise.all([
      getAllAppointments(), getAllQuotations(), getAllDesignPackages(), getAllDesignVersions(), getAllProjects(), getAllTasks(), getManagedUsersDirectory(),
    ])
    setAppointments(appts); setQuotations(q); setPackages(p); setVersions(v); setProjects(pr); setTasks(t); setUsers(u)
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  const pending = appointments.filter(a => a.rescheduleRequestStatus === 'requested')
  const pendingQuotes = quotations.filter(q => q.status === 'internal_review')
  const pendingDesigns = packages.filter(p => p.status === 'internal_review')
  const pendingStageProjects = projects.filter(p => p.pendingStageRequest)

  function leadFor(appt: Appointment) {
    return leads.find(l => l.id === appt.leadId)
  }
  const leadById = (id?: string) => (id ? leads.find(l => l.id === id) : undefined)
  const designLink = (p: DesignPackage) =>
    p.projectId ? projects.find(pr => pr.id === p.projectId)?.name ?? p.projectId
      : p.leadId ? `${leadById(p.leadId)?.name ?? p.leadId} (Lead)` : 'Unassigned'

  // Everything currently waiting on the MD, newest first — reschedule requests,
  // quotations and designs share one "Ready for Next Step" list.
  const taskItems: TaskItem[] = [
    ...pending.map<TaskItem>(a => ({
      key: `a-${a.id}`, at: a.rescheduleRequestedAt ?? a.updatedAt,
      title: 'Approve Rescheduled Appointment', badge: 'Rescheduled Appointment', badgeCls: 'bg-amber-50 text-amber-700',
      client: leadFor(a)?.name ?? a.clientName,
      details: [`Appointment: ${fmtDateTime(a.scheduledAt)}${a.location ? ` · ${a.location}` : ''}`, `Reason: ${a.rescheduleReason ?? '—'}`],
      person: `Requested by: ${a.rescheduleRequestedBy ?? '—'}`,
      open: () => setSelected(a),
    })),
    ...pendingQuotes.map<TaskItem>(q => ({
      key: `q-${q.id}`, at: q.updatedAt,
      title: 'Approve Quotation', badge: 'Quotation', badgeCls: 'bg-blue-50 text-blue-700',
      client: leadById(q.leadId)?.name ?? q.leadId,
      details: [`Lead ID: ${leadById(q.leadId)?.leadNumber ?? '—'} · Version ${q.version}`, `Net Amount: ${fmtCurrency(q.netAmount)}`],
      person: `Submitted by: ${submitter(q.statusHistory) ?? '—'}`,
      open: () => setReviewQuote(q),
    })),
    ...pendingDesigns.map<TaskItem>(p => ({
      key: `d-${p.id}`, at: p.updatedAt,
      title: 'Approve Design', badge: 'Designing', badgeCls: 'bg-violet-50 text-violet-700',
      client: designLink(p),
      details: [`Package: ${p.name} · ${versions.filter(v => v.designPackageId === p.id).length} version(s)`],
      person: `Submitted by: ${submitter(p.statusHistory) ?? '—'}`,
      open: () => setReviewDesign(p),
    })),
    ...pendingStageProjects.map<TaskItem>(p => ({
      key: `ps-${p.id}`, at: p.pendingStageRequest!.requestedAt,
      title: 'Approve Project Stage', badge: 'Project Stage', badgeCls: 'bg-teal-50 text-teal-700',
      client: p.name,
      details: [`Move to ${PROJECT_STAGE_LABEL[p.pendingStageRequest!.toStage]}`, p.pendingStageRequest!.note ?? ''],
      person: `Submitted by: ${p.pendingStageRequest!.requestedBy}`,
      open: () => navigate(`/projects/${p.id}`),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  // The real assigned tasks (project tasks): open ones first by due date (soonest
  // first, undated last), then completed ones, newest first.
  const sortedTasks = [...tasks].sort((a, b) => {
    const aDone = a.status === 'completed', bDone = b.status === 'completed'
    if (aDone !== bDone) return aDone ? 1 : -1
    if (aDone) return b.updatedAt.localeCompare(a.updatedAt)
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return b.createdAt.localeCompare(a.createdAt)
  })
  const visibleTasks = showAllTasks ? sortedTasks : sortedTasks.slice(0, TASK_LIST_LIMIT)
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const isOverdue = (t: Task) => t.status !== 'completed' && !!t.deadline && new Date(t.deadline) < startOfToday

  // Completed tasks — the single source of truth for both the "Done" summary
  // card and the Done History list below, so they can never drift apart.
  // completedAt is already written by TaskDetailScreen whenever a task is
  // marked Done; this just surfaces it, nothing new to persist.
  const completedTasks = [...tasks].filter(t => t.status === 'completed').sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
  const visibleDoneTasks = showAllDone ? completedTasks : completedTasks.slice(0, TASK_LIST_LIMIT)

  const doneCount = countMdDecisions(quotations, packages, appointments)
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()
  const todayVisits = appointments.filter(a => a.status !== 'cancelled' && isToday(a.scheduledAt)).length

  async function handleDecision(approved: boolean) {
    if (!selected) return
    const lead = leadFor(selected)
    setSaving(true)
    const now = new Date().toISOString()
    const updated: Appointment = {
      ...selected,
      status: approved ? 'scheduled' : selected.status,
      scheduledAt: approved ? (selected.rescheduledDate || selected.scheduledAt) : selected.scheduledAt,
      rescheduleRequestStatus: approved ? 'accepted' : 'rejected',
      rescheduleAcceptedBy: approved ? user?.name : undefined,
      rescheduleAcceptedAt: approved ? now : undefined,
      rescheduleMdNotes: mdNotes.trim() || undefined,
      // Permanent record of this decision (who/when/why) — shown in Approval History.
      rescheduleHistory: [...(selected.rescheduleHistory ?? []), {
        decision: approved ? 'accepted' as const : 'rejected' as const,
        by: user?.name ?? 'Unknown', byRole: user?.role, at: now,
        note: mdNotes.trim() || undefined,
        reason: selected.rescheduleReason,
        requestedBy: selected.rescheduleRequestedBy,
        requestedAt: selected.rescheduleRequestedAt,
        newDate: selected.rescheduledDate,
      }],
      updatedAt: now,
    }
    const result = await upsertAppointment(updated)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Could not record decision.', type: 'error' })
      setSaving(false)
      return
    }
    setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)))
    if (lead) {
      // Accept is the only way a Qualified lead moves forward now — it
      // replaces the old standalone "Appointment Confirmed" self-serve button.
      // Reject leaves the lead exactly where it was (no status change).
      const advance = approved && lead.status === 'qualified'
      const note = approved
        ? 'MD accepted the appointment reschedule' + (advance ? ' — site visit scheduled' : '') + (mdNotes.trim() ? `: ${mdNotes.trim()}` : '')
        : `MD rejected the appointment reschedule${mdNotes.trim() ? `: ${mdNotes.trim()}` : ''}`
      if (advance) {
        const role = ROLE_FOR_LEAD_STATUS['site_visit_scheduled']
        const person = role ? users.find(u => u.role === role) : undefined
        await updateLead(lead.id, {
          status: 'site_visit_scheduled',
          assignedRole: role,
          assignedToId: person?.id,
          assignedToName: person?.fullName,
        }, note)
      } else {
        await updateLead(lead.id, {}, note)
      }
      if (lead.ownerId) {
        await sendNotification(
          [lead.ownerId],
          approved ? 'Reschedule Accepted' : 'Reschedule Rejected',
          `${lead.name} (${lead.leadNumber ?? lead.id}) — ${approved ? 'MD accepted the reschedule.' : 'MD rejected the reschedule.'}${mdNotes.trim() ? ` Notes: ${mdNotes.trim()}` : ''}`,
        )
      }
    }
    setSelected(null)
    setMdNotes('')
    setSaving(false)
    setHistoryKey(k => k + 1)
    setSnack({ open: true, msg: approved ? 'Reschedule accepted.' : 'Reschedule rejected.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Task</h1>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Summary banner — total items waiting on the MD */}
        <div role="button" tabIndex={0} aria-label="Jump to MD approvals"
          onClick={() => approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onKeyDown={e => { if (e.key === 'Enter') approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
          className="rounded-2xl border p-5 flex items-center justify-between cursor-pointer" style={{ background: '#DBEAFE', borderColor: '#BFDBFE' }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#1D4ED8' }}>MD Approvals</p>
            <p className="text-4xl font-extrabold leading-tight" style={{ color: '#1D4ED8' }}>{taskItems.length}</p>
            <p className="text-sm" style={{ color: '#1D4ED8' }}>waiting for your review</p>
          </div>
          <Wrench size={30} style={{ color: '#3B82F6' }} />
        </div>

        {/* Live counts */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {([
            { label: 'Tasks', value: taskItems.length + doneCount, Icon: CalendarCheck, tint: 'bg-blue-100 text-blue-600' },
            { label: 'Today Visits', value: todayVisits, Icon: MapPin, tint: 'bg-orange-100 text-orange-600' },
            { label: 'Pending', value: taskItems.length, Icon: Clock, tint: 'bg-red-100 text-red-600' },
            { label: 'Done', value: completedTasks.length, Icon: CheckCircle2, tint: 'bg-emerald-100 text-emerald-600' },
          ] as const).map(({ label, value, Icon, tint }) => (
            <div key={label} className="bg-white rounded-2xl shadow-card border border-slate-100 py-3.5 px-1.5 flex flex-col items-center text-center">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 ${tint}`}><Icon size={17} /></span>
              <span className="text-2xl font-extrabold text-slate-800 leading-none">{value}</span>
              <span className="text-[10px] font-semibold text-slate-400 mt-1.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Assigned tasks — the real project tasks, kept separate from the MD approvals below */}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><ClipboardList size={16} /></span>
          <h2 className="text-base font-extrabold text-slate-800">Assigned Tasks</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{tasks.length}</span>
        </div>

        {!isLoading && tasks.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No tasks have been assigned yet.</p>
        )}

        <div className="grid gap-3 xl:grid-cols-2">
          {visibleTasks.map(t => {
            const project = projects.find(p => p.id === t.projectId)
            const status = TASK_STATUS[t.status] ?? TASK_STATUS.not_started
            const overdue = isOverdue(t)
            return (
              <div key={t.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
                <div className="flex justify-end">
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">{t.parentTaskId ? 'Sub-task' : 'Project Task'}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-800 mt-1 break-words">{t.title || 'Untitled task'}</h3>
                <p className="text-sm font-semibold text-slate-600 mt-3 break-words">{project?.name ?? 'Unknown project'}</p>
                {project?.clientName && <p className="text-sm text-slate-400 break-words">Client: {project.clientName}</p>}
                <p className={`text-sm mt-1 ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                  Due: {fmtDate(t.deadline)}{overdue ? ' · overdue' : ''}
                </p>
                <p className="text-sm font-semibold text-teal-700 mt-3">Assigned to: {t.assigneeName ?? 'Unassigned'}</p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <span className={`text-xs font-semibold px-3.5 py-1.5 rounded-full ${status.cls}`}>{status.label}</span>
                  <button onClick={() => navigate(`/projects/${t.projectId}/tasks/${t.id}`)}
                    className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-blue-600 active:bg-blue-700">
                    Update Status
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {!showAllTasks && sortedTasks.length > TASK_LIST_LIMIT && (
          <button onClick={() => setShowAllTasks(true)}
            className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
            Show all ({sortedTasks.length})
          </button>
        )}

        {/* Done History — every task ever marked Done, same source as the Done count above.
            Collapsed by default; click the header to expand/collapse. */}
        <button type="button" onClick={() => setDoneHistoryOpen(o => !o)} aria-expanded={doneHistoryOpen}
          className="w-full flex items-center gap-2 pt-3 text-left">
          <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 size={16} /></span>
          <h2 className="text-base font-extrabold text-slate-800">
            Done History <span className="text-slate-400 font-semibold">({completedTasks.length})</span>
          </h2>
          <ChevronDown size={18} className={`ml-auto text-slate-400 transition-transform ${doneHistoryOpen ? 'rotate-180' : ''}`} />
        </button>

        {doneHistoryOpen && (
          <>
            {!isLoading && completedTasks.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No completed tasks yet.</p>
            )}

            <div className="grid gap-3 xl:grid-cols-2">
              {visibleDoneTasks.map(t => {
                const project = projects.find(p => p.id === t.projectId)
                return (
                  <div key={t.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-extrabold text-slate-800 break-words">{t.title || 'Untitled task'}</h3>
                      <span className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 shrink-0">Done</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 mt-3 break-words">{project?.name ?? 'Unknown project'}</p>
                    {project?.clientName && <p className="text-sm text-slate-400 break-words">Client: {project.clientName}</p>}
                    <p className="text-sm font-semibold text-teal-700 mt-3">Assigned to: {t.assigneeName ?? 'Unassigned'}</p>
                    <p className="text-sm text-slate-400 mt-1">Completed: {t.completedAt ? fmtDateTime(t.completedAt) : '—'}</p>
                  </div>
                )
              })}
            </div>

            {!showAllDone && completedTasks.length > TASK_LIST_LIMIT && (
              <button onClick={() => setShowAllDone(true)}
                className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
                Show all ({completedTasks.length})
              </button>
            )}
          </>
        )}

        {/* MD approvals (reschedule requests, quotations, designs) */}
        <div ref={approvalsRef} className="flex items-center gap-2 pt-3">
          <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><CalendarCheck size={16} /></span>
          <h2 className="text-base font-extrabold text-slate-800">MD Approvals – Ready for Next Step</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{taskItems.length}</span>
        </div>

        {!isLoading && taskItems.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">No pending tasks.</p>
        )}

        <div className="grid gap-3 xl:grid-cols-2">
          {taskItems.map(item => (
            <div key={item.key} className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
              <div className="flex justify-end">
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${item.badgeCls}`}>{item.badge}</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-800 mt-1">{item.title}</h3>
              <p className="text-sm font-semibold text-slate-600 mt-3 break-words">{item.client}</p>
              {item.details.map((d, i) => <p key={i} className="text-sm text-slate-400 break-words">{d}</p>)}
              <p className="text-sm font-semibold text-teal-700 mt-3">{item.person}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-500">Pending</span>
                <button onClick={item.open}
                  className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-blue-600 active:bg-blue-700">
                  Update Status
                </button>
              </div>
            </div>
          ))}
        </div>

        <ApprovalHistory refreshKey={historyKey} types={['Rescheduled Appointment']} title="Reschedule History" />
      </div>

      <ApprovalReviewSheets
        quote={reviewQuote}
        design={reviewDesign}
        versions={versions}
        projects={projects}
        onClose={() => { setReviewQuote(null); setReviewDesign(null) }}
        onDecided={({ quotation, design }) => {
          if (quotation) setQuotations(prev => prev.map(x => (x.id === quotation.id ? quotation : x)))
          if (design) setPackages(prev => prev.map(x => (x.id === design.id ? design : x)))
          setReviewQuote(null); setReviewDesign(null)
        }}
      />

      <BottomSheet isOpen={!!selected} onClose={() => { setSelected(null); setMdNotes('') }} title="Review Reschedule Request">
        {selected && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-sm">
              <p className="font-bold text-slate-800">{leadFor(selected)?.name ?? selected.clientName} {leadFor(selected)?.leadNumber ? `(${leadFor(selected)?.leadNumber})` : ''}</p>
              <p className="text-slate-600">Contact: {leadFor(selected)?.phone ?? '—'}</p>
              <p className="text-slate-600">Appointment: {fmtDateTime(selected.scheduledAt)} — {selected.location}</p>
              {selected.rescheduledDate && <p className="text-slate-600">Requested new date: {fmtDateTime(selected.rescheduledDate)}</p>}
              <p className="text-slate-600">Reason: {selected.rescheduleReason}</p>
              <p className="text-[11px] text-slate-400">Requested by {selected.rescheduleRequestedBy} · {selected.rescheduleRequestedAt ? fmtDateTime(selected.rescheduleRequestedAt) : ''}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">MD Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea value={mdNotes} onChange={e => setMdNotes(e.target.value)} rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="flex gap-2">
              <button disabled={saving} onClick={() => handleDecision(true)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#059669' }}>
                Accept
              </button>
              <button disabled={saving} onClick={() => handleDecision(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold border border-red-200 bg-red-50 text-red-700 active:opacity-90 disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
