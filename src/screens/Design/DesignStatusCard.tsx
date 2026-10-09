import { useEffect, useState } from 'react'
import { DESIGN_STATUS_LABEL, designWorkflowInfo } from './DesignCenterScreen'
import { changeDesignStatus, buildDesignClientMessage } from './designActions'
import { getAllDesignVersions } from '../../services/designService'
import type { AuthUser, DesignPackage, Lead } from '../../types'

// The compact, Lead-page version of DesignCenterScreen.tsx's own Status
// Actions block — same underlying transition (changeDesignStatus), just a
// smaller renderer so "Update Status" works without leaving the Lead page.
export function DesignStatusCard({ pkg, can, user, lead, updateLead, onChanged, onReview }: {
  pkg: DesignPackage
  can: (p: 'approve_design_pc' | 'approve_design' | 'request_revision') => boolean
  user: AuthUser | null
  lead: Lead
  updateLead: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
  onChanged: (updated: DesignPackage) => void
  onReview: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Only needed for "Send Design to Client" (the latest version's file links
  // go in the WhatsApp/email message) — fetched once rather than threading
  // DesignCenterScreen.tsx's already-loaded `versions` state all the way
  // down through LeadStatusSheet.tsx just for this one card.
  const [latestFileUrls, setLatestFileUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    getAllDesignVersions().then(versions => {
      if (cancelled) return
      const latest = versions.filter(v => v.designPackageId === pkg.id).sort((a, b) => b.versionNumber - a.versionNumber)[0]
      setLatestFileUrls(latest?.files ?? [])
    })
    return () => { cancelled = true }
  }, [pkg.id])

  async function act(status: DesignPackage['status'], note?: string, labelOverride?: string) {
    setSaving(true)
    const result = await changeDesignStatus({
      pkg, status, note, labelOverride, user,
      packageLabel: lead.name, lead, updateLead,
    })
    setSaving(false)
    if (!result.ok || !result.updated) { setError(result.error ?? 'Could not update status.'); return }
    setShowReject(false); setRejectReason(''); setError('')
    onChanged(result.updated)
  }

  // Same behaviour as DesignCenterScreen.tsx's "Send Design to Client" sheet:
  // opens a real WhatsApp/email draft (nothing auto-sent), then records the
  // transition to Sent to Client.
  function handleSendToClient(channel: 'whatsapp' | 'email') {
    const message = buildDesignClientMessage(pkg, lead.name, latestFileUrls)
    if (channel === 'whatsapp') {
      const digits = (lead.phone ?? '').replace(/\D/g, '')
      if (!digits) { setError('No phone number on file for this client.'); return }
      const intlPhone = digits.length === 10 ? `91${digits}` : digits
      window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    } else {
      if (!lead.email) { setError('No email on file for this client.'); return }
      window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent('Your Design from SpaceKrafters')}&body=${encodeURIComponent(message)}`
    }
    act('sent_to_client')
  }

  const canPc = can('approve_design_pc')
  const canMd = can('approve_design')
  const canRequestRevision = can('request_revision')

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Design Status</p>
            <p className="text-sm font-bold text-indigo-900">{DESIGN_STATUS_LABEL[pkg.status]}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
            <p className="text-sm font-bold text-indigo-900">{designWorkflowInfo(pkg.status).responsible}</p>
          </div>
        </div>
        <p className="text-xs text-indigo-700 mt-1.5">Next: {designWorkflowInfo(pkg.status).next}</p>
      </div>

      {pkg.rejectionReason && (pkg.status === 'pc_rejected' || pkg.status === 'md_rejected') && (
        <p className="text-xs text-red-600">Revision reason: {pkg.rejectionReason}</p>
      )}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

      {pkg.status === 'pending_pc_review' && canPc && !showReject && (
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

      {pkg.status === 'internal_review' && canMd && !showReject && (
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

      {pkg.status === 'md_rejected' && canPc && (
        <button disabled={saving} onClick={() => act('internal_review', undefined, 'PC resubmitted to MD')}
          className="w-full py-3 rounded-xl text-sm font-bold border border-blue-200 bg-blue-50 text-blue-700 active:bg-blue-100 disabled:opacity-50">
          Resubmit to MD
        </button>
      )}

      {pkg.status === 'internally_approved' && canMd && (
        <div className="grid grid-cols-2 gap-2">
          <button disabled={saving} onClick={() => handleSendToClient('whatsapp')}
            className="py-3 rounded-xl text-sm font-bold border border-blue-200 bg-blue-50 text-blue-700 active:bg-blue-100 disabled:opacity-50">
            Send via WhatsApp
          </button>
          <button disabled={saving} onClick={() => handleSendToClient('email')}
            className="py-3 rounded-xl text-sm font-bold border border-blue-200 bg-blue-50 text-blue-700 active:bg-blue-100 disabled:opacity-50">
            Send via Email
          </button>
        </div>
      )}

      {/* The client's real-world decision, recorded here the same as
          DesignCenterScreen.tsx's own Status Actions — no reason capture for
          these three (matches the full screen exactly; Revision Requested
          vs. Client Rejected is itself the detail). */}
      {pkg.status === 'sent_to_client' && (canMd || canRequestRevision) && (
        <div className="flex flex-wrap gap-2">
          {canMd && (
            <button disabled={saving} onClick={() => act('client_approved')}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 active:bg-emerald-100 disabled:opacity-50">
              Client Approved
            </button>
          )}
          {canRequestRevision && (
            <button disabled={saving} onClick={() => act('revision_requested')}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-amber-200 bg-amber-50 text-amber-700 active:bg-amber-100 disabled:opacity-50">
              Revision Requested
            </button>
          )}
          {canMd && (
            <button disabled={saving} onClick={() => act('rejected')}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-red-200 bg-red-50 text-red-700 active:bg-red-100 disabled:opacity-50">
              Client Rejected
            </button>
          )}
        </div>
      )}

      {showReject && (
        <div className="space-y-2">
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejection"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <button disabled={!rejectReason.trim() || saving}
            onClick={() => act(pkg.status === 'pending_pc_review' ? 'pc_rejected' : 'md_rejected', rejectReason.trim(),
              pkg.status === 'pending_pc_review' ? 'PC rejected' : 'MD rejected')}
            className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            Confirm Reject
          </button>
        </div>
      )}

      <button onClick={onReview} className="w-full py-2.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 active:bg-slate-50">
        Open full Design Package →
      </button>
    </div>
  )
}
