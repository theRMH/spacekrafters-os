import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { hasRole } from '../../utils/permissions'
import { sendNotification } from '../../utils/notifications'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { MdOverrideCard } from '../../components/forms/MdOverrideCard'
import { getAllMRFs, upsertMRF } from '../../services/mrfService'
import { getManagedUsersDirectory } from '../../services/userService'
import { PROCUREMENT_STATUS_OPTIONS } from '../../data/procurementStatuses'
import { deleteRemoteFile } from '../../utils/fileStorage'
import type { Lead, MaterialRequestForm, MRFStatus, MRFVendor, StatusHistoryItem, ProcurementStatusHistoryItem } from '../../types'

// Same MRF workflow everywhere it's used (the standalone /mrf screen and a
// project's MRF tab) — Project raises (optionally seeding Details/Notes) ->
// QS fills/updates Details, Notes, Requesting Date & Expected Delivery Date
// -> the project's Lead Owner approves/rejects (Reject sends it back to QS
// with the reason, for them to revise and resubmit) -> Procurement receives
// the completed MRF (adds vendors/files) -> Accounts releases the payment.
export const MRF_STATUS_LABEL: Record<MRFStatus, string> = {
  pending_qs:                   'Pending QS',
  pending_coordinator_approval: 'Pending Approval',
  pending_procurement:          'Sent to Procurement',
  rejected:                     'Rejected',
  paid:                         'Accounts Released / Paid',
}

export function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

// The project's Lead Owner (LO) — the person who approves/rejects an MRF
// once QS submits it, and the payment-release notification/Account Details
// audience.
export function resolveLeadOwner(leadId: string | undefined, leads: Lead[]): { id?: string; name?: string } {
  const lead = leadId ? leads.find(l => l.id === leadId) : undefined
  return { id: lead?.ownerId, name: lead?.ownerName }
}

// Reads mrf.vendors, or — for a record saved before files were linked to a
// specific vendor — synthesizes it from the old flat vendorNames/files (the
// one shared file list goes under the first vendor, since there's no way to
// know which vendor it originally belonged to). Read-only: the record isn't
// rewritten until the user actually changes a vendor or its files, at which
// point it's saved in the new shape and the legacy fields are dropped.
export function migrateMrfVendors(mrf: MaterialRequestForm): MRFVendor[] {
  if (mrf.vendors) return mrf.vendors
  const names = mrf.vendorNames ?? []
  if (names.length === 0) return []
  return names.map((name, i) => ({ id: `legacy-${i}`, name, files: i === 0 ? (mrf.files ?? []) : [] }))
}

export function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Folds whichever notes were entered for a step into that step's history
// line, so they stay attached to that exact point in time (not just the
// MRF's current state, which only shows the latest value of each field).
export function noteWithExtras(base: string, extras: { label: string; value: string }[]): string {
  const parts = extras.filter(e => e.value.trim()).map(e => `${e.label}: ${e.value.trim()}`)
  return parts.length > 0 ? `${base} — ${parts.join(' · ')}` : base
}

// Notifies the project's Lead Owner (the one who approves/rejects — see
// canApprove below) that an MRF is waiting on them. Falls back to broadcasting
// to every owner/project_coordinator if no Lead Owner is resolved (e.g. the
// project has no linked lead), so a submission is never silently unnotified.
async function notifyApprovers(mrf: MaterialRequestForm, projectName: string, submittedBy: string, leadOwnerId: string | undefined) {
  const dir = await getManagedUsersDirectory()
  const recipientIds = leadOwnerId
    ? [leadOwnerId]
    : dir.filter(u => hasRole(u, 'owner') || hasRole(u, 'project_coordinator')).map(u => u.id)
  const parts = [
    `Project: ${projectName}`,
    mrf.materialDetails ? `Details: ${mrf.materialDetails}` : null,
    `Requested by: ${submittedBy}`,
    mrf.requestingDate ? `Requesting: ${fmtDate(mrf.requestingDate)}` : null,
    mrf.expectedDeliveryDate ? `Delivery: ${fmtDate(mrf.expectedDeliveryDate)}` : null,
    mrf.notes ? `Notes: ${mrf.notes}` : null,
  ].filter(Boolean)
  await sendNotification(recipientIds, 'MRF Pending Approval', parts.join(' · '), '/mrf')
}

