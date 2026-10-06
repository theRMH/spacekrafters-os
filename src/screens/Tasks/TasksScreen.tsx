import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Workflow, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllProjects } from '../../services/projectService'
import { getAllAppointments } from '../../services/appointmentService'
import { getManagedUsersDirectory } from '../../services/userService'
import { sendNotification } from '../../utils/notifications'
import { fmtDateTime } from '../Appointments/appointmentDate'
import { decideAppointmentReschedule } from '../Appointments/appointmentActions'
import { LeadStatusSheet, ROLE_FOR_LEAD_STATUS } from '../Leads/LeadStatusSheet'
import { ProjectStatusSheet } from '../ProjectWorkspace/ProjectStatusSheet'
import {
  pipelineStage, pipelineBucket, pipelineStageLabel, pipelineBadgeStatus,
  BUCKET_LABEL, BUCKET_ORDER, type PipelineStage, type PipelineBucket,
} from './pipelineStage'
import type { Project, Appointment, Lead, ManagedUser } from '../../types'

type BucketFilter = 'all' | PipelineBucket

// The lead's most recent non-cancelled appointment — same selection
// LeadStatusSheet's own `qualified` branch uses, and what pipelineStage()
// bases the qualified_* refinement on, so the mini-flow below always acts on
// the exact appointment the card's badge was computed from.
function pendingApptFor(lead: Lead, appointments: Appointment[]): Appointment | undefined {
  return appointments
    .filter(a => a.leadId === lead.id && a.status !== 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

// The date a card is actually anchored to — the real appointment's scheduled
// date/time for an appointment-stage lead (so Tasks reflects the existing
// Appointment flow's own date, not a guess), and the lead's last activity for
// every other stage. Raw ISO so it can double as a sort key; `relevantDate()`
// below is the same thing formatted for display.
function relevantDateIso(lead: Lead, stage: PipelineStage, appointments: Appointment[]): string | undefined {
  if (stage.startsWith('qualified_')) return pendingApptFor(lead, appointments)?.scheduledAt
  return lead.updatedAt
}

function relevantDate(lead: Lead, stage: PipelineStage, appointments: Appointment[]): string {
  const iso = relevantDateIso(lead, stage, appointments)
  return iso ? fmtDateTime(iso) : '—'
}

export default function TasksScreen() {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const { leads, updateLead } = useCRM()

  // Mirrors LeadsScreen.tsx's own visibility rule for leads.
  const canManageLeads = can('edit_lead')
  // Gates loading appointment/user data for the qualified_* stage refinement
  // and the in-page reschedule-approval mini-flow below — only roles that
  // already have appointment visibility elsewhere in the app see that detail.
  const canSeeAppointments = can('view_appointments')
  const isOwner = can('view_md_tasks') // the only role allowed to approve/reject a reschedule

  const [projects, setProjects] = useState<Project[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pipelineOpen, setPipelineOpen] = useState(true)
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')

  // Which lead/project's status sheet is open — re-looked-up live below (not
  // the stale object captured at click time), since updateLead/upsertProject
  // mutate state out from under an open sheet and its body depends on the
  // CURRENT status/stage.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  // In-page reschedule-approval mini-flow — the one pipeline stage where the
  // real LeadStatusSheet would navigate to /md-tasks, which conflicts with
  // this dashboard staying entirely on the Tasks page.
  const [mdNotes, setMdNotes] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [projs, appts, users] = await Promise.all([
        getAllProjects(),
        canSeeAppointments ? getAllAppointments() : Promise.resolve([]),
        canSeeAppointments ? getManagedUsersDirectory() : Promise.resolve([]),
      ])
      setProjects(projs)
      setAppointments(appts)
      setManagedUsers(users)
      setIsLoading(false)
    }
    load()
  }, [canSeeAppointments])

  // FGD leads and product-sale projects have their own separate module —
  // same exclusions LeadsScreen.tsx/ProjectsScreen.tsx already apply. Leads
  // still at 'new'/'contacted' have no appointment yet and no current/upcoming
  // workflow activity to anchor a Tasks card to — they stay fully visible in
  // the Leads tab (nothing here hides or deletes them), but Tasks is scoped to
  // leads that have actually entered the appointment-onward workflow.
  const pipelineLeads = leads
    .filter(l => l.businessDivision !== 'fgd')
    .filter(l => l.status !== 'new' && l.status !== 'contacted')
    .filter(l => canManageLeads || l.assignedToId === user?.id)
  const pipelineItems = pipelineLeads
    .map(lead => ({ lead, stage: pipelineStage(lead, appointments, projects) }))
    .filter(({ lead }) => !pipelineSearch || lead.name.toLowerCase().includes(pipelineSearch.toLowerCase()))
    // Soonest/most-overdue first — a lead still needing its appointment
    // scheduled (no date yet) sorts to the very top since it has no date to
    // wait on; everything else follows in ascending date order, exactly the
    // real appointment date for appointment-stage leads.
    .sort((a, b) => (relevantDateIso(a.lead, a.stage, appointments) ?? '').localeCompare(relevantDateIso(b.lead, b.stage, appointments) ?? ''))

  const bucketChips: { value: BucketFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: pipelineItems.length },
    // 'lead' is excluded above by definition, so that chip would only ever
    // show a permanent 0 — dropped rather than kept as dead UI.
    ...BUCKET_ORDER.filter(b => b !== 'lead').map(b => ({ value: b, label: BUCKET_LABEL[b], count: pipelineItems.filter(i => pipelineBucket(i.stage) === b).length })),
  ]
  const filteredPipelineItems = pipelineItems.filter(i => bucketFilter === 'all' || pipelineBucket(i.stage) === bucketFilter)

  const liveLead = openLeadId ? leads.find(l => l.id === openLeadId) ?? null : null
  const liveStage = liveLead ? pipelineStage(liveLead, appointments, projects) : null
  const liveProject = openProjectId ? projects.find(p => p.id === openProjectId) ?? null : null

  function openPipelineItem(lead: Lead, stage: PipelineStage) {
    if (stage.startsWith('project_')) {
      const project = projects.find(p => p.leadId === lead.id && p.type !== 'product_sale')
      if (project) setOpenProjectId(project.id)
      return
    }
    setMdNotes('')
    setActionError('')
    setOpenLeadId(lead.id)
  }

  // Replicates MDTasksScreen.handleDecision()'s field writes exactly — same
  // Appointment update, same lead.status advance to 'site_visit_scheduled'
  // (+ assignee + notification) on approval — so approving from here behaves
  // identically to approving from /md-tasks, just without leaving the page.
  async function handleDecideInline(approved: boolean) {
    if (!liveLead) return
    const appt = pendingApptFor(liveLead, appointments)
    if (!appt) return
    setActionSaving(true)
    const result = await decideAppointmentReschedule(appt, approved, mdNotes, user?.name ?? 'Unknown', user?.role)
    if (!result.ok || !result.updated) {
      setActionSaving(false)
      setActionError(result.error ?? 'Could not record decision.')
      return
    }
    setAppointments(prev => prev.map(a => (a.id === result.updated!.id ? result.updated! : a)))

    const advance = approved && liveLead.status === 'qualified'
    const note = approved
      ? 'MD accepted the appointment reschedule' + (advance ? ' — site visit scheduled' : '') + (mdNotes.trim() ? `: ${mdNotes.trim()}` : '')
      : `MD rejected the appointment reschedule${mdNotes.trim() ? `: ${mdNotes.trim()}` : ''}`
    if (advance) {
      const role = ROLE_FOR_LEAD_STATUS['site_visit_scheduled']
      const person = role ? managedUsers.find(u => u.role === role) : undefined
      await updateLead(liveLead.id, {
        status: 'site_visit_scheduled',
        assignedRole: role,
        assignedToId: person?.id,
        assignedToName: person?.fullName,
      }, note)
    } else {
      await updateLead(liveLead.id, {}, note)
    }
    if (liveLead.ownerId) {
      await sendNotification(
        [liveLead.ownerId],
        approved ? 'Reschedule Accepted' : 'Reschedule Rejected',
        `${liveLead.name} (${liveLead.leadNumber ?? liveLead.id}) — ${approved ? 'MD accepted the reschedule.' : 'MD rejected the reschedule.'}${mdNotes.trim() ? ` Notes: ${mdNotes.trim()}` : ''}`,
      )
    }
    setActionSaving(false)
    setSnack({ open: true, msg: approved ? 'Reschedule accepted.' : 'Reschedule rejected.', type: 'success' })
    setOpenLeadId(null)
    setMdNotes('')
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Tasks</h1>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {canSeeAppointments && (
          <>
            <button type="button" onClick={() => setPipelineOpen(o => !o)} aria-expanded={pipelineOpen}
              className="w-full flex items-center gap-2 text-left pb-1">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><Workflow size={16} /></span>
              <h2 className="text-base font-extrabold text-slate-800">Pipeline Status</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{pipelineItems.length}</span>
              <ChevronDown size={18} className={`ml-auto text-slate-400 transition-transform ${pipelineOpen ? 'rotate-180' : ''}`} />
            </button>

            {pipelineOpen && (
              <div className="space-y-2.5 pb-2">
                <SearchBar value={pipelineSearch} onChange={setPipelineSearch} placeholder="Search leads…" />
                <FilterChips chips={bucketChips} active={bucketFilter} onChange={setBucketFilter} />

                {!isLoading && filteredPipelineItems.map(({ lead, stage }) => {
                  const project = stage.startsWith('project_') ? projects.find(p => p.leadId === lead.id && p.type !== 'product_sale') : undefined
                  const action = stage === 'lost'
                    ? null
                    : stage === 'won_pending_project'
                    ? { label: 'Create Project', onClick: () => navigate(`/projects?leadId=${lead.id}`) }
                    : { label: 'Update Status', onClick: () => openPipelineItem(lead, stage) }
                  return (
                    <div key={lead.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-bold text-sm text-slate-800 truncate">{lead.name}</span>
                        <StatusBadge status={pipelineBadgeStatus(stage)} label={pipelineStageLabel(stage)} />
                      </div>
                      {project && <p className="text-xs text-slate-500">Project: {project.name}</p>}
                      <p className="text-xs text-slate-500">Assigned to: {lead.assignedToName ?? lead.ownerName}</p>
                      <p className="text-xs text-slate-400 mb-2.5">{relevantDate(lead, stage, appointments)}</p>

                      {action && (
                        <button onClick={action.onClick}
                          className="w-full py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 active:bg-blue-100">
                          {action.label}
                        </button>
                      )}
                    </div>
                  )
                })}

                {!isLoading && filteredPipelineItems.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-8">No leads in this stage.</p>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* Reuses the real LeadStatusSheet unmodified for every lead-driven
          stage except the in-page approval mini-flow below. */}
      {liveLead && liveStage !== 'qualified_pending_approval' && (
        <LeadStatusSheet
          isOpen={!!openLeadId}
          onClose={() => setOpenLeadId(null)}
          lead={liveLead}
          onDone={msg => setSnack({ open: true, msg, type: 'success' })}
        />
      )}

      {/* Reuses the real ProjectStatusSheet unmodified for every project-driven stage. */}
      {liveProject && (
        <ProjectStatusSheet
          isOpen={!!openProjectId}
          onClose={() => setOpenProjectId(null)}
          project={liveProject}
          onDone={async msg => {
            const projs = await getAllProjects()
            setProjects(projs)
            setSnack({ open: true, msg, type: 'success' })
          }}
        />
      )}

      {/* In-page reschedule approve/reject — the one stage LeadStatusSheet
          itself would send to /md-tasks for. */}
      <BottomSheet isOpen={!!openLeadId && liveStage === 'qualified_pending_approval'}
        onClose={() => setOpenLeadId(null)} title="Review Reschedule Request" height="full">
        {liveLead && (() => {
          const appt = pendingApptFor(liveLead, appointments)
          return (
            <div className="space-y-4 pb-4">
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="font-bold text-sm text-slate-800">{liveLead.name}</p>
                {appt && <p className="text-xs text-slate-600">Appointment: {fmtDateTime(appt.scheduledAt)} — {appt.location}</p>}
                {appt?.rescheduledDate && <p className="text-xs text-slate-600">Requested new date: {fmtDateTime(appt.rescheduledDate)}</p>}
                {appt?.rescheduleReason && <p className="text-xs text-slate-600">Reason: {appt.rescheduleReason}</p>}
                <p className="text-[11px] text-slate-400">Requested by {appt?.rescheduleRequestedBy ?? '—'}{appt?.rescheduleRequestedAt ? ` · ${fmtDateTime(appt.rescheduleRequestedAt)}` : ''}</p>
              </div>

              {actionError && <p className="text-xs text-red-600 font-semibold">{actionError}</p>}

              {isOwner ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea value={mdNotes} onChange={e => setMdNotes(e.target.value)} rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <button disabled={actionSaving} onClick={() => handleDecideInline(true)}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
                    {actionSaving ? 'Saving…' : 'Approve'}
                  </button>
                  <button disabled={actionSaving} onClick={() => handleDecideInline(false)}
                    className="w-full py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700 active:bg-red-100 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">Waiting on MD review — no action available here.</p>
              )}
            </div>
          )
        })()}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
