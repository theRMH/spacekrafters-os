import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { getAllQuotations } from '../../services/quotationService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllProjects } from '../../services/projectService'
import { getAllMRFs } from '../../services/mrfService'
import { ApprovalReviewSheets, fmtCurrency, submittedBy } from './ApprovalReviewSheets'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { MRFDetailBody, resolveLeadOwner } from '../MRF/MRFPanel'
import type { Quotation, DesignPackage, DesignVersion, Project, MaterialRequestForm } from '../../types'

export type ApprovalTab = 'quotation' | 'design' | 'mrf'
type Tab = ApprovalTab

// MD-only "Approval" queue: quotations and designs currently sitting in
// "Pending MD Approval", as two separate tabs. The selected tab is owned by the
// page (so the history below can follow it). (The review sheets and the
// Approve / Reject logic live in ApprovalReviewSheets, shared with the MD Task page.)
export function ApprovalSection({ tab, onTabChange, onDecided }: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  onDecided?: () => void
}) {
  const { user } = useAuth()
  const { leads } = useCRM()

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [packages, setPackages] = useState<DesignPackage[]>([])
  const [versions, setVersions] = useState<DesignVersion[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null)
  const [selectedDesign, setSelectedDesign] = useState<DesignPackage | null>(null)
  const [selectedMrf, setSelectedMrf] = useState<MaterialRequestForm | null>(null)
  const [mrfSnack, setMrfSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      const [q, p, v, pr, m] = await Promise.all([getAllQuotations(), getAllDesignPackages(), getAllDesignVersions(), getAllProjects(), getAllMRFs()])
      setQuotations(q); setPackages(p); setVersions(v); setProjects(pr); setMrfs(m)
      setIsLoading(false)
    }
    load()
  }, [])

  const newest = <T extends { updatedAt: string }>(a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt)
  const pendingQuotes = quotations.filter(q => q.status === 'internal_review').sort(newest)
  // Unlike Quotation/Design (MD-only, so every MD sees every pending item),
  // MRF approval is gated to the specific project's Lead Owner (see
  // canApprove/resolveLeadOwner in MRFPanel.tsx) — owner still sees all, but
  // everyone else only sees MRFs where they're the actual resolved Lead Owner.
  const pendingMrfs = mrfs
    .filter(m => m.status === 'pending_coordinator_approval')
    .filter(m => {
      const leadOwner = resolveLeadOwner(projects.find(p => p.id === m.projectId)?.leadId, leads)
      return user?.role === 'owner' || (!!leadOwner.id && user?.id === leadOwner.id)
    })
    .sort(newest)
  // Sent to the client — recorded here instead of on the Quotation screen, so
  // the Approval page is the one place every quotation decision happens.
  const pendingClientApprovals = quotations.filter(q => q.status === 'sent_to_client').sort(newest)
  const pendingDesigns = packages.filter(p => p.status === 'internal_review').sort(newest)

  const leadFor = (id?: string) => (id ? leads.find(l => l.id === id) : undefined)
  function designLink(p: DesignPackage): string {
    if (p.projectId) return projects.find(pr => pr.id === p.projectId)?.name ?? p.projectId
    if (p.leadId) return `${leadFor(p.leadId)?.name ?? p.leadId} (Lead)`
    return 'Unassigned'
  }

  const tabBtn = (value: Tab, label: string, count: number) => (
    <button key={value} onClick={() => onTabChange(value)} aria-pressed={tab === value}
      className={`flex-1 py-2.5 rounded-xl text-sm font-bold active:opacity-90 ${
        tab === value ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'
      }`}
      style={tab === value ? { background: '#0F2A4A' } : undefined}>
      {label} <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full ${tab === value ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  )

  const cardShell = 'bg-white rounded-2xl shadow-card border border-slate-100 p-4'
  const pendingPill = <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Pending</span>
  const reviewBtn = (onClick: () => void) => (
    <button onClick={onClick} className="px-4 py-2 rounded-xl text-xs font-bold text-white active:opacity-90" style={{ background: '#4F46E5' }}>
      Review
    </button>
  )
  const emptyText = <p className="text-sm text-slate-400 text-center py-8">Nothing waiting for your approval.</p>

  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        {tabBtn('quotation', 'Quotation', pendingQuotes.length + pendingClientApprovals.length)}
        {tabBtn('design', 'Designing', pendingDesigns.length)}
        {tabBtn('mrf', 'MRF', pendingMrfs.length)}
      </div>

      {tab === 'quotation' && (
        <div className="space-y-3">
          {!isLoading && pendingQuotes.length === 0 && pendingClientApprovals.length === 0 && emptyText}
          {pendingQuotes.map(q => {
            const lead = leadFor(q.leadId)
            return (
              <div key={q.id} className={cardShell}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800">Quotation Approval</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Quotation</span>
                </div>
                <p className="text-sm text-slate-700 font-semibold">{lead?.name ?? q.leadId}</p>
                <p className="text-xs text-slate-500">Lead ID: {lead?.leadNumber ?? '—'} · v{q.version}</p>
                <p className="text-xs text-slate-500">Net Amount: <span className="font-semibold text-slate-700">{fmtCurrency(q.netAmount)}</span></p>
                <p className="text-[12px] text-slate-400 mt-1">Submitted by {submittedBy(q.statusHistory, q.updatedAt)}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  {pendingPill}
                  {reviewBtn(() => setSelectedQuote(q))}
                </div>
              </div>
            )
          })}
          {pendingClientApprovals.map(q => {
            const lead = leadFor(q.leadId)
            return (
              <div key={q.id} className={cardShell}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800">Client Approval</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: '#D1FAE5', color: '#047857' }}>Quotation</span>
                </div>
                <p className="text-sm text-slate-700 font-semibold">{lead?.name ?? q.leadId}</p>
                <p className="text-xs text-slate-500">Lead ID: {lead?.leadNumber ?? '—'} · v{q.version}</p>
                <p className="text-xs text-slate-500">Net Amount: <span className="font-semibold text-slate-700">{fmtCurrency(q.netAmount)}</span></p>
                <p className="text-[12px] text-slate-400 mt-1">Sent to client — {submittedBy(q.statusHistory, q.updatedAt)}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  {pendingPill}
                  {reviewBtn(() => setSelectedQuote(q))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'design' && (
        <div className="space-y-3">
          {!isLoading && pendingDesigns.length === 0 && emptyText}
          {pendingDesigns.map(p => (
            <div key={p.id} className={cardShell}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-slate-800">Design Approval</h3>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Designing</span>
              </div>
              <p className="text-sm text-slate-700 font-semibold">{p.name}</p>
              <p className="text-xs text-slate-500">{designLink(p)}</p>
              <p className="text-xs text-slate-500">{versions.filter(v => v.designPackageId === p.id).length} version(s) uploaded</p>
              <p className="text-[12px] text-slate-400 mt-1">Submitted by {submittedBy(p.statusHistory, p.updatedAt)}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                {pendingPill}
                {reviewBtn(() => setSelectedDesign(p))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'mrf' && (
        <div className="space-y-3">
          {!isLoading && pendingMrfs.length === 0 && emptyText}
          {pendingMrfs.map(m => {
            const project = projects.find(p => p.id === m.projectId)
            const lastEntry = m.history[m.history.length - 1]
            return (
              <div key={m.id} className={cardShell}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800">MRF Approval</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: '#EDE9FE', color: '#6D28D9' }}>MRF</span>
                </div>
                <p className="text-sm text-slate-700 font-semibold">{project?.name ?? m.projectId}</p>
                <p className="text-xs text-slate-500">Client: {project?.clientName ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">{m.materialDetails || 'No details entered yet.'}</p>
                <p className="text-[12px] text-slate-400 mt-1">Submitted by {lastEntry?.updatedBy ?? '—'}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  {pendingPill}
                  {reviewBtn(() => setSelectedMrf(m))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BottomSheet isOpen={!!selectedMrf} onClose={() => setSelectedMrf(null)} title="MRF" height="full">
        {selectedMrf && (() => {
          const project = projects.find(p => p.id === selectedMrf.projectId)
          return (
            <MRFDetailBody
              mrf={selectedMrf}
              projectName={project?.name ?? selectedMrf.projectId}
              leadId={project?.leadId}
              onSaved={updated => {
                setMrfs(prev => prev.map(x => (x.id === updated.id ? updated : x)))
                setSelectedMrf(null)
                onDecided?.()
              }}
              notify={(msg, type) => setMrfSnack({ open: true, msg, type })}
            />
          )
        })()}
      </BottomSheet>

      <Snackbar isOpen={mrfSnack.open} message={mrfSnack.msg} type={mrfSnack.type} onClose={() => setMrfSnack(s => ({ ...s, open: false }))} />

      <ApprovalReviewSheets
        quote={selectedQuote}
        design={selectedDesign}
        versions={versions}
        projects={projects}
        onClose={() => { setSelectedQuote(null); setSelectedDesign(null) }}
        onDecided={({ quotation, design }) => {
          if (quotation) setQuotations(prev => prev.map(x => (x.id === quotation.id ? quotation : x)))
          if (design) setPackages(prev => prev.map(x => (x.id === design.id ? design : x)))
          setSelectedQuote(null); setSelectedDesign(null)
          onDecided?.()
        }}
      />
    </section>
  )
}
