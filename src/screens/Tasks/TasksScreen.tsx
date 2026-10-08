import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { fmtDateTime } from '../Appointments/appointmentDate'
import { LeadStatusSheet } from '../Leads/LeadStatusSheet'
import { ProjectStatusSheet } from '../ProjectWorkspace/ProjectStatusSheet'
import {
  pipelineStage, pipelineBucket, pipelineStageLabel, pipelineBadgeStatus,
  BUCKET_LABEL, BUCKET_ORDER, type PipelineStage, type PipelineBucket,
} from './pipelineStage'
import type { Project, Appointment, Lead } from '../../types'

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
  const location = useLocation()
  const { user, can } = useAuth()
  const { leads } = useCRM()

  // Mirrors LeadsScreen.tsx's own visibility rule for leads.
  const canManageLeads = can('edit_lead')
  // Gates loading appointment data for the qualified_* stage refinement —
  // only roles that already have appointment visibility elsewhere in the app
  // see that detail.
  const canSeeAppointments = can('view_appointments')
  // Only the MD sees a way to act on a pending reschedule — the action
  // itself now happens on the Approval page, not here.
  const isOwner = can('view_md_tasks')

  const [projects, setProjects] = useState<Project[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
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

  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [projs, appts] = await Promise.all([
        getAllProjects(),
        canSeeAppointments ? getAllAppointments() : Promise.resolve([]),
      ])
      setProjects(projs)
      setAppointments(appts)
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
    // Same "mine" rule as LeadsScreen.tsx: ownerId (what Assign To actually
    // writes) or assignedToId (the current stage's auto-resolved owner) —
    // assignedToId alone missed every freshly-assigned lead, which has none
    // until its first status transition.
    .filter(l => canManageLeads || l.ownerId === user?.id || l.assignedToId === user?.id)
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
    setOpenLeadId(lead.id)
  }

  // Deep-link from a "New Lead Task" notification (sendNotification(..., '/tasks?leadId=...')) —
  // opens that lead's own action panel directly instead of just landing on
  // the page. Bypasses the pipeline list's own filters (search/bucket/FGD)
  // since the notification already points at a specific real lead.
  useEffect(() => {
    if (isLoading) return
    const leadId = new URLSearchParams(location.search).get('leadId')
    if (!leadId) return
    const lead = leads.find(l => l.id === leadId)
    if (lead) openPipelineItem(lead, pipelineStage(lead, appointments, projects))
    navigate('/tasks', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, location.search])


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
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-slate-800 truncate">{lead.name}</span>
                          {lead.leadNumber && <span className="text-xs text-slate-400 ml-1.5">{lead.leadNumber}</span>}
                        </div>
                        <StatusBadge status={pipelineBadgeStatus(stage)} label={pipelineStageLabel(stage)} />
                      </div>
                      {project && <p className="text-xs text-slate-500">Project: {project.name}</p>}
                      <p className="text-xs text-slate-500">{lead.city}</p>
                      <p className="text-xs text-slate-500">Owner: {lead.ownerName}</p>
                      {lead.assignedToName && lead.assignedToName !== lead.ownerName && (
                        <p className="text-xs text-slate-500">Assigned to: {lead.assignedToName}</p>
                      )}
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

      {/* Informational only — a pending reschedule is decided on the
          Approval page, the single place every MD approval happens. */}
      <BottomSheet isOpen={!!openLeadId && liveStage === 'qualified_pending_approval'}
        onClose={() => setOpenLeadId(null)} title="Reschedule Requested" height="full">
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

              {isOwner ? (
                <button onClick={() => { setOpenLeadId(null); navigate('/approval') }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90" style={{ background: '#0F2A4A' }}>
                  Review in Approval →
                </button>
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
