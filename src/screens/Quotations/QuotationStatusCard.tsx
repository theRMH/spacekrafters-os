import { useState } from 'react'
import { QUOTATION_STATUS_LABEL, quotationWorkflowInfo } from './QuotationsScreen'
import { changeQuotationStatus } from './quotationActions'
import type { AuthUser, Lead, Quotation } from '../../types'

// The compact, Lead-page version of QuotationsScreen.tsx's own Status
// Actions block — same underlying transition (changeQuotationStatus), just a
// smaller renderer so "Update Status" works without leaving the Lead page.
// Only covers the PC/MD approve-reject-resubmit actions (the ones that don't
// require editing the quotation's line items) — anything else still links out
// to the full screen, matching "only open dedicated pages when detailed
// editing is actually required."
export function QuotationStatusCard({ quotation, can, user, lead, updateLead, onChanged, onReview }: {
  quotation: Quotation
  can: (p: 'approve_quotation_pc' | 'approve_quotation_internal') => boolean
  user: AuthUser | null
  lead: Lead
  updateLead: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
  onChanged: (updated: Quotation) => void
  onReview: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function act(status: Quotation['status'], note?: string, labelOverride?: string) {
    setSaving(true)
    const result = await changeQuotationStatus({
      quotation, status, note, labelOverride,
      decidedByName: user?.name ?? 'Unknown', decidedByRole: user?.role,
      leadLabel: lead.name, lead, updateLead,
    })
    setSaving(false)
    if (!result.ok || !result.updated) { setError(result.error ?? 'Could not update status.'); return }
    setShowReject(false); setRejectReason(''); setError('')
    onChanged(result.updated)
  }

  const canPc = can('approve_quotation_pc')
  const canMd = can('approve_quotation_internal')

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Quotation Status</p>
            <p className="text-sm font-bold text-indigo-900">{QUOTATION_STATUS_LABEL[quotation.status]}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
            <p className="text-sm font-bold text-indigo-900">{quotationWorkflowInfo(quotation).responsible}</p>
          </div>
        </div>
        <p className="text-xs text-indigo-700 mt-1.5">Next: {quotationWorkflowInfo(quotation).next}</p>
      </div>

      {quotation.rejectionReason && (quotation.status === 'pc_rejected' || quotation.status === 'md_rejected') && (
        <p className="text-xs text-red-600">Revision reason: {quotation.rejectionReason}</p>
      )}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

      {quotation.status === 'pending_pc_review' && canPc && !showReject && (
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => act('internal_review', undefined, 'PC approved — sent to MD for approval')}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 active:bg-emerald-100 disabled:opacity-50">
            PC Approve
          </button>
          <button disabled={saving} onClick={() => setShowReject(true)}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-red-200 bg-red-50 text-red-700 active:bg-red-100 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}

      {quotation.status === 'internal_review' && canMd && !showReject && (
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => act('internally_approved')}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 active:bg-emerald-100 disabled:opacity-50">
            MD Approve
          </button>
          <button disabled={saving} onClick={() => setShowReject(true)}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-red-200 bg-red-50 text-red-700 active:bg-red-100 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}

      {quotation.status === 'md_rejected' && canPc && (
        <button disabled={saving} onClick={() => act('internal_review', undefined, 'PC resubmitted to MD')}
          className="w-full py-3 rounded-xl text-sm font-bold border border-blue-200 bg-blue-50 text-blue-700 active:bg-blue-100 disabled:opacity-50">
          Resubmit to MD
        </button>
      )}

      {showReject && (
        <div className="space-y-2">
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejection"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <button disabled={!rejectReason.trim() || saving}
            onClick={() => act(quotation.status === 'pending_pc_review' ? 'pc_rejected' : 'md_rejected', rejectReason.trim(),
              quotation.status === 'pending_pc_review' ? 'PC rejected' : 'MD rejected')}
            className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            Confirm Reject
          </button>
        </div>
      )}

      <button onClick={onReview} className="w-full py-2.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 active:bg-slate-50">
        Open full Quotation →
      </button>
    </div>
  )
}
