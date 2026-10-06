import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronDown, Phone, MessageCircle, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { ProjectStatusSheet, PROJECT_STAGE_LABEL, PROJECT_STAGE_ORDER, ROLE_FOR_PROJECT_STAGE } from '../ProjectWorkspace/ProjectStatusSheet'
import { ROLE_LABELS } from '../../data/permissions'
import { useCRM } from '../../context/CRMContext'
import { getAllProjects } from '../../services/projectService'
import { getAllAppointments } from '../../services/appointmentService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllQuotations } from '../../services/quotationService'
import { buildJourney } from '../../utils/projectJourney'
import type { Appointment, Lead, Project, Quotation, SiteVisit } from '../../types'

// Same field-role restriction ProjectWorkspaceScreen already applies to hide
// Finance/BOQ/Procurement — a site_engineer/designer sees this project's real
// timeline/action, just not its contract value/payment breakdown.
const FIELD_ROLES = ['site_engineer', 'designer']

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function MyProjectDetailScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { leads } = useCRM()

  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])

  const [openSection, setOpenSection] = useState<string | null>('timeline')
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function load() {
    const [projects, appts, visits, q] = await Promise.all([
      getAllProjects(), getAllAppointments(), getAllSiteVisits(), getAllQuotations(),
    ])
    const p = projects.find(x => x.id === projectId) ?? null
    setProject(p)
    setAppointments(appts.filter(a => p?.leadId && a.leadId === p.leadId))
    setSiteVisits(visits.filter(v => p?.leadId && v.leadId === p.leadId))
    setQuotations(q)
  }

  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [projectId])

  const lead = useMemo(() => (project?.leadId ? (leads as Lead[]).find(l => l.id === project.leadId) : undefined), [leads, project])
  const quotation = useMemo(
    () => quotations.find(q => (project && q.projectId === project.id) || (project?.leadId && q.leadId === project.leadId)),
    [quotations, project],
  )

  const journey = useMemo(() => {
    if (!project) return []
    return buildJourney({ project, lead, appointments, siteVisits, quotation })
  }, [project, lead, appointments, siteVisits, quotation])

  const stageIdx = project ? PROJECT_STAGE_ORDER.indexOf(project.stage) : -1
  const progressPct = project?.status === 'closed' ? 100 : stageIdx >= 0 ? Math.round(((stageIdx + 1) / PROJECT_STAGE_ORDER.length) * 100) : 0
  const daysToDue = project?.expectedHandoverDate ? Math.ceil((new Date(project.expectedHandoverDate).getTime() - Date.now()) / 86400000) : null

  function waLink(): string | null {
    if (!project?.clientPhone) return null
    const digits = project.clientPhone.replace(/\D/g, '')
    if (!digits) return null
    const intl = digits.length === 10 ? `91${digits}` : digits
    return `https://wa.me/${intl}?text=${encodeURIComponent(`Hi, this is regarding your project "${project.name}" with SpaceKrafters.`)}`
  }

  function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
    const open = openSection === id
    return (
      <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
        <button onClick={() => setOpenSection(open ? null : id)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <div>
            <p className="text-sm font-extrabold text-slate-800">{title}</p>
            <p className="text-xs text-slate-400">{sub}</p>
          </div>
          <ChevronDown size={17} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
      </div>
    )
  }

  if (project === undefined) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Loading…</p>
      </div>
    )
  }
  if (project === null) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Project not found.</p>
      </div>
    )
  }

  const responsibleRole = ROLE_FOR_PROJECT_STAGE[project.stage]
  const wa = waLink()
  const showFinance = !FIELD_ROLES.includes(user?.role ?? '')

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      {/* Hero header */}
      <div className="px-5 pt-5 pb-6 text-white" style={{ background: 'linear-gradient(135deg, #0F2A4A, #16385E)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <button onClick={() => navigate('/my-tasks')} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center active:bg-white/25">
            <ChevronLeft size={19} />
          </button>
          <div className="relative w-14 h-14 shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="white" strokeWidth="3.5"
                strokeDasharray={`${(progressPct / 100) * 97.4} 97.4`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{progressPct}%</span>
          </div>
        </div>

        <h1 className="text-xl font-extrabold leading-tight">{project.name}</h1>
        <p className="text-sm text-white/70 mt-0.5">{project.clientName}</p>
        <p className="text-xs text-white/70 mt-1">Assigned to: <span className="font-bold text-white">{project.assignedToName ?? project.coordinatorName}</span></p>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs font-bold">{fmtDate(project.startDate)}</p>
            <p className="text-[11px] text-white/60 mt-0.5">Start Date</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs font-bold">{fmtDate(project.expectedHandoverDate)}</p>
            <p className="text-[11px] text-white/60 mt-0.5">Due Date</p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className={`text-xs font-bold ${daysToDue != null && daysToDue < 0 ? 'text-red-300' : ''}`}>
              {daysToDue == null ? '—' : daysToDue < 0 ? `${Math.abs(daysToDue)}d over` : `${daysToDue}d left`}
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">Remaining</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <a href={project.clientPhone ? `tel:${project.clientPhone}` : undefined}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold ${project.clientPhone ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}>
            <Phone size={15} /> Call
          </a>
          <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold ${wa ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}>
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>

        {/* Coordinator / responsible */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 divide-y divide-slate-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-500">Coordinator</span>
            <span className="text-sm font-bold text-slate-800">{project.coordinatorName}</span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-500">Currently Responsible</span>
            <span className="text-sm font-bold text-slate-800">
              {project.assignedToName ?? '—'}{responsibleRole ? ` (${ROLE_LABELS[responsibleRole]})` : ''}
            </span>
          </div>
        </div>

        {/* Current Action Needed */}
        {project.status !== 'closed' && (
          <div className="rounded-2xl border p-4" style={{ background: '#EEF2FF', borderColor: '#E0E7FF' }}>
            <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#4338CA' }}>Current Action Needed</p>
            <p className="text-base font-extrabold text-slate-800 mt-1">{PROJECT_STAGE_LABEL[project.stage]}</p>
            <p className="text-xs text-slate-500 mt-0.5">{project.name} · {project.clientName}</p>
            {project.pendingStageRequest && (
              <p className="text-xs text-indigo-600 mt-1">Waiting for MD approval to move to {PROJECT_STAGE_LABEL[project.pendingStageRequest.toStage]}.</p>
            )}
            <button onClick={() => setShowStatusSheet(true)}
              className="w-full mt-3 py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
              Update Status →
            </button>
          </div>
        )}

        {/* Notes & Activity */}
        <Section id="activity" title="Notes & Activity" sub={`${journey.length} entries`}>
          {journey.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No activity recorded yet.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {[...journey].reverse().map(e => (
                <div key={e.key} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">{e.label}</p>
                    {e.note && <p className="text-[12px] text-slate-500">{e.note}</p>}
                    <p className="text-[11px] text-slate-400">{e.by ?? '—'} · {fmtDateTime(e.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Project Timeline */}
        <Section id="timeline" title="Project Timeline" sub={`${journey.length} milestones`}>
          {journey.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No timeline data yet.</p>
          ) : (
            <div className="space-y-0">
              {journey.map((e, i) => (
                <div key={e.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                    {i < journey.length - 1 && <span className="w-px flex-1 bg-emerald-200 my-0.5" style={{ minHeight: 20 }} />}
                  </div>
                  <div className="min-w-0 pb-4">
                    <p className="text-sm font-bold text-slate-800">{e.label}</p>
                    <p className="text-xs text-slate-400">{fmtDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}</p>
                    {e.note && <p className="text-xs text-slate-500 mt-0.5">{e.note}</p>}
                  </div>
                </div>
              ))}
              {project.status !== 'closed' && (
                <div className="flex gap-3">
                  <Circle size={18} className="text-slate-300 shrink-0" />
                  <p className="text-sm font-semibold text-slate-400 -mt-0.5">{PROJECT_STAGE_LABEL[project.stage]} — in progress</p>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Payment Summary — hidden for field roles (site_engineer/designer), same rule ProjectWorkspaceScreen already applies */}
        {showFinance && (
          <Section id="payment" title="Payment Summary" sub={`${PROJECT_STAGE_LABEL[project.stage]}`}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[12px] text-slate-400">Contract Value</p>
                <p className="text-sm font-extrabold text-slate-800">₹{Math.round(project.contractValue ?? 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[12px] text-slate-400">Advance Received</p>
                <p className="text-sm font-extrabold text-emerald-600">₹{Math.round(project.advanceReceived ?? 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </Section>
        )}

        {/* Project Info */}
        <Section id="info" title="Project Info" sub={project.name}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Client</span><span className="font-semibold text-slate-800">{project.clientName}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-800">{project.clientPhone || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">City</span><span className="font-semibold text-slate-800">{lead?.city ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="font-semibold text-slate-800">{fmtDate(project.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Current Stage</span><StatusBadge status={project.stage} /></div>
          </div>
        </Section>
      </div>

      <ProjectStatusSheet
        isOpen={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        project={project}
        onDone={msg => { setSnack({ open: true, msg, type: 'success' }); load() }}
      />
      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