// Notifies everyone who can act as QS that a new MRF has been raised and is
// waiting for them to fill in material details/dates — the step this whole
// flow starts with, so this is the very first notification an MRF ever sends.
export async function notifyQsNewMrf(mrf: MaterialRequestForm, projectName: string, raisedBy: string) {
  const dir = await getManagedUsersDirectory()
  const recipientIds = dir.filter(u => hasRole(u, 'qs') || hasRole(u, 'owner')).map(u => u.id)
  const parts = [`Project: ${projectName}`, `Raised by: ${raisedBy}`, mrf.materialDetails ? `Details: ${mrf.materialDetails}` : null, mrf.notes ? `Notes: ${mrf.notes}` : null].filter(Boolean)
  await sendNotification(recipientIds, 'New MRF — Pending QS', parts.join(' · '), '/mrf')
}

// Notifies everyone who can act as QS (the role that fills in/revises an MRF)
// that the Lead Owner rejected it and it needs rework.
async function notifyRejection(mrf: MaterialRequestForm, projectName: string, rejectedBy: string, reason: string) {
  const dir = await getManagedUsersDirectory()
  const recipientIds = dir.filter(u => hasRole(u, 'qs') || hasRole(u, 'owner')).map(u => u.id)
  const parts = [`Project: ${projectName}`, `Rejected by: ${rejectedBy}`, reason ? `Reason: ${reason}` : null].filter(Boolean)
  await sendNotification(recipientIds, 'MRF Rejected — Needs Rework', parts.join(' · '), '/mrf')
}

// QS, the project's Lead Owner, MD (owner) and the Procurement Team (purchase
// role) all get notified once Accounts releases the payment.
async function notifyPaymentReleased(mrf: MaterialRequestForm, projectName: string, leadOwnerId: string | undefined) {
  const dir = await getManagedUsersDirectory()
  const recipientIds = new Set(dir.filter(u => hasRole(u, 'owner') || hasRole(u, 'qs') || hasRole(u, 'purchase')).map(u => u.id))
  if (leadOwnerId) recipientIds.add(leadOwnerId)
  const parts = [
    `Project: ${projectName}`,
    'Payment Status: Accounts Released / Paid',
    mrf.releasedAmount != null ? `Amount: ${fmtCurrency(mrf.releasedAmount)}` : null,
    mrf.releaseDate ? `Release Date: ${fmtDate(mrf.releaseDate)}` : null,
  ].filter(Boolean)
  await sendNotification([...recipientIds], 'MRF Payment Released', parts.join(' · '), '/mrf')
}

