import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, MessageCircle, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { getAllProjects } from '../../services/projectService'
import { getAllDesignPackages, upsertDesignPackage, getAllDesignVersions, addDesignVersion } from '../../services/designService'
import { getAllQuotations } from '../../services/quotationService'
import { addAuditLog } from '../../services/auditLogService'
import { approvalHistoryEntry } from '../../utils/approvalHistory'
import { changeDesignStatus, buildDesignClientMessage } from './designActions'
import { MdOverrideCard } from '../../components/forms/MdOverrideCard'
import { ROLE_LABELS } from '../../data/permissions'
import type { Project, DesignPackage, DesignPackageStatus, DesignVersion, AuditLog, Quotation } from '../../types'

// Same MD-approval terminology as Quotations, via StatusBadge's `label`
// override — 'client_review' is legacy (pre-existing packages only).
export const DESIGN_STATUS_LABEL: Record<DesignPackageStatus, string> = {
  in_progress:         'Created',
  pending_pc_review:   'Pending PC Review',
  pc_rejected:         'PC Rejected — Back to Designer',
  internal_review:     'Pending MD Approval',
  md_rejected:         'MD Rejected — Back to PC',
  internally_approved: 'MD Approved',
  sent_to_client:      'Sent to Client',
  client_approved:     'Client Approved',
  revision_requested:  'Revision Requested',
  rejected:            'Rejected',
  client_review:       'Client Review',
}

