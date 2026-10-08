import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { upsertQuotation } from '../../services/quotationService'
import { upsertProject } from '../../services/projectService'
import { upsertDesignPackage } from '../../services/designService'
import { addAuditLog } from '../../services/auditLogService'
import { approvalHistoryEntry } from '../../utils/approvalHistory'
import type { Quotation, DesignPackage, DesignVersion, Project, AuditLog, QuotationStatus, DesignPackageStatus } from '../../types'

export function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Who submitted the item = the most recent history entry (falls back to the
// record's own timestamp for items created before history was recorded).
export function submitter(history: { by: string; at: string }[] | undefined): string | undefined {
  return history?.[history.length - 1]?.by
}
export function submittedBy(history: { by: string; at: string }[] | undefined, fallbackAt: string): string {
  const last = history?.[history.length - 1]
  return last ? `${last.by} · ${fmtDateTime(last.at)}` : fmtDateTime(fallbackAt)
}

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'

interface Props {
  quote: Quotation | null
  design: DesignPackage | null
  versions: DesignVersion[]
  projects: Project[]
  onClose: () => void
  onDecided: (result: { quotation?: Quotation; design?: DesignPackage }) => void
  // Previous/Next across the current tab's full pending queue — omitted (or
  // both false) when there's nothing to page through.
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

// The MD's review sheets for a pending Quotation or Design package, with
// Approve / Reject (reason required). Used by the Approval tab (the only
// place this flow lives — see ApprovalScreen.tsx) to apply exactly the same
// decision and history rules everywhere a Quotation/Design is reviewed.
export function ApprovalReviewSheets({ quote, design, versions, projects, onClose, onDecided, onPrev, onNext, hasPrev, hasNext }: Props) {
  const { user } = useAuth()
  const { leads } = useCRM()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  // A different item was opened — start from the Approve/Reject choice again.
  useEffect(() => { setRejecting(false); setReason('') }, [quote?.id, design?.id])

  const leadFor = (id?: string) => (id ? leads.find(l => l.id === id) : undefined)
  function designLink(p: DesignPackage): string {
    if (p.projectId) return projects.find(pr => pr.id === p.projectId)?.name ?? p.projectId
    if (p.leadId) return `${leadFor(p.leadId)?.name ?? p.leadId} (Lead)`
    return 'Unassigned'
  }

  async function decideQuotation(approved: boolean) {
    const q = quote
    if (!q || (!approved && !reason.trim())) return
    setSaving(true)
    const status: QuotationStatus = approved ? 'internally_approved' : 'rejected'
    const note = approved ? undefined : reason.trim()
    const updated: Quotation = {
      ...q, status,
      rejectionReason: note,
      statusHistory: [...(q.statusHistory ?? []), approvalHistoryEntry(status, approved ? 'MD approved' : 'MD rejected', user, note)],
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertQuotation(updated)
    setSaving(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not save the decision.', type: 'error' }); return }
    if (!approved && user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: updated.projectId,
        action: 'quotation_rejected',
        description: `Quotation v${updated.version} (${fmtCurrency(updated.netAmount)}) rejected.`,
        createdBy: user.name, createdByRole: user.role, createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    onDecided({ quotation: updated })
    setSnack({ open: true, msg: approved ? 'Quotation approved.' : 'Quotation rejected.', type: 'success' })
  }

  // The client-approval stage (Approval → Quotation, quote.status ===
  // 'sent_to_client') — the MD records the client's real-world decision here
  // instead of on the Quotation screen. Approve -> client_approved, Reject ->
  // revision_requested (a reason is required, same as the MD decision above).
  async function decideClientApproval(approved: boolean) {
    const q = quote
    if (!q || (!approved && !reason.trim())) return
    setSaving(true)
    const status: QuotationStatus = approved ? 'client_approved' : 'revision_requested'
    const note = approved ? undefined : reason.trim()
    const updated: Quotation = {
      ...q, status,
      approvedAt: approved ? new Date().toISOString() : q.approvedAt,
      statusHistory: [...(q.statusHistory ?? []), approvalHistoryEntry(status, approved ? 'Client approved' : 'Client requested a revision', user, note)],
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertQuotation(updated)
    if (!result.ok) { setSaving(false); setSnack({ open: true, msg: result.error ?? 'Could not save the decision.', type: 'error' }); return }
    // Project already exists (this is a later revision, not the initial project-creation
    // flow) — sync its contract value to the newly client-approved amount.
    if (approved && updated.projectId) {
      const project = projects.find(p => p.id === updated.projectId)
      if (project && project.contractValue !== updated.netAmount) {
        await upsertProject({ ...project, contractValue: updated.netAmount, updatedAt: new Date().toISOString() })
      }
    }
    setSaving(false)
    onDecided({ quotation: updated })
    setSnack({ open: true, msg: approved ? 'Client approval recorded.' : 'Revision request recorded.', type: 'success' })
  }

  async function decideDesign(approved: boolean) {
    const p = design
    if (!p || (!approved && !reason.trim())) return
    setSaving(true)
    const status: DesignPackageStatus = approved ? 'internally_approved' : 'rejected'
    const note = approved ? undefined : reason.trim()
    const updated: DesignPackage = {
      ...p, status,
      rejectionReason: note,
      statusHistory: [...(p.statusHistory ?? []), approvalHistoryEntry(status, approved ? 'MD approved' : 'MD rejected', user, note)],
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertDesignPackage(updated)
    setSaving(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not save the decision.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: updated.projectId,
        action: 'design_status_changed',
        description: `Design package "${updated.name}" status changed to "${status}".`,
        createdBy: user.name, createdByRole: user.role, createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    onDecided({ design: updated })
    setSnack({ open: true, msg: approved ? 'Design approved.' : 'Design rejected.', type: 'success' })
  }

  // Approve / Reject footer shared by both review sheets — full-width
  // selectable cards (FENSTER-style) rather than a plain button pair.
  function decisionFooter(onApprove: () => void, onReject: () => void, rejectLabel: string, approveHint: string, rejectHint: string) {
    if (!rejecting) {
      return (
        <div className="space-y-2.5">
          <button disabled={saving} onClick={onApprove}
            className="w-full text-left p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 active:bg-emerald-100 disabled:opacity-50">
            <p className="text-sm font-bold text-emerald-800">Approve</p>
            <p className="text-xs text-emerald-600 mt-0.5">{approveHint}</p>
          </button>
          <button disabled={saving} onClick={() => { setReason(''); setRejecting(true) }}
            className="w-full text-left p-4 rounded-2xl border-2 border-red-200 bg-red-50 active:bg-red-100 disabled:opacity-50">
            <p className="text-sm font-bold text-red-800">Reject</p>
            <p className="text-xs text-red-600 mt-0.5">{rejectHint}</p>
          </button>
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-500 block">Reason for rejection *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="What needs to change?" className={`${inputCls} resize-none`} />
        <button disabled={saving || !reason.trim()} onClick={onReject}
          className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 active:bg-red-600 disabled:opacity-40">
          {rejectLabel}
        </button>
        <button onClick={() => setRejecting(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600">
          Back
        </button>
      </div>
    )
  }

  // The purple-band-equivalent header FENSTER uses, in SpaceKrafters' own
  // navy brand color — title, Lead Owner, Previous/Next, close. Rendered as
  // the sheet's own first content block (full-bleed via negative margins)
  // rather than BottomSheet's generic title bar, so it can carry the nav row.
  function reviewHeader(title: string, ownerName: string | undefined) {
    const showNav = onPrev || onNext
    return (
      <div className="-mx-5 -mt-4 px-5 pt-4 pb-4 mb-4" style={{ background: 'linear-gradient(135deg, #0F2A4A, #16385E)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white truncate">{title}</h2>
            {ownerName && <p className="text-xs text-white/80 mt-0.5">Lead Owner: {ownerName}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0 active:bg-white/25">
            <X size={16} className="text-white" />
          </button>
        </div>
        {showNav && (
          <div className="flex items-center justify-between mt-3">
            <button disabled={!hasPrev} onClick={onPrev}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-white/15 px-3 py-1.5 rounded-lg disabled:text-white/40 disabled:bg-white/5">
              <ChevronLeft size={14} /> Previous
            </button>
            <button disabled={!hasNext} onClick={onNext}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-white/15 px-3 py-1.5 rounded-lg disabled:text-white/40 disabled:bg-white/5">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Quotation review — the same sheet handles both the MD's own internal
          approval (status 'internal_review') and the client-approval stage
          (status 'sent_to_client'), branching only on which decision to record. */}
      <BottomSheet isOpen={!!quote} onClose={onClose} height="full">
        {quote && (() => {
          const q = quote
          const isClientStage = q.status === 'sent_to_client'
          const lead = leadFor(q.leadId)
          return (
            <div className="space-y-4 pb-4">
              {reviewHeader(isClientStage ? 'Client Approval' : 'Approve Quotation', lead?.ownerName)}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm space-y-1">
                <p className="font-bold text-slate-800">{lead?.name ?? q.leadId} {lead?.leadNumber ? `(${lead.leadNumber})` : ''}</p>
                <p className="text-slate-600">Contact: {lead?.phone ?? '—'}</p>
                <p className="text-slate-600">Version {q.version}</p>
              </div>

              <div className="space-y-3">
                {q.sections.map(section => (
                  <div key={section.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{section.title}</span>
                      <span className="text-xs font-semibold text-slate-600">{fmtCurrency(section.items.reduce((s, i) => s + i.amount, 0))}</span>
                    </div>
                    {section.items.map((item, i) => (
                      <div key={item.id} className={`p-3.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">{item.description}</span>
                          <span className="text-xs font-bold text-slate-800">{fmtCurrency(item.amount)}</span>
                        </div>
                        <p className="text-[12px] text-slate-400 mt-0.5">
                          {item.quantity} {item.unit} × {fmtCurrency(item.rate)}{item.taxPercent ? ` · ${item.taxPercent}% tax` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(q.totalAmount)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(q.taxAmount)}</span></div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Discount{q.discountType === 'percentage' && q.discountValue ? ` (${q.discountValue}%)` : ''}</span>
                  <span className="font-semibold text-slate-700">-{fmtCurrency(q.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(q.netAmount)}</span></div>
              </div>

              {q.documentFiles && q.documentFiles.length > 0 && (
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quotation Documents</p>
                  <MultiFileUploadField label="" files={q.documentFiles} onChange={() => {}} readOnly />
                </div>
              )}
              {q.terms && <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p><p className="text-xs text-slate-600">{q.terms}</p></div>}
              {q.paymentTerms && <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Terms</p><p className="text-xs text-slate-600">{q.paymentTerms}</p></div>}

              {isClientStage
                ? decisionFooter(() => decideClientApproval(true), () => decideClientApproval(false), 'Request Revision',
                    'Client approved — move the project forward.', 'Client requested changes to this quotation.')
                : decisionFooter(() => decideQuotation(true), () => decideQuotation(false), 'Reject Quotation',
                    'Quotation is correct — send it for client sign-off.', 'Quotation needs revision.')}
            </div>
          )
        })()}
      </BottomSheet>

      {/* Design review */}
      <BottomSheet isOpen={!!design} onClose={onClose} height="full">
        {design && (() => {
          const p = design
          const pkgVersions = versions.filter(v => v.designPackageId === p.id).sort((a, b) => b.versionNumber - a.versionNumber)
          const designOwner = p.leadId ? leadFor(p.leadId)?.ownerName : undefined
          return (
            <div className="space-y-4 pb-4">
              {reviewHeader('Approve Designing', designOwner)}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm space-y-1">
                <p className="font-bold text-slate-800">{p.name}</p>
                <p className="text-slate-600">{designLink(p)}</p>
                {p.notes && <p className="text-slate-500 text-xs">{p.notes}</p>}
              </div>

              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Design Files</p>
                <div className="space-y-2.5">
                  {pkgVersions.map(v => (
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
                  {pkgVersions.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No files uploaded for this design.</p>}
                </div>
              </div>

              {decisionFooter(() => decideDesign(true), () => decideDesign(false), 'Reject Design',
                'Design is correct — approve it.', 'Design needs revision.')}
            </div>
          )
        })()}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </>
  )
}