// The full status-driven MRF detail: summary, QS's fill-in form, the Project
// Coordinator's approve/reject step, Procurement's execution-status tracking,
// and the history log. Shared by the standalone /mrf screen's detail sheet
// and a project's MRF tab, so the workflow only lives in one place.
export function MRFDetailBody({ mrf, projectName, leadId, onSaved, notify }: {
  mrf: MaterialRequestForm
  projectName: string
  leadId?: string
  onSaved: (updated: MaterialRequestForm) => void
  notify: (msg: string, type: 'success' | 'error') => void
}) {
  const { user, can } = useAuth()
  const { leads } = useCRM()
  const leadOwner = resolveLeadOwner(leadId, leads)

  const [materialDetails, setMaterialDetails] = useState(mrf.materialDetails ?? '')
  const [notes, setNotes] = useState(mrf.notes ?? '')
  const [additionalNotes, setAdditionalNotes] = useState(mrf.additionalNotes ?? '')
  const [requestingDate, setRequestingDate] = useState(mrf.requestingDate ?? '')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(mrf.expectedDeliveryDate ?? '')
  const [approvalNotes, setApprovalNotes] = useState('')
  const [showProcurementStatus, setShowProcurementStatus] = useState(false)
  const [newProcurementStatus, setNewProcurementStatus] = useState('')
  const [procurementIsDelay, setProcurementIsDelay] = useState(false)
  const [procurementNotes, setProcurementNotes] = useState('')
  const [newVendor, setNewVendor] = useState('')
  const [releasedAmount, setReleasedAmount] = useState(mrf.releasedAmount != null ? String(mrf.releasedAmount) : '')
  const [releaseDate, setReleaseDate] = useState(mrf.releaseDate ?? '')
  const [paymentReference, setPaymentReference] = useState(mrf.paymentReference ?? '')
  const [accountsNotes, setAccountsNotes] = useState(mrf.accountsNotes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [showMdEdit, setShowMdEdit] = useState(false)
  // A ref, not state: state updates aren't visible to a second click handler
  // that fires before React re-renders (e.g. a fast double-click), so the
  // actual guard has to be synchronous. isSaving above only drives the
  // disabled styling.
  const savingRef = useRef(false)

  // Re-seed the edit fields whenever a different MRF is opened.
  useEffect(() => {
    setMaterialDetails(mrf.materialDetails ?? '')
    setNotes(mrf.notes ?? '')
    setAdditionalNotes(mrf.additionalNotes ?? '')
    setRequestingDate(mrf.requestingDate ?? '')
    setExpectedDeliveryDate(mrf.expectedDeliveryDate ?? '')
    setApprovalNotes('')
    setReleasedAmount(mrf.releasedAmount != null ? String(mrf.releasedAmount) : '')
    setReleaseDate(mrf.releaseDate ?? '')
    setPaymentReference(mrf.paymentReference ?? '')
    setAccountsNotes(mrf.accountsNotes ?? '')
  }, [mrf.id])

  async function saveTransition(status: MRFStatus, note: string, extra?: Partial<MaterialRequestForm>): Promise<MaterialRequestForm | null> {
    if (!user || savingRef.current) return null
    savingRef.current = true
    setIsSaving(true)
    const historyEntry: StatusHistoryItem = { stage: status, note, updatedBy: user.name, updatedRole: user.role, updatedAt: new Date().toISOString() }
    const updated: MaterialRequestForm = {
      ...mrf, status,
      history: [...mrf.history, historyEntry],
      updatedAt: new Date().toISOString(),
      ...extra,
    }
    const result = await upsertMRF(updated)
    savingRef.current = false
    setIsSaving(false)
    if (!result.ok) { notify(result.error ?? 'Could not update MRF.', 'error'); return null }
    onSaved(updated)
    notify('MRF updated.', 'success')
    return updated
  }

  // Vendors and files are supplementary data Procurement adds over time, not
  // a workflow transition — saved immediately on every change, no status/
  // history entry (same convention as procurementStatusHistory's own log).
  async function persistFields(patch: Partial<MaterialRequestForm>) {
    const updated: MaterialRequestForm = { ...mrf, ...patch, updatedAt: new Date().toISOString() }
    const result = await upsertMRF(updated)
    if (!result.ok) { notify(result.error ?? 'Could not save.', 'error'); return }
    onSaved(updated)
  }

  const vendors = migrateMrfVendors(mrf)

  async function handleAddVendor() {
    if (!newVendor.trim()) return
    const entry: MRFVendor = { id: `vendor_${Date.now()}`, name: newVendor.trim(), files: [] }
    // vendors (not vendorNames/files) from here on — this save also completes
    // the migration for a legacy record the first time anyone touches it.
    await persistFields({ vendors: [...vendors, entry], vendorNames: undefined, files: undefined })
    setNewVendor('')
  }

  // Removing a vendor deletes only that vendor's own files — every other
  // vendor's `files` array is untouched, so there's no way for this to reach
  // another vendor's uploads.
  async function handleRemoveVendor(vendorId: string) {
    const target = vendors.find(v => v.id === vendorId)
    if (target) await Promise.all(target.files.map(f => deleteRemoteFile(f)))
    await persistFields({ vendors: vendors.filter(v => v.id !== vendorId), vendorNames: undefined, files: undefined })
  }

  async function handleVendorFilesChange(vendorId: string, files: string[]) {
    await persistFields({
      vendors: vendors.map(v => (v.id === vendorId ? { ...v, files } : v)),
      vendorNames: undefined, files: undefined,
    })
  }

  // Used both for the first submission (pending_qs) and for resubmitting
  // after the Lead Owner rejects it (rejected) — same target stage either way.
  async function handleQsSubmit() {
    if (!materialDetails.trim() || !requestingDate || !expectedDeliveryDate) {
      notify('Enter the material/request details, Requesting Date, and Expected Delivery Date.', 'error')
      return
    }
    const historyNote = noteWithExtras(
      mrf.status === 'rejected' ? 'QS revised and resubmitted for approval' : 'QS submitted details and dates for approval',
      [{ label: 'Notes', value: notes }, { label: 'Additional Notes', value: additionalNotes }],
    )
    const updated = await saveTransition('pending_coordinator_approval', historyNote, {
      materialDetails: materialDetails.trim(), notes: notes.trim() || undefined,
      additionalNotes: additionalNotes.trim() || undefined, requestingDate, expectedDeliveryDate,
    })
    if (updated && user) notifyApprovers(updated, projectName, user.name, leadOwner.id)
  }

  async function handleLeadOwnerDecision(approved: boolean) {
    const base = approved ? 'Lead Owner approved — sent to Procurement' : 'Lead Owner rejected — returned to QS'
    const updated = await saveTransition(
      approved ? 'pending_procurement' : 'rejected',
      noteWithExtras(base, [{ label: approved ? 'Notes' : 'Rejection Reason', value: approvalNotes }]),
      { approvalNotes: approvalNotes.trim() || undefined },
    )
    if (updated && !approved && user) notifyRejection(updated, projectName, user.name, approvalNotes.trim())
  }

  async function handleReleasePayment() {
    const amount = Number(releasedAmount)
    if (!releasedAmount.trim() || isNaN(amount) || amount <= 0 || !releaseDate) {
      notify('Enter a valid Released Amount and Release Date.', 'error')
      return
    }
    const historyNote = noteWithExtras('Accounts released the payment', [
      { label: 'Reference', value: paymentReference },
      { label: 'Notes', value: accountsNotes },
    ])
    const updated = await saveTransition('paid', historyNote, {
      releasedAmount: amount, releaseDate,
      paymentReference: paymentReference.trim() || undefined,
      accountsNotes: accountsNotes.trim() || undefined,
    })
    if (updated) notifyPaymentReleased(updated, projectName, leadOwner.id)
  }

  async function handleUpdateProcurementStatus() {
    if (!user || savingRef.current) return
    if (!newProcurementStatus) { notify('Select a status.', 'error'); return }
    if (procurementIsDelay && !procurementNotes.trim()) { notify('Enter the reason/details for the delay.', 'error'); return }
    savingRef.current = true
    setIsSaving(true)
    const entry: ProcurementStatusHistoryItem = {
      status: newProcurementStatus, isDelay: procurementIsDelay, notes: procurementNotes.trim() || undefined,
      updatedBy: user.name, updatedAt: new Date().toISOString(),
    }
    const updated: MaterialRequestForm = {
      ...mrf,
      procurementStatus: newProcurementStatus,
      procurementStatusHistory: [...(mrf.procurementStatusHistory ?? []), entry],
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertMRF(updated)
    savingRef.current = false
    setIsSaving(false)
    if (!result.ok) { notify(result.error ?? 'Could not update procurement status.', 'error'); return }
    onSaved(updated)
    setShowProcurementStatus(false)
    setNewProcurementStatus(''); setProcurementIsDelay(false); setProcurementNotes('')
    notify('Procurement status updated.', 'success')
  }

  // The project's actual Lead Owner approves/rejects — owner can always act
  // on their behalf, same convention as LeadStatusSheet/ProjectStatusSheet.
  // approve_mrf still gates it (granted to every role that can ever be a Lead
  // Owner — project_coordinator/qs/designer — see ASSIGNABLE_LEAD_OWNER_ROLES
  // in LeadsScreen.tsx), narrowed further to the specific person.
  const isLoOrMd = user?.role === 'owner' || (!!leadOwner.id && user?.id === leadOwner.id)
  const canApprove = isLoOrMd && (user?.role === 'owner' || can('approve_mrf'))

  return (
    <div className="space-y-4">
      <StatusBadge status={mrf.status} label={MRF_STATUS_LABEL[mrf.status]} size="sm" />

      <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2">
        {mrf.materialDetails && (
          <div><span className="text-xs text-slate-400 block mb-0.5">Material / Request Details</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.materialDetails}</p></div>
        )}
        {mrf.notes && (
          <div><span className="text-xs text-slate-400 block mb-0.5">Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.notes}</p></div>
        )}
        {mrf.additionalNotes && (
          <div><span className="text-xs text-slate-400 block mb-0.5">Additional Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.additionalNotes}</p></div>
        )}
        {mrf.requestingDate && (
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Requesting Date</span><span className="text-xs font-semibold text-slate-700">{fmtDate(mrf.requestingDate)}</span></div>
        )}
        {mrf.expectedDeliveryDate && (
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Expected Delivery</span><span className="text-xs font-semibold text-slate-700">{fmtDate(mrf.expectedDeliveryDate)}</span></div>
        )}
        {mrf.approvalNotes && mrf.status !== 'rejected' && (
          <div><span className="text-xs text-slate-400 block mb-0.5">Approval Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.approvalNotes}</p></div>
        )}
        {!mrf.materialDetails && !mrf.notes && !mrf.additionalNotes && (
          <p className="text-xs text-slate-400">No details entered yet.</p>
        )}
      </div>

      {/* Account Details — LO / MD only */}
      {isLoOrMd && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5 space-y-2">
          <p className="text-[12px] font-bold text-amber-700 uppercase tracking-wider">Account Details</p>
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-500">Payment Status</span><span className="text-xs font-semibold text-slate-700">{mrf.status === 'paid' ? 'Released / Paid' : 'Pending'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-500">Released Amount</span><span className="text-xs font-semibold text-slate-700">{fmtCurrency(mrf.releasedAmount)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-500">Release Date</span><span className="text-xs font-semibold text-slate-700">{fmtDate(mrf.releaseDate)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-500">Vendor(s)</span><span className="text-xs font-semibold text-slate-700 text-right">{vendors.length > 0 ? vendors.map(v => v.name).join(', ') : '—'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-xs text-slate-500">MRF / Payment Reference</span><span className="text-xs font-semibold text-slate-700">{mrf.paymentReference || mrf.id}</span></div>
          {mrf.accountsNotes && (
            <div><span className="text-xs text-slate-500 block mb-0.5">Accounts Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.accountsNotes}</p></div>
          )}
        </div>
      )}

      {/* Rejected — sent back to QS with the reason, for them to revise and resubmit */}
      {mrf.status === 'rejected' && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3.5 space-y-1">
          <p className="text-[12px] font-bold text-red-700 uppercase tracking-wider">Rejected by Lead Owner</p>
          <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{mrf.approvalNotes || 'No reason given.'}</p>
        </div>
      )}

      {/* QS: draft material details, notes and both dates — same form for the
          first submission (pending_qs) and for revising after a rejection. */}
      {(mrf.status === 'pending_qs' || mrf.status === 'rejected') && can('submit_mrf') && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 block">Material / Request Details *</label>
          <textarea value={materialDetails} onChange={e => setMaterialDetails(e.target.value)} rows={4}
            placeholder="List the materials/items required…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <label className="text-xs font-semibold text-slate-500 block">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Optional notes"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Requesting Date *</label>
            <DateField value={requestingDate} min={todayStr()} onChange={setRequestingDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Expected Delivery Date *</label>
            <DateField value={expectedDeliveryDate} min={requestingDate || todayStr()} onChange={setExpectedDeliveryDate} />
          </div>
          <label className="text-xs font-semibold text-slate-500 block">Additional Notes</label>
          <textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={3}
            placeholder="Anything else Procurement should know"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <button onClick={handleQsSubmit} disabled={isSaving} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#0F2A4A' }}>
            {mrf.status === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
          </button>
        </div>
      )}
      {mrf.status === 'rejected' && !can('submit_mrf') && (
        <p className="text-xs text-slate-400 text-center py-4">Waiting on QS to revise and resubmit.</p>
      )}

      {/* Lead Owner: approve/reject */}
      {mrf.status === 'pending_coordinator_approval' && canApprove && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 block">Notes</label>
          <textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} rows={3}
            placeholder="Comments / approval notes"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => handleLeadOwnerDecision(true)} disabled={isSaving} className="flex-1 py-3 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#059669' }}>
              Approve
            </button>
            <button onClick={() => handleLeadOwnerDecision(false)} disabled={isSaving} className="flex-1 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold active:bg-red-100 disabled:opacity-60">
              Reject
            </button>
          </div>
        </div>
      )}
      {mrf.status === 'pending_coordinator_approval' && !canApprove && (
        <p className="text-xs text-slate-400 text-center py-4">Waiting on {leadOwner.name ?? 'the Lead Owner'} to approve or reject.</p>
      )}

      {/* Procurement: vendors, each with its own separate file uploads — not
          restricted to one vendor, and each vendor's files never mix with another's.
          Stays visible (read-only) once paid, instead of disappearing — the
          Procurement tab needs this as a permanent record, not just while pending. */}
      {(mrf.status === 'pending_procurement' || mrf.status === 'paid') && (
        <div className="space-y-3">
          <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Vendors</p>
          {vendors.length === 0 && (
            <p className="text-xs text-slate-400">No vendors added yet.</p>
          )}
          {vendors.map(v => (
            <div key={v.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-bold text-slate-800">{v.name}</span>
                {mrf.status === 'pending_procurement' && (
                  <PermissionGate permission="set_mrf_dates">
                    <button type="button" onClick={() => handleRemoveVendor(v.id)} aria-label={`Remove ${v.name}`}
                      className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 active:bg-red-100">
                      <X size={11} className="text-red-500" />
                    </button>
                  </PermissionGate>
                )}
              </div>
              <MultiFileUploadField label="" files={v.files}
                onChange={files => handleVendorFilesChange(v.id, files)}
                readOnly={!can('set_mrf_dates') || mrf.status !== 'pending_procurement'} uploadButtonLabel={`Upload File(s) for ${v.name}`} />
            </div>
          ))}
          {mrf.status === 'pending_procurement' && (
            <PermissionGate permission="set_mrf_dates">
              <div className="flex gap-2">
                <input value={newVendor} onChange={e => setNewVendor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddVendor() } }}
                  placeholder="Vendor name"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <button onClick={handleAddVendor} className="px-4 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
                  Add
                </button>
              </div>
            </PermissionGate>
          )}
        </div>
      )}

      {/* Procurement status — execution tracking once the MRF reaches Procurement,
          stays visible after payment too (permanent record). */}
      {(mrf.status === 'pending_procurement' || mrf.status === 'paid') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Procurement Status</p>
            <PermissionGate permission="set_mrf_dates">
              <button onClick={() => setShowProcurementStatus(true)} className="text-xs font-semibold text-indigo-600">
                Update
              </button>
            </PermissionGate>
          </div>
          {mrf.procurementStatus ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-3.5">
              <StatusBadge status={mrf.procurementStatus} label={mrf.procurementStatus} size="xs" />
              {mrf.procurementStatusHistory && mrf.procurementStatusHistory.length > 0 && (() => {
                const latest = mrf.procurementStatusHistory[mrf.procurementStatusHistory.length - 1]
                return latest.isDelay && latest.notes ? (
                  <p className="text-xs text-amber-700 mt-2"><span className="font-bold">Delay:</span> {latest.notes}</p>
                ) : null
              })()}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No procurement status recorded yet.</p>
          )}
          {mrf.procurementStatusHistory && mrf.procurementStatusHistory.length > 0 && (
            <div className="space-y-2 mt-2">
              {[...mrf.procurementStatusHistory].reverse().map((h, i) => (
                <div key={i} className="flex gap-2.5">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: h.isDelay ? '#d97706' : '#0F2A4A' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{h.status}{h.isDelay ? ' (Delay)' : ''}</p>
                    {h.notes && <p className="text-[12px] text-slate-500">{h.notes}</p>}
                    <p className="text-[12px] text-slate-400">{h.updatedBy} · {fmtDateTime(h.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accounts: release the payment */}
      {mrf.status === 'pending_procurement' && can('release_mrf_payment') && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Release Payment</p>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Released Amount (₹) *</label>
            <input type="number" min="0" value={releasedAmount} onChange={e => setReleasedAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Release Date *</label>
            <DateField value={releaseDate} min={todayStr()} onChange={setReleaseDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Payment Reference</label>
            <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
              placeholder="Transaction / UTR / cheque number"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <label className="text-xs font-semibold text-slate-500 block">Notes</label>
          <textarea value={accountsNotes} onChange={e => setAccountsNotes(e.target.value)} rows={3}
            placeholder="Optional notes"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <button onClick={handleReleasePayment} disabled={isSaving} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#059669' }}>
            Release Payment
          </button>
        </div>
      )}

      {/* MD: edit the request details at any stage (before approval the form above already covers this), and override the status. */}
      {user?.role === 'owner' && mrf.status !== 'pending_qs' && mrf.status !== 'rejected' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-600">Edit MRF details (MD)</p>
            <button type="button" onClick={() => setShowMdEdit(s => !s)} className="text-xs font-bold text-indigo-600 shrink-0">
              {showMdEdit ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {showMdEdit && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 block">Material / Request Details</label>
              <textarea value={materialDetails} onChange={e => setMaterialDetails(e.target.value)} rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              <label className="text-xs font-semibold text-slate-500 block">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              <label className="text-xs font-semibold text-slate-500 block">Requesting Date</label>
              <DateField value={requestingDate} onChange={setRequestingDate} />
              <label className="text-xs font-semibold text-slate-500 block">Expected Delivery Date</label>
              <DateField value={expectedDeliveryDate} onChange={setExpectedDeliveryDate} />
              <label className="text-xs font-semibold text-slate-500 block">Additional Notes</label>
              <textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              <button disabled={isSaving || !materialDetails.trim()} onClick={async () => {
                const saved = await saveTransition(mrf.status, 'MD edited MRF details', {
                  materialDetails: materialDetails.trim(), notes: notes.trim() || undefined, additionalNotes: additionalNotes.trim() || undefined,
                  requestingDate: requestingDate || undefined, expectedDeliveryDate: expectedDeliveryDate || undefined,
                })
                if (saved) setShowMdEdit(false)
              }} className="w-full py-2.5 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
                Save changes
              </button>
            </div>
          )}
        </div>
      )}

      {user?.role === 'owner' && (
        <MdOverrideCard noun="status" title="MRF status" saving={isSaving}
          options={(Object.keys(MRF_STATUS_LABEL) as MRFStatus[]).filter(s => s !== mrf.status).map(s => ({ value: s, label: MRF_STATUS_LABEL[s] }))}
          onApply={async (v, reason) => { await saveTransition(v as MRFStatus, `MD override: ${MRF_STATUS_LABEL[mrf.status]} → ${MRF_STATUS_LABEL[v as MRFStatus]} — ${reason}`) }} />
      )}

      <div>
        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">History</p>
        <div className="space-y-2.5">
          {[...mrf.history].reverse().map((h, i) => (
            <div key={i} className="flex gap-2.5">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#0F2A4A' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">{h.note}</p>
                <p className="text-[12px] text-slate-400">{h.updatedBy} · {fmtDateTime(h.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Update Procurement Status */}
      <BottomSheet isOpen={showProcurementStatus} onClose={() => setShowProcurementStatus(false)} title="Update Procurement Status">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Status *</label>
            <SearchableSelect
              value={newProcurementStatus} onChange={setNewProcurementStatus}
              options={PROCUREMENT_STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
              placeholder="Select a status…"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={procurementIsDelay} onChange={e => setProcurementIsDelay(e.target.checked)}
              className="w-4 h-4 accent-amber-600" />
            <span className="text-xs font-semibold text-slate-700">This update reports a delay</span>
          </label>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Notes {procurementIsDelay && <span className="text-red-500">* (required for delays)</span>}
            </label>
            <textarea value={procurementNotes} onChange={e => setProcurementNotes(e.target.value)} rows={3}
              placeholder={procurementIsDelay ? 'Reason/details for the delay' : 'Optional notes'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleUpdateProcurementStatus} disabled={isSaving} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#0F2A4A' }}>
            Save Status
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

// Project-scoped MRF list + create form, embedded directly in a project's
// MRF tab. Reuses MRFDetailBody for the detail/workflow view.
export function MRFPanel({ projectId, projectName, leadId }: { projectId: string; projectName: string; leadId?: string }) {
  const { user } = useAuth()

  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<MaterialRequestForm | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [formError, setFormError] = useState('')
  const [materialDetails, setMaterialDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false) // synchronous guard — see MRFDetailBody's savingRef
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const all = await getAllMRFs()
      if (cancelled) return
      setMrfs(all.filter(m => m.projectId === projectId))
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  function openNew() {
    setMaterialDetails(''); setNotes(''); setFormError('')
    setShowNew(true)
  }

  async function handleCreate() {
    if (!user || creatingRef.current) return
    creatingRef.current = true
    setIsCreating(true)
    const now = new Date().toISOString()
    const history: StatusHistoryItem = {
      stage: 'pending_qs', note: noteWithExtras('Raised, sent to QS', [{ label: 'Notes', value: notes }]),
      updatedBy: user.name, updatedRole: user.role, updatedAt: now,
    }
    const mrf: MaterialRequestForm = {
      id: `mrf_${Date.now()}`,
      projectId,
      status: 'pending_qs',
      materialDetails: materialDetails.trim() || undefined,
      notes: notes.trim() || undefined,
      history: [history],
      createdBy: user.name,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertMRF(mrf)
    creatingRef.current = false
    setIsCreating(false)
    if (!result.ok) { setFormError(result.error ?? 'Could not create MRF.'); return }
    setMrfs(prev => [mrf, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Sent to QS for MRF.', type: 'success' })
    notifyQsNewMrf(mrf, projectName, user.name)
  }

  function handleSaved(updated: MaterialRequestForm) {
    setMrfs(prev => prev.map(m => (m.id === updated.id ? updated : m)))
    setSelected(updated)
  }

  return (
    <PermissionGate permission="view_mrf" fallback={<p className="text-sm text-slate-400 text-center py-16">You don't have access to MRFs.</p>}>
      <div className="space-y-2.5">
        <PermissionGate permission="create_mrf">
          <button onClick={openNew}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-semibold active:bg-slate-50 flex items-center justify-center gap-1">
            <Plus size={14} /> New MRF
          </button>
        </PermissionGate>

        {!isLoading && mrfs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">No MRFs raised for this project yet.</p>
        )}

        {mrfs.map(mrf => (
          <button key={mrf.id} onClick={() => setSelected(mrf)}
            className="w-full text-left bg-white rounded-2xl shadow-md border border-slate-200 p-4 active:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{fmtDate(mrf.createdAt)}</p>
                {mrf.requestingDate && (
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    Req: {fmtDate(mrf.requestingDate)} · Delivery: {fmtDate(mrf.expectedDeliveryDate)}
                  </p>
                )}
              </div>
              <StatusBadge status={mrf.status} label={MRF_STATUS_LABEL[mrf.status]} size="xs" />
            </div>
          </button>
        ))}
      </div>

      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title="MRF" height="full">
        {selected && (
          <MRFDetailBody mrf={selected} projectName={projectName} leadId={leadId} onSaved={handleSaved}
            notify={(msg, type) => setSnack({ open: true, msg, type })} />
        )}
      </BottomSheet>

      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="New MRF">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Material / Request Details</label>
            <textarea value={materialDetails} onChange={e => setMaterialDetails(e.target.value)} rows={4}
              placeholder="List the materials/items required… (QS can also fill this in)"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Optional notes"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleCreate} disabled={isCreating} className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#C9A24B' }}>
            Send to QS
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </PermissionGate>
  )
}

// Project-scoped Procurement tab: the MRFs that have actually reached
// Procurement for this project (status 'pending_procurement' or 'paid') —
// raised-but-not-yet-approved MRFs don't show up here, only the MRF tab. Reads
// the same sks_mrfs records as the MRF tab (no separate data/table), and
// reuses MRFDetailBody for the full detail view, so nothing about the MRF
// workflow or the Accounts payment-release flow is duplicated or changed here.
export function ProjectProcurementPanel({ projectId, projectName, leadId }: { projectId: string; projectName: string; leadId?: string }) {
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<MaterialRequestForm | null>(null)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const all = await getAllMRFs()
      if (cancelled) return
      setMrfs(all
        .filter(m => m.projectId === projectId && (m.status === 'pending_procurement' || m.status === 'paid'))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  function handleSaved(updated: MaterialRequestForm) {
    setMrfs(prev => {
      const stillHere = updated.status === 'pending_procurement' || updated.status === 'paid'
      if (!stillHere) return prev.filter(m => m.id !== updated.id)
      return prev.some(m => m.id === updated.id) ? prev.map(m => (m.id === updated.id ? updated : m)) : [updated, ...prev]
    })
    setSelected(updated)
  }

  return (
    <PermissionGate permission="view_mrf" fallback={<p className="text-sm text-slate-400 text-center py-16">You don't have access to Procurement.</p>}>
      <div className="space-y-2.5">
        {!isLoading && mrfs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">No MRFs have reached Procurement yet.</p>
        )}

        {mrfs.map(mrf => (
          <button key={mrf.id} onClick={() => setSelected(mrf)}
            className="w-full text-left bg-white rounded-2xl shadow-md border border-slate-200 p-4 active:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{mrf.materialDetails || 'Untitled MRF'}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">{fmtDate(mrf.createdAt)}</p>
                {(() => {
                  const vendorNames = migrateMrfVendors(mrf).map(v => v.name)
                  return vendorNames.length > 0 && (
                    <p className="text-[12px] text-slate-500 mt-0.5 truncate">Vendor(s): {vendorNames.join(', ')}</p>
                  )
                })()}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={mrf.status} label={MRF_STATUS_LABEL[mrf.status]} size="xs" />
                {mrf.status === 'paid' ? (
                  <span className="text-[12px] font-semibold text-emerald-700">{fmtCurrency(mrf.releasedAmount)} paid</span>
                ) : (
                  <span className="text-[12px] font-semibold text-amber-600">Payment pending</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title="MRF — Procurement" height="full">
        {selected && (
          <MRFDetailBody mrf={selected} projectName={projectName} leadId={leadId} onSaved={handleSaved}
            notify={(msg, type) => setSnack({ open: true, msg, type })} />
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </PermissionGate>
  )
}