// Who's currently responsible and what happens next, per stage — shown
// directly on the Detail sheet so this is never ambiguous.
export function designWorkflowInfo(status: DesignPackageStatus): { responsible: string; next: string } {
  switch (status) {
    case 'in_progress':         return { responsible: 'Designer', next: 'Submit for PC review' }
    case 'pending_pc_review':   return { responsible: 'PC',       next: 'PC approves or rejects' }
    case 'pc_rejected':         return { responsible: 'Designer', next: 'Revise and resubmit for PC review' }
    case 'internal_review':     return { responsible: 'MD',       next: 'MD approves or rejects' }
    case 'md_rejected':         return { responsible: 'PC',       next: 'Resubmit to MD, or revise first' }
    case 'internally_approved': return { responsible: 'PC / MD',  next: 'Send design to client' }
    case 'sent_to_client':      return { responsible: 'Client',   next: 'Awaiting client decision' }
    case 'client_review':       return { responsible: 'Client',   next: 'Awaiting client decision' }
    case 'revision_requested':  return { responsible: 'Designer', next: 'Revise and resubmit' }
    case 'client_approved':     return { responsible: '—',        next: 'Design approved' }
    case 'rejected':            return { responsible: 'Designer', next: 'Revise and resubmit' }
  }
}

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DesignCenterScreen() {
  const { user, can } = useAuth()
  const { leads, updateLead } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const canUpload = can('upload_design')
  const canApprovePc = can('approve_design_pc')
  const canApprove = can('approve_design')
  const canRequestRevision = can('request_revision')

  const [projects, setProjects] = useState<Project[]>([])
  const [packages, setPackages] = useState<DesignPackage[]>([])
  const [versions, setVersions] = useState<DesignVersion[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selected, setSelected] = useState<DesignPackage | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showVersion, setShowVersion] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  // Set (together with returnTo) when this screen was opened via a Lead's
  // leadId deep link that explicitly asked for a return destination — every
  // dismissal of the New Package sheet (X, backdrop, or a completed save)
  // then returns there instead of leaving the bare Design Center list
  // showing underneath.
  const [fromLeadId, setFromLeadId] = useState('')
  const [returnTo, setReturnTo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [newPackageFiles, setNewPackageFiles] = useState<string[]>([])
  const [versionFiles, setVersionFiles] = useState<string[]>([])
  const [versionNote, setVersionNote] = useState('')
  const [formError, setFormError] = useState('')
  const [showSendChoice, setShowSendChoice] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  // Target of the shared "Reject Design" sheet — which status a rejection
  // from the currently open stage writes, and who it's then waiting on.
  const [rejectTarget, setRejectTarget] = useState<{ status: DesignPackageStatus; label: string }>({ status: 'md_rejected', label: 'MD rejected' })

  // Design starts at the Lead's `internally_approved` stage (LeadStatusSheet.tsx),
  // before a Project exists — Projects are only created once a Lead is Won. So a
  // package must be linkable to either one; leads already Won/Lost are excluded
  // since Won leads should be linked via their resulting Project instead.
  const eligibleLeads = leads.filter(l => l.status !== 'won' && l.status !== 'lost')

  // A pre-project (lead-linked) design package can't start until that lead's
  // quotation has been client-approved AND the "Proceed with Advance" /
  // "Proceed without Advance" choice has been made in QuotationsScreen.tsx.
  // Without Advance deliberately does NOT block design (the client just hasn't
  // paid yet); `advancePaymentReceived` is kept as a fallback for quotations
  // recorded before that choice existed. Won leads are exempt — a Project can't
  // exist without already having gone through the (older) advance-payment-at-Won
  // step in LeadStatusSheet.tsx.
  function eligibleQuotationFor(id: string): Quotation | undefined {
    return quotations.find(q => q.leadId === id && q.status === 'client_approved' && (q.advanceStatus || q.advancePaymentReceived))
  }

  async function refresh() {
    setIsLoading(true)
    const [projs, pkgs, vers, quotes] = await Promise.all([getAllProjects(), getAllDesignPackages(), getAllDesignVersions(), getAllQuotations()])
    setProjects(projs)
    setPackages(pkgs)
    setVersions(vers)
    setQuotations(quotes)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const state = routerLocation.state as { leadId?: string; returnTo?: string } | null
    if (!state?.leadId || isLoading) return
    // LeadStatusSheet's "Go to Design Center →" is reachable by anyone who
    // can act on the lead (e.g. a Project Coordinator), but only
    // owner/designer can actually create a package (sks_design_packages'
    // RLS insert policy). Opening the form for anyone else would always
    // fail to save, so just land on the list instead.
    if (!canUpload) {
      setSnack({ open: true, msg: 'Only the design team or MD can start a design package — ask a designer to pick this lead up.', type: 'error' })
      navigate(routerLocation.pathname, { replace: true, state: null })
      return
    }
    resetNewForm()
    setLeadId(state.leadId)
    setShowNew(true)
    // returnTo is only sent when this came from LeadStatusSheet's "Go to
    // Design Center →" — not when reached some other way.
    if (state.returnTo) { setFromLeadId(state.leadId); setReturnTo(state.returnTo) }
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading, canUpload])

  // Deep-link from the Approval page's "Review" on a PC-pending design
  // package, or from a bell notification's url (?packageId=... — a plain
  // link can't carry router state, only a query string) — either way opens
  // this exact package's Detail sheet directly.
  useEffect(() => {
    const state = routerLocation.state as { packageId?: string } | null
    const id = state?.packageId ?? new URLSearchParams(routerLocation.search).get('packageId')
    if (!id || isLoading) return
    const found = packages.find(p => p.id === id)
    if (found) setSelected(found)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, routerLocation.search, packages, isLoading])

  function projectName(id: string | undefined): string {
    if (!id) return 'Unassigned'
    return projects.find(p => p.id === id)?.name ?? id
  }

  function leadName(id: string | undefined): string | undefined {
    return id ? leads.find(l => l.id === id)?.name : undefined
  }

  function packageLinkLabel(pkg: DesignPackage): string {
    if (pkg.projectId) return projectName(pkg.projectId)
    if (pkg.leadId) return `${leadName(pkg.leadId) ?? pkg.leadId} (Lead)`
    return 'Unassigned'
  }

  function versionsFor(pkgId: string): DesignVersion[] {
    return versions.filter(v => v.designPackageId === pkgId).sort((a, b) => b.versionNumber - a.versionNumber)
  }

  function resetNewForm() {
    setProjectId(''); setLeadId(''); setName(''); setNotes(''); setNewPackageFiles([]); setFormError('')
  }

  // Closes a sheet normally, unless this screen was entered via a Lead deep
  // link — then every dismissal (X, backdrop, or a completed save) returns
  // to that lead on /leads instead.
  function dismiss(closeLocally: () => void) {
    if (returnTo) {
      const id = fromLeadId
      const to = returnTo
      setFromLeadId(''); setReturnTo('')
      navigate(to, { state: { leadId: id } })
    } else {
      closeLocally()
    }
  }

  function openNew() {
    resetNewForm()
    setShowNew(true)
  }

  function openVersionUpload() {
    setVersionFiles([]); setVersionNote(''); setFormError('')
    setShowVersion(true)
  }

  async function handleCreatePackage() {
    if (!user) return
    if (!projectId && !leadId) {
      setFormError('Select a lead or a project.')
      return
    }
    if (!name.trim()) {
      setFormError('Package name is required.')
      return
    }
    const eligibleQuotation = leadId ? eligibleQuotationFor(leadId) : undefined
    if (leadId && !eligibleQuotation) {
      setFormError("This lead's quotation must be Client Approved, with \"Proceed with Advance\" or \"Proceed without Advance\" chosen (in Quotations), before design can start.")
      return
    }
    const now = new Date().toISOString()
    const quotationId = projectId
      ? projects.find(p => p.id === projectId)?.quotationId
      : eligibleQuotation?.id
    const pkg: DesignPackage = {
      id: `dspkg_${Date.now()}`,
      projectId: projectId || undefined,
      leadId: leadId || undefined,
      quotationId,
      name: name.trim(),
      status: 'in_progress',
      statusHistory: [approvalHistoryEntry('in_progress' as DesignPackageStatus, 'Package created', user)],
      notes: notes.trim() || undefined,
      createdBy: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertDesignPackage(pkg)
    if (!result.ok) { setFormError(result.error ?? 'Could not create design package.'); return }
    // Files picked on the New Package form become the package's Version 1, so
    // they live in the same version history (and open/download UI) as every
    // later upload — no separate storage.
    let firstVersion: DesignVersion | undefined
    if (newPackageFiles.length > 0) {
      firstVersion = {
        id: `dsver_${Date.now()}`,
        designPackageId: pkg.id,
        versionNumber: 1,
        files: newPackageFiles,
        note: 'Initial upload',
        createdBy: user.name,
        createdAt: now,
      }
      const versionResult = await addDesignVersion(firstVersion)
      if (!versionResult.ok) {
        setPackages(prev => [pkg, ...prev])
        dismiss(() => setShowNew(false))
        setSnack({ open: true, msg: `Package created, but the files could not be saved (${versionResult.error ?? 'unknown error'}). Add them via "+ Add Version".`, type: 'error' })
        return
      }
    }
    setPackages(prev => [pkg, ...prev])
    if (firstVersion) setVersions(prev => [firstVersion!, ...prev])
    dismiss(() => setShowNew(false))
    setSnack({ open: true, msg: newPackageFiles.length > 0 ? `Design package created with ${newPackageFiles.length} file${newPackageFiles.length > 1 ? 's' : ''}.` : 'Design package created.', type: 'success' })
  }

  async function handleAddVersion() {
    if (!user || !selected) return
    if (versionFiles.length === 0) {
      setFormError('At least one file is required.')
      return
    }
    const nextVersionNumber = versionsFor(selected.id).length + 1
    const version: DesignVersion = {
      id: `dsver_${Date.now()}`,
      designPackageId: selected.id,
      versionNumber: nextVersionNumber,
      files: versionFiles,
      note: versionNote.trim() || undefined,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    }
    const result = await addDesignVersion(version)
    if (!result.ok) { setFormError(result.error ?? 'Could not add version.'); return }
    setVersions(prev => [version, ...prev])
    setShowVersion(false)
    setSnack({ open: true, msg: 'Version added.', type: 'success' })
  }

  // Delegates the actual transition + history + notify + Lead-advance to
  // designActions.ts's changeDesignStatus() — the same function the compact
  // Lead-page DesignStatusCard calls, so there is exactly one implementation
  // of that logic. What stays here is screen-specific: local state updates
  // and the audit log.
  async function handleStatusChange(status: DesignPackageStatus, note?: string, labelOverride?: string) {
    if (!selected) return
    const lead = selected.leadId ? leads.find(l => l.id === selected.leadId) : undefined
    const result = await changeDesignStatus({
      pkg: selected, status, note, labelOverride, user,
      packageLabel: packageLinkLabel(selected), lead, updateLead,
    })
    if (!result.ok || !result.updated) { setSnack({ open: true, msg: result.error ?? 'Could not update status.', type: 'error' }); return }
    const updated = result.updated
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: updated.projectId,
        action: 'design_status_changed',
        description: `Design package "${updated.name}" status changed to "${status}".`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setPackages(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    setSelected(updated)
    setSnack({ open: true, msg: 'Status updated.', type: 'success' })
  }

  // Mirrors QuotationsScreen.tsx's handleSendToClient — same technical
  // reasoning (wa.me/mailto can't attach a binary file, so the latest design
  // version's real file URL is included as a link instead).
  async function handleSendDesignToClient(channel: 'whatsapp' | 'email') {
    if (!selected) return
    const project = selected.projectId ? projects.find(p => p.id === selected.projectId) : undefined
    const lead = selected.leadId
      ? leads.find(l => l.id === selected.leadId)
      : project?.leadId ? leads.find(l => l.id === project.leadId) : undefined
    const recipientName = lead?.name ?? project?.clientName ?? ''
    const latestVersion = versionsFor(selected.id)[0]
    const docUrls = latestVersion?.files ?? []
    const message = buildDesignClientMessage(selected, recipientName, docUrls)

    if (channel === 'whatsapp') {
      const digits = (lead?.phone ?? project?.clientPhone ?? '').replace(/\D/g, '')
      if (!digits) { setSnack({ open: true, msg: 'No phone number on file for this client.', type: 'error' }); return }
      const intlPhone = digits.length === 10 ? `91${digits}` : digits
      window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    } else {
      if (!lead?.email) { setSnack({ open: true, msg: 'No email on file for this client.', type: 'error' }); return }
      window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent('Your Design from SpaceKrafters')}&body=${encodeURIComponent(message)}`
    }

    setShowSendChoice(false)
    await handleStatusChange('sent_to_client')
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-slate-800">Design Center</h1>
          <PermissionGate permission="upload_design">
            <button onClick={openNew} aria-label="New design package"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && packages.map(pkg => (
          <div key={pkg.id} onClick={() => setSelected(pkg)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{pkg.name}</span>
                <p className="text-xs text-slate-500 mt-0.5">{packageLinkLabel(pkg)}</p>
                <p className="text-xs text-slate-400 mt-1">{versionsFor(pkg.id).length} version{versionsFor(pkg.id).length !== 1 ? 's' : ''}</p>
              </div>
              <StatusBadge status={pkg.status} label={DESIGN_STATUS_LABEL[pkg.status]} />
            </div>
            <button onClick={e => { e.stopPropagation(); setSelected(pkg) }}
              className="w-full mt-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 active:bg-blue-100">
              Update Status
            </button>
          </div>
        ))}

        {!isLoading && packages.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">🎨</p>
            <p className="text-sm">No design packages found</p>
          </div>
        )}
      </div>

      {/* Design Package Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showVersion} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">{packageLinkLabel(selected)}</p>
                <StatusBadge status={selected.status} label={DESIGN_STATUS_LABEL[selected.status]} />
              </div>
              {canUpload && (
                <button onClick={openVersionUpload}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  + Add Version
                </button>
              )}
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Current Stage</p>
                  <p className="text-sm font-bold text-indigo-900">{DESIGN_STATUS_LABEL[selected.status]}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                  <p className="text-sm font-bold text-indigo-900">{designWorkflowInfo(selected.status).responsible}</p>
                </div>
              </div>
              <p className="text-xs text-indigo-700 mt-1.5">Next: {designWorkflowInfo(selected.status).next}</p>
            </div>

            {selected.notes && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-xs text-slate-600">{selected.notes}</p>
              </div>
            )}

            {user?.role === 'owner' && (
              <MdOverrideCard noun="status" title="design status"
                options={(Object.keys(DESIGN_STATUS_LABEL) as DesignPackageStatus[]).filter(s => s !== selected.status).map(s => ({ value: s, label: DESIGN_STATUS_LABEL[s] }))}
                onApply={async (v, reason) => { await handleStatusChange(v as DesignPackageStatus, reason, `MD override: ${DESIGN_STATUS_LABEL[selected.status]} → ${DESIGN_STATUS_LABEL[v as DesignPackageStatus]}`) }} />
            )}

            <div className="space-y-2">
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Status Actions</p>
              <div className="flex flex-wrap gap-2">
                {/* Whoever uploads the design (designer) submits it to PC first,
                    then PC to MD — the MD step below is unchanged. */}
                {selected.status === 'in_progress' && (canUpload || canApprovePc) && (
                  <button onClick={() => handleStatusChange('pending_pc_review')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Submit for PC Review
                  </button>
                )}
                {selected.status === 'pending_pc_review' && !canApprovePc && (
                  <p className="text-xs text-slate-500">Waiting for PC review.</p>
                )}
                {selected.status === 'pending_pc_review' && canApprovePc && (
                  <>
                    <button onClick={() => handleStatusChange('internal_review', undefined, 'PC approved — sent to MD for approval')}
                      className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                      PC Approve
                    </button>
                    <button onClick={() => { setRejectReason(''); setRejectTarget({ status: 'pc_rejected', label: 'PC rejected' }); setShowReject(true) }}
                      className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100">
                      Reject
                    </button>
                  </>
                )}
                {selected.status === 'pc_rejected' && (canUpload || canApprovePc) && (
                  <button onClick={() => handleStatusChange('pending_pc_review')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Revise (add a version) then Resubmit for PC Review
                  </button>
                )}
                {selected.status === 'internal_review' && !canApprove && (
                  <p className="text-xs text-slate-500">Waiting for MD approval.</p>
                )}
                {selected.status === 'internal_review' && canApprove && (
                  <>
                    <button onClick={() => handleStatusChange('internally_approved')}
                      className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                      MD Approve
                    </button>
                    <button onClick={() => { setRejectReason(''); setRejectTarget({ status: 'md_rejected', label: 'MD rejected' }); setShowReject(true) }}
                      className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100">
                      Reject
                    </button>
                  </>
                )}
                {/* MD rejected -> back to PC, the previous responsible person. */}
                {selected.status === 'md_rejected' && !canApprovePc && (
                  <p className="text-xs text-slate-500">Rejected by MD — waiting for PC.</p>
                )}
                {selected.status === 'md_rejected' && canApprovePc && (
                  <button onClick={() => handleStatusChange('internal_review', undefined, 'PC resubmitted to MD')}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Resubmit to MD
                  </button>
                )}
                {selected.status === 'rejected' && selected.rejectionReason && (canUpload || canApprove) && (
                  <button onClick={() => handleStatusChange('in_progress')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Back to In Progress
                  </button>
                )}
                {selected.status === 'internally_approved' && canApprove && (
                  <button onClick={() => setShowSendChoice(true)}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Send Design to Client
                  </button>
                )}
                {selected.status === 'sent_to_client' && (canApprove || canRequestRevision) && (
                  <>
                    {canApprove && (
                      <button onClick={() => handleStatusChange('client_approved')}
                        className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                        Client Approved
                      </button>
                    )}
                    {canRequestRevision && (
                      <button onClick={() => handleStatusChange('revision_requested')}
                        className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 active:bg-amber-100">
                        Revision Requested
                      </button>
                    )}
                    {canApprove && (
                      <button onClick={() => handleStatusChange('rejected')}
                        className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100">
                        Client Rejected
                      </button>
                    )}
                  </>
                )}
                {selected.status === 'revision_requested' && canApprove && (
                  <button onClick={() => handleStatusChange('in_progress')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Back to In Progress
                  </button>
                )}
              </div>
            </div>

            {(selected.status === 'rejected' || selected.status === 'pc_rejected' || selected.status === 'md_rejected') && selected.rejectionReason && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-3.5">
                <p className="text-xs font-bold text-red-700">
                  {selected.status === 'md_rejected' ? 'Rejected by MD' : selected.status === 'pc_rejected' ? 'Rejected by PC' : 'Rejected'}
                </p>
                <p className="text-xs text-red-600 mt-0.5">{selected.rejectionReason}</p>
                <p className="text-[12px] text-red-500 mt-1">
                  {selected.status === 'pc_rejected'
                    ? 'Revise the design (add a version) and resubmit for PC review.'
                    : selected.status === 'md_rejected'
                    ? 'PC can resubmit directly to MD, or revise it first.'
                    : 'Revise the design (add a version), move it back to In Progress and submit it again.'}
                </p>
              </div>
            )}

            {(selected.statusHistory?.length ?? 0) > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Approval History</p>
                <div className="space-y-2.5">
                  {[...(selected.statusHistory ?? [])].reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-slate-800 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">{h.label}</p>
                        {h.note && <p className="text-[12px] text-slate-500">{h.note}</p>}
                        <p className="text-[11px] text-slate-400">
                          {h.by}{h.byRole ? ` (${ROLE_LABELS[h.byRole]})` : ''} · {new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Version History</p>
              <div className="space-y-2.5">
                {versionsFor(selected.id).map(v => (
                  <div key={v.id} className="bg-white border border-slate-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Version {v.versionNumber}</span>
                      <span className="text-[12px] text-slate-400">{fmtDateTime(v.createdAt)}</span>
                    </div>
                    {v.note && <p className="text-[12px] text-slate-500 mt-1">{v.note}</p>}
                    <p className="text-[12px] text-slate-400 mt-1 mb-1.5">by {v.createdBy}</p>
                    <MultiFileUploadField label="" files={v.files} onChange={() => {}} readOnly />
                  </div>
                ))}
                {versionsFor(selected.id).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No versions uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New Design Package Sheet */}
      <BottomSheet isOpen={showNew} onClose={() => dismiss(() => setShowNew(false))} title="New Design Package" height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <p className="text-xs text-slate-500">Link to the Lead if the project hasn't been created yet, or to the Project once it has.</p>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead (pre-project)</label>
            <SearchableSelect
              value={leadId} onChange={v => { setLeadId(v); if (v) setProjectId('') }}
              options={eligibleLeads.map(l => ({ value: l.id, label: l.name }))}
              placeholder="— None —"
            />
            {leadId && !eligibleQuotationFor(leadId) && (
              <p className="text-[12px] text-amber-600 font-semibold mt-1">
                This lead's quotation must be Client Approved, with Proceed with / without Advance chosen, before design can start — check Quotations.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project</label>
            <SearchableSelect
              value={projectId} onChange={v => { setProjectId(v); if (v) setLeadId('') }}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="— None —"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Package Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Living Room Moodboard"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <MultiFileUploadField
            label="Design Files (optional)"
            files={newPackageFiles}
            onChange={setNewPackageFiles}
            uploadButtonLabel="Upload Files / PDFs"
            helperText="Select several files at once, or add more later. You can remove a file before creating the package."
          />
          <button onClick={handleCreatePackage}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}>
            Create Package
          </button>
        </div>
      </BottomSheet>

      {/* Add Version Sheet */}
      <BottomSheet isOpen={showVersion} onClose={() => setShowVersion(false)} title="Add Design Version" height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <MultiFileUploadField
            label="Design Files"
            files={versionFiles}
            onChange={setVersionFiles}
            required
            uploadButtonLabel="Upload Design Files"
          />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Note</label>
            <textarea value={versionNote} onChange={e => setVersionNote(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleAddVersion}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}>
            Add Version
          </button>
        </div>
      </BottomSheet>

      {/* MD rejection — reason required */}
      <BottomSheet isOpen={showReject} onClose={() => setShowReject(false)} title="Reject Design">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Reason for rejection *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="What needs to change?"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button disabled={!rejectReason.trim()}
            onClick={async () => { setShowReject(false); await handleStatusChange(rejectTarget.status, rejectReason.trim(), rejectTarget.label) }}
            className="w-full py-3.5 rounded-xl bg-red-500 text-sm font-bold text-white active:bg-red-600 disabled:opacity-40">
            Reject Design
          </button>
        </div>
      </BottomSheet>

      {/* Send Design to Client — choose channel */}
      <BottomSheet isOpen={showSendChoice} onClose={() => setShowSendChoice(false)} title="Send Design to Client">
        <div className="space-y-3 pb-4">
          <p className="text-xs text-slate-500">Opens the client's WhatsApp or email with a link to the latest design version pre-filled.</p>
          <button onClick={() => handleSendDesignToClient('whatsapp')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white text-sm font-bold active:bg-emerald-700">
            <MessageCircle size={16} /> Send via WhatsApp
          </button>
          <button onClick={() => handleSendDesignToClient('email')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            <Mail size={16} /> Send via Email
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
