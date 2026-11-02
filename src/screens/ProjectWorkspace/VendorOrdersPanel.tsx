import { useState } from 'react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { inr, orderTotals } from '../../utils/purchaseOrderMath'
import { sendNotification } from '../../utils/notifications'
import { VENDOR_STATUS_LABEL, VENDOR_STATUS_TINT, hasBeenSent, logEntry, openVendorWhatsApp, routeFor, senderOf, vendorStatus } from '../../utils/vendorOrderFlow'
import { ROLE_LABELS } from '../../data/permissions'
import type { AuthUser, ManagedUser, Project, ProjectStage, VendorOrder, VendorOrderStatus } from '../../types'

interface Props {
  project: Project
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  stage: ProjectStage
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage, opts?: { keepOpen?: boolean; quiet?: boolean }) => Promise<Project | null>
  // Procurement lets the procurer edit or remove a vendor that is still a draft or was rejected.
  onEdit?: (v: VendorOrder) => void
  onRemove?: (v: VendorOrder) => void
}

const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const btn = 'flex-1 py-2.5 rounded-lg text-xs font-bold active:opacity-90 disabled:opacity-50'

// The vendors' purchase orders with where each one stands, and the action open to the viewer on each: the PC approves or
// rejects an order, the sender sends it to the vendor by WhatsApp or email (recorded) and then follows it through
// Waiting for vendor response → Order Placed → In Transit → Delivered. Shared by Procurement and Waiting for Delivery.
export function VendorOrdersPanel({ project, users, user, saving, stage, persist, onEdit, onRemove }: Props) {
  const work = project.procurementWork
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [handoffTo, setHandoffTo] = useState<Record<string, string>>({})
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!work) return null

  const isOwner = user?.role === 'owner'
  const isPc = user?.role === 'project_coordinator' || isOwner
  // Whoever the PC handed an order to (the procurer by default) sends it to the vendor and follows it up.
  const isSenderOf = (v: VendorOrder) => user?.id === senderOf(work, v).id || isOwner
  const isProcurer = user?.id === work.procurerId || isOwner

  async function update(v: VendorOrder, status: VendorOrderStatus, label: string, extra: Partial<VendorOrder> = {}, via?: 'whatsapp' | 'email', note?: string) {
    if (!work || !user) return null
    const vendors = work.vendors.map(x => x.id === v.id
      ? { ...x, ...extra, status, log: [...(x.log ?? []), logEntry(status, label, user.name, note, via)], updatedAt: new Date().toISOString() }
      : x)
    const next = { ...work, vendors, review: undefined }
    // Once every order has been sent to its vendor the project moves on to Waiting for Delivery by itself.
    const advanceStage = stage === 'procurement' && vendors.every(x => hasBeenSent(vendorStatus(next, x)))
    const patch: Partial<Project> = { procurementWork: next, ...routeFor(next, project, users), ...(advanceStage ? { stage: 'waiting_for_delivery' as const } : {}) }
    return persist(patch, `${v.name} (${v.poNumber}): ${label}${advanceStage ? ' — all orders sent, moved to Waiting for Delivery' : ''}`, advanceStage ? 'waiting_for_delivery' : stage, { keepOpen: !advanceStage })
  }

  async function approve(v: VendorOrder) {
    await update(v, 'approved', 'PC approved')
  }

  // The PC takes back an approval made by mistake: the order returns to "Waiting for PC approval" (any hand-off to the
  // procurer is withdrawn). Not possible once it has been sent to the vendor.
  async function undoApproval(v: VendorOrder) {
    const handedTo = v.sendById
    const updated = await update(v, 'with_pc', 'PC took back the approval', { sendById: undefined, sendByName: undefined })
    if (updated) {
      setUndoingId(null)
      if (handedTo) await sendNotification([handedTo], 'Vendor Order Withdrawn', `${project.name} — ${v.name} (${v.poNumber}) was taken back by the PC; do not send it yet.`, `/my-tasks/project/${project.id}`)
    }
  }

  // The PC hands the approved order to the procurer (or whoever they name), who then sends it to the vendor.
  async function handOff(v: VendorOrder) {
    const person = users.find(u => u.id === (handoffTo[v.id] || work!.procurerId))
    if (!person) { setError('Choose who will send it to the vendor.'); return }
    setError('')
    const updated = await update(v, 'with_procurer', `PC sent to ${person.fullName} to send to the vendor`, { sendById: person.id, sendByName: person.fullName })
    if (updated) await sendNotification([person.id], 'Send Vendor Order', `${project.name} — ${v.name} (${v.poNumber}) is approved. Send it to the vendor.`, `/my-tasks/project/${project.id}`)
  }

  async function reject(v: VendorOrder) {
    const text = reason.trim()
    if (!text) { setError('Enter the reason for rejecting.'); return }
    const updated = await update(v, 'rejected', 'PC rejected', { rejectionReason: text }, undefined, text)
    if (updated) {
      await sendNotification([work!.procurerId], 'Vendor Order Rejected', `${project.name} — ${v.name} (${v.poNumber}) was rejected: ${text}`, `/my-tasks/project/${project.id}`)
      setRejectingId(null); setReason(''); setError('')
    }
  }

  // Both channels record the send; WhatsApp also opens the vendor's chat with the PDF link ready (same as quotations).
  async function send(v: VendorOrder, via: 'whatsapp' | 'email') {
    setError('')
    if (via === 'whatsapp' && !openVendorWhatsApp(v, project.name)) { setError(`Add ${v.name}'s phone number (edit the vendor) to send on WhatsApp.`); return }
    const updated = await update(v, 'sent', `Sent via ${via === 'whatsapp' ? 'WhatsApp' : 'Email'}`, { rejectionReason: undefined }, via)
    if (updated) setSendingId(null)
  }

  async function advance(v: VendorOrder, status: VendorOrderStatus, label: string) {
    const updated = await update(v, status, label)
    if (updated && status === 'delivered' && work && work.vendors.every(x => x.id === v.id || vendorStatus(work, x) === 'delivered')) {
      const pc = users.find(u => u.id === project.coordinatorId)?.id ?? project.coordinatorId
      await sendNotification([pc], 'All Orders Delivered', `${project.name} — every vendor order has been delivered.`, `/projects/${project.id}`)
    }
  }

  if (work.vendors.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendors ({work.vendors.length})</p>
      {work.vendors.map(v => {
        const status = vendorStatus(work, v)
        const t = orderTotals(v.lines)
        const log = v.log ?? []
        return (
          <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{v.name}</p>
                <p className="text-xs text-slate-500">{v.poNumber}{v.gstin ? ` · GST ${v.gstin}` : ''}</p>
              </div>
              <p className="text-sm font-bold text-slate-800 shrink-0">Rs. {inr(t.total)}</p>
            </div>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${VENDOR_STATUS_TINT[status]}`}>{VENDOR_STATUS_LABEL[status]}</span>
            {v.pdf && <MultiFileUploadField label="" files={[v.pdf]} onChange={() => {}} readOnly />}
            {status === 'rejected' && v.rejectionReason && <p className="text-xs text-red-700"><span className="font-bold">Reason:</span> {v.rejectionReason}</p>}

            {/* PC: approve or reject this vendor's order. */}
            {status === 'with_pc' && isPc && (rejectingId === v.id ? (
              <div className="space-y-2">
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason for rejecting *"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => reject(v)} className={`${btn} border border-red-200 bg-red-50 text-red-700`}>Confirm Reject</button>
                  <button onClick={() => { setRejectingId(null); setReason(''); setError('') }} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Back</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button disabled={saving} onClick={() => approve(v)} className={`${btn} text-white`} style={{ background: '#059669' }}>Approve</button>
                <button disabled={saving} onClick={() => { setRejectingId(v.id); setError('') }} className={`${btn} border border-red-200 bg-red-50 text-red-700`}>Reject</button>
              </div>
            ))}

            {/* PC: hand the approved order to the procurer. */}
            {status === 'approved' && (isPc ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Send to procurer</label>
                <select value={handoffTo[v.id] ?? work.procurerId} onChange={e => setHandoffTo(h => ({ ...h, [v.id]: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  {[...users].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
                </select>
                <button disabled={saving} onClick={() => handOff(v)} className={`${btn} w-full text-white`} style={{ background: '#0F2A4A' }}>Send to Procurer</button>
              </div>
            ) : <p className="text-xs text-slate-500">Waiting for the PC to send it to the procurer.</p>)}

            {/* Procurer: send the order to the vendor (recorded). */}
            {status === 'with_procurer' && isSenderOf(v) && (sendingId === v.id ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Send {v.poNumber} to {v.name} through:</p>
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => send(v, 'whatsapp')} className={`${btn} text-white`} style={{ background: '#16A34A' }}>WhatsApp</button>
                  <button disabled={saving} onClick={() => send(v, 'email')} className={`${btn} text-white`} style={{ background: '#2563EB' }}>Email</button>
                  <button onClick={() => setSendingId(null)} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Back</button>
                </div>
              </div>
            ) : (
              <button disabled={saving} onClick={() => { setSendingId(v.id); setError('') }} className={`${btn} w-full text-white`} style={{ background: '#0F2A4A' }}>Send to Vendor</button>
            ))}
            {/* PC: take an approval back (before the order has gone to the vendor). */}
            {(status === 'approved' || status === 'with_procurer') && isPc && (undoingId === v.id ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-2">
                <p className="text-xs text-amber-800">Take the approval back? The order returns to "Waiting for PC approval".</p>
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => undoApproval(v)} className={`${btn} border border-amber-300 bg-white text-amber-800`}>Yes, Undo Approval</button>
                  <button onClick={() => setUndoingId(null)} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Keep</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setUndoingId(v.id)} className="text-xs font-semibold text-amber-700 underline">Undo approval</button>
            ))}
            {status === 'with_procurer' && !isSenderOf(v) && <p className="text-xs text-slate-500">Waiting for {senderOf(work, v).name} to send it to the vendor.</p>}

            {/* Sender: follow the order after it is sent. */}
            {status === 'sent' && isSenderOf(v) && <button disabled={saving} onClick={() => advance(v, 'order_placed', 'Vendor accepted — order placed')} className={`${btn} w-full text-white`} style={{ background: '#4F46E5' }}>Vendor Accepted — Order Placed</button>}
            {status === 'order_placed' && isSenderOf(v) && <button disabled={saving} onClick={() => advance(v, 'in_transit', 'Marked in transit')} className={`${btn} w-full text-white`} style={{ background: '#EA580C' }}>Mark In Transit</button>}
            {status === 'in_transit' && isSenderOf(v) && <button disabled={saving} onClick={() => advance(v, 'delivered', 'Marked delivered')} className={`${btn} w-full text-white`} style={{ background: '#059669' }}>Mark Delivered</button>}

            {/* Procurer: fix a draft or rejected order. */}
            {(status === 'draft' || status === 'rejected') && isProcurer && (onEdit || onRemove) && (
              <div className="flex gap-2">
                {onEdit && <button onClick={() => onEdit(v)} className={`${btn} border border-slate-200 bg-white`}>Edit</button>}
                {onRemove && <button disabled={saving} onClick={() => onRemove(v)} className={`${btn} border border-red-200 bg-red-50 text-red-700`}>Remove</button>}
              </div>
            )}

            {log.length > 0 && (
              <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
                {log.map((l, i) => <p key={i} className="text-[11px] text-slate-500">{fmtAt(l.at)} · {l.label} · {l.by}{l.note && l.status !== 'rejected' ? ` — ${l.note}` : ''}</p>)}
              </div>
            )}
          </div>
        )
      })}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      <p className="text-xs text-slate-500 text-right">All vendors: <span className="font-bold text-slate-800">Rs. {inr(work.vendors.reduce((s, v) => s + orderTotals(v.lines).total, 0))}</span></p>
    </div>
  )
}
