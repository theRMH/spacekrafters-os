import { useState } from 'react'
import { QUOTATION_STATUS_LABEL, quotationWorkflowInfo, fmtCurrency } from './QuotationsScreen'
import { changeQuotationStatus, recordQuotationAdvanceDecision } from './quotationActions'
import { QuotationPdfActions } from './QuotationPdfActions'
import type { AuthUser, Lead, Quotation } from '../../types'

// The compact, Lead-page version of QuotationsScreen.tsx's own Status
// Actions block — same underlying transitions (changeQuotationStatus /
// recordQuotationAdvanceDecision), just a smaller renderer so "Update
// Status" works without leaving the Lead page. Covers everything that
// doesn't require editing the quotation's line items: PC/MD
// approve-reject-resubmit, Send to Client, and the Advance decision
// (Proceed with/without Advance, Record Advance Payment).
export function QuotationStatusCard({ quotation, can, user, lead, updateLead, onChanged, onReview }: {
  quotation: Quotation
  can: (p: 'approve_quotation_pc' | 'approve_quotation_internal' | 'send_quotation_client') => boolean
  user: AuthUser | null
  lead: Lead
  updateLead: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
  onChanged: (updated: Quotation) => void
  // Optional: when given, shows an "Open full Quotation" button. The Lead sheet leaves it out — the details are shown below.
  onReview?: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  // true while the reject box is for the CLIENT rejecting a sent quotation (vs PC/MD rejecting internally)
  const [clientReject, setClientReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceRef, setAdvanceRef] = useState('')
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
    setShowReject(false); setClientReject(false); setRejectReason(''); setError('')
    onChanged(result.updated)
  }

  async function recordAdvance(patch: Partial<Quotation>, label: string, note: string) {
    setSaving(true)
    const result = await recordQuotationAdvanceDecision({
      quotation, patch, label, note,
      decidedByName: user?.name ?? 'Unknown', decidedByRole: user?.role,
      lead, updateLead,
    })
    setSaving(false)
    if (!result.ok || !result.updated) { setError(result.error ?? 'Could not save.'); return }
    setShowAdvanceForm(false); setAdvanceAmount(''); setAdvanceRef(''); setError('')
    onChanged(result.updated)
  }

  function handleRecordAdvancePayment() {
    const amount = Number(advanceAmount)
    if (!amount || amount <= 0) { setError('Enter a valid advance payment amount.'); return }
    const detail = `${fmtCurrency(amount)}${advanceRef.trim() ? ` · Ref: ${advanceRef.trim()}` : ''}`
    recordAdvance(
      {
        advanceStatus: 'with_advance', advancePaymentReceived: true,
        advancePaymentAmount: amount, advancePaymentRef: advanceRef.trim() || undefined, advancePaymentAt: new Date().toISOString(),
      },
      'Advance payment received',
      detail,
    )
  }

  const canPc = can('approve_quotation_pc')
  const canMd = can('approve_quotation_internal')
  const canSendClient = can('send_quotation_client')

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

      {quotation.rejectionReason && (quotation.status === 'pc_rejected' || quotation.status === 'md_rejected' || quotation.status === 'revision_requested') && (
        <p className="text-xs text-red-600">{quotation.status === 'revision_requested' ? "Client's reason" : 'Revision reason'}: {quotation.rejectionReason}</p>
      )}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

      {/* The quotation itself, so nothing needs a second screen. */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {quotation.sections.map(section => (
          <div key={section.id}>
            <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{section.title}</span>
              <span className="text-xs font-semibold text-slate-600">{fmtCurrency(section.items.reduce((sum, i) => sum + i.amount, 0))}</span>
            </div>
            {section.items.map(item => (
              <div key={item.id} className="px-3.5 py-2 border-t border-slate-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{item.description}</p>
                  <p className="text-[11px] text-slate-400">{item.quantity} {item.unit} × {fmtCurrency(item.rate)}{item.taxPercent ? ` · ${item.taxPercent}% tax` : ''}</p>
                </div>
                <span className="text-xs font-bold text-slate-800 shrink-0">{fmtCurrency(item.amount)}</span>
              </div>
            ))}
            {section.notes && <p className="px-3.5 py-2 border-t border-slate-100 text-[11px] text-slate-500">Notes: {section.notes}</p>}
          </div>
        ))}
        <div className="px-3.5 py-2.5 border-t border-slate-200 bg-slate-50 space-y-1">
          {quotation.discountAmount > 0 && (
            <div className="flex justify-between text-xs"><span className="text-slate-500">Discount</span><span className="font-semibold text-slate-700">-{fmtCurrency(quotation.discountAmount)}</span></div>
          )}
          <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(quotation.taxAmount)}</span></div>
          {!!quotation.transportCost && (
            <div className="flex justify-between text-xs"><span className="text-slate-500">Transport</span><span className="font-semibold text-slate-700">{fmtCurrency(quotation.transportCost)}</span></div>
          )}
          <div className="flex justify-between text-sm pt-1 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(quotation.netAmount)}</span></div>
        </div>
      </div>

      <QuotationPdfActions quotation={quotation} clientName={lead.name} canEdit={canPc} onChanged={onChanged} />

      {/* Created quotation: the PC sends it to the MD for approval. */}
      {quotation.status === 'draft' && canPc && (
        <button disabled={saving} onClick={() => act('internal_review', undefined, 'Sent to MD for approval')}
          className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
          Send to MD for Approval
        </button>
      )}

      {quotation.status === 'pending_pc_review' && canPc && !showReject && (
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => act('internal_review', undefined, 'PC approved — sent to MD for approval')}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 active:bg-emerald-700 disabled:opacity-50">
            PC Approve
          </button>
          <button disabled={saving} onClick={() => setShowReject(true)}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 active:bg-red-700 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}

      {quotation.status === 'internal_review' && canMd && !showReject && (
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => act('internally_approved')}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 active:bg-emerald-700 disabled:opacity-50">
            MD Approve
          </button>
          <button disabled={saving} onClick={() => setShowReject(true)}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 active:bg-red-700 disabled:opacity-50">
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

      {/* PC sends the approved quotation to the client (nothing is actually emailed/WhatsApped — it records the send). */}
      {quotation.status === 'internally_approved' && canSendClient && (
        <button disabled={saving} onClick={() => act('sent_to_client', undefined, 'Quotation sent to client')}
          className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
          Send to Client
        </button>
      )}

      {/* Sent to the client: record their decision. Rejected needs a reason (below). */}
      {quotation.status === 'sent_to_client' && (canSendClient || canMd) && !showReject && (
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => act('client_approved', undefined, 'Client approved')}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 active:bg-emerald-700 disabled:opacity-50">
            Client Approved
          </button>
          <button disabled={saving} onClick={() => { setClientReject(true); setShowReject(true) }}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 active:bg-red-700 disabled:opacity-50">
            Client Rejected
          </button>
        </div>
      )}

      {/* Client rejected: the PC edits the quotation and sends it to the MD again (Edit Quotation is on the sheet). */}
      {quotation.status === 'revision_requested' && (
        <p className="text-xs text-slate-500">The client rejected this quotation. Edit it, then send it to the MD for approval again.</p>
      )}

      {/* Payment stage: the PC records the client's advance payment, then the lead can be converted to a project. */}
      {quotation.status === 'client_approved' && !quotation.advancePaymentReceived && (canSendClient || canMd) && !showAdvanceForm && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Client approved. Record the advance payment to create the project.</p>
          <button disabled={saving} onClick={() => setShowAdvanceForm(true)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            Record Advance Payment
          </button>
        </div>
      )}
      {quotation.status === 'client_approved' && quotation.advancePaymentReceived && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5">
          <p className="text-xs font-bold text-emerald-700">Advance payment received</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {fmtCurrency(quotation.advancePaymentAmount ?? 0)}{quotation.advancePaymentRef ? ` · Ref: ${quotation.advancePaymentRef}` : ''}
          </p>
          <p className="text-[12px] text-emerald-600 mt-1">Ready to create the project.</p>
        </div>
      )}
      {showAdvanceForm && (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Advance Amount Received *</label>
            <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="₹"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Reference (optional)</label>
            <input value={advanceRef} onChange={e => setAdvanceRef(e.target.value)} placeholder="UTR / cheque no."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <button disabled={saving} onClick={handleRecordAdvancePayment}
            className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            Save Advance Payment
          </button>
          <button onClick={() => { setShowAdvanceForm(false); setAdvanceAmount(''); setAdvanceRef(''); setError('') }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600">
            Back
          </button>
        </div>
      )}

      {showReject && (
        <div className="space-y-2">
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder={clientReject ? "Why did the client reject it?" : "Reason for rejection"}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <button disabled={!rejectReason.trim() || saving}
            onClick={() => clientReject
              ? act('revision_requested', rejectReason.trim(), 'Client rejected the quotation')
              : act(quotation.status === 'pending_pc_review' ? 'pc_rejected' : 'md_rejected', rejectReason.trim(),
                  quotation.status === 'pending_pc_review' ? 'PC rejected' : 'MD rejected')}
            className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            {clientReject ? 'Confirm — Client Rejected' : 'Confirm Reject'}
          </button>
          <button onClick={() => { setShowReject(false); setClientReject(false); setRejectReason('') }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600">
            Back
          </button>
        </div>
      )}

      {onReview && (
        <button onClick={onReview} className="w-full py-2.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 active:bg-slate-50">
          Open full Quotation →
        </button>
      )}
    </div>
  )
}
