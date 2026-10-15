import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { MdOverrideCard } from '../../components/forms/MdOverrideCard'
import { useAuth } from '../../context/AuthContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllPurchaseOrders, getAllGoodsReceipts } from '../../services/procurementService'
import { getAllPaymentMilestones } from '../../services/financeService'
import { upsertProject } from '../../services/projectService'
import { sendNotification } from '../../utils/notifications'
import type { Project, ProductSaleStage, ManagedUser, UserRole, StatusHistoryItem } from '../../types'

// Simple, linear stage machine for the Product Sales (FGD) workflow — a
// deliberately separate set of constants from ProjectStatusSheet.tsx's
// PROJECT_STAGE_ORDER/ROLE_FOR_PROJECT_STAGE (Interior Projects), so the two
// workflows' stage vocabularies can never collide. Customer Enquiry/Quotation/
// Approval are pure read-derived state from Lead/Quotation (see
// ProductSalesScreen.tsx) — no Project shell exists yet, so no stage-approval
// action applies to them here; this sheet only governs the three real
// internal handoffs after the shell exists.
export const PRODUCT_SALE_STAGE_ORDER: ProductSaleStage[] = [
  'customer_enquiry', 'quotation', 'approval', 'payment', 'product_ordering', 'delivery', 'completed',
]

export function nextProductSaleStage(from: ProductSaleStage): ProductSaleStage {
  const idx = PRODUCT_SALE_STAGE_ORDER.indexOf(from)
  return PRODUCT_SALE_STAGE_ORDER[idx + 1] ?? from
}

export const ROLE_FOR_PRODUCT_SALE_STAGE: Partial<Record<ProductSaleStage, UserRole>> = {
  payment:           'accounts',
  product_ordering:  'purchase',
  delivery:          'project_coordinator',
  completed:         'owner',
}

export const PRODUCT_SALE_STAGE_LABEL: Record<ProductSaleStage, string> = {
  customer_enquiry:  'Customer Enquiry',
  quotation:         'Quotation',
  approval:          'Approval',
  payment:           'Payment',
  product_ordering:  'Product Ordering',
  delivery:          'Delivery',
  completed:         'Completed',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  project: Project
  onDone: (msg: string) => void
}

export function ProductSaleStatusSheet({ isOpen, onClose, project, onDone }: Props) {
  const { user, can } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [hasPurchaseOrder, setHasPurchaseOrder] = useState(false)
  const [hasDelivery, setHasDelivery] = useState(false)
  const [paymentOutstanding, setPaymentOutstanding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showRejectBox, setShowRejectBox] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!isOpen) return
    getManagedUsersDirectory().then(setUsers)
    getAllPaymentMilestones().then(ms => setPaymentOutstanding(ms.some(m => m.projectId === project.id && m.status !== 'received')))
    getAllPurchaseOrders().then(pos => {
      const projectPos = pos.filter(po => po.projectId === project.id)
      setHasPurchaseOrder(projectPos.length > 0)
      const poIds = new Set(projectPos.map(po => po.id))
      getAllGoodsReceipts().then(gr => setHasDelivery(gr.some(g => poIds.has(g.purchaseOrderId))))
    })
  }, [isOpen, project.id])

  useEffect(() => { if (isOpen) { setShowRejectBox(false); setRejectReason('') } }, [isOpen])

  const stage = project.productSaleStage ?? 'payment'

  function nextResponsible(toStage: ProductSaleStage): { role?: UserRole; id?: string; name?: string } {
    const role = ROLE_FOR_PRODUCT_SALE_STAGE[toStage]
    if (!role) return {}
    const person = users.find(u => u.role === role)
    return { role, id: person?.id, name: person?.fullName }
  }

  async function persist(patch: Partial<Project>, historyNote: string, historyStage: ProductSaleStage): Promise<Project | null> {
    if (!user) return null
    setSaving(true)
    const historyEntry: StatusHistoryItem = { stage: historyStage, note: historyNote, updatedBy: user.name, updatedRole: user.role, updatedAt: new Date().toISOString() }
    const updated: Project = {
      ...project,
      statusHistory: [...(project.statusHistory ?? []), historyEntry],
      updatedAt: new Date().toISOString(),
      ...patch,
    }
    const result = await upsertProject(updated)
    setSaving(false)
    if (!result.ok) { onDone(result.error ?? 'Could not update status.'); return null }
    onDone(historyNote)
    onClose()
    return updated
  }

  async function notifyMd(note: string) {
    const dir = await getManagedUsersDirectory()
    const ids = dir.filter(u => u.role === 'owner').map(u => u.id)
    await sendNotification(ids, 'Product Sale Pending Approval', `${project.name} — ${note}`, `/product-sales/${project.leadId}`)
  }

  async function submitForApproval(toStage: ProductSaleStage, note: string) {
    if (!user) return
    const updated = await persist(
      {
        pendingProductSaleStageRequest: {
          toStage, note, requestedBy: user.name, requestedById: user.id, requestedByRole: user.role,
          requestedAt: new Date().toISOString(),
        },
      },
      `Submitted for MD approval — ${note}`,
      stage,
    )
    if (updated) await notifyMd(note)
  }

  async function handleApprove() {
    const req = project.pendingProductSaleStageRequest
    if (!req) return
    const { role, id, name } = nextResponsible(req.toStage)
    const updated = await persist(
      {
        productSaleStage: req.toStage,
        assignedRole: role, assignedToId: id, assignedToName: name,
        pendingProductSaleStageRequest: undefined,
        ...(req.toStage === 'completed' ? { status: 'closed' as const } : {}),
      },
      `MD approved — moved to ${PRODUCT_SALE_STAGE_LABEL[req.toStage]}`,
      req.toStage,
    )
    if (updated && req.requestedById) {
      await sendNotification([req.requestedById], 'Product Sale Stage Approved',
        `${updated.name} — MD approved moving to ${PRODUCT_SALE_STAGE_LABEL[req.toStage]}.`, `/product-sales/${updated.leadId}`)
    }
  }

  // MD-only: move the sale to any stage this sheet governs (forward or back),
  // skipping the approval flow. Clears a pending request, reassigns to the
  // stage's role, and reopens a closed sale. Reason is mandatory.
  async function submitMdOverride(value: string, reason: string) {
    const toStage = value as ProductSaleStage
    const { role, id, name } = nextResponsible(toStage)
    await persist(
      {
        productSaleStage: toStage,
        assignedRole: role, assignedToId: id, assignedToName: name,
        pendingProductSaleStageRequest: undefined,
        status: toStage === 'completed' ? 'closed' as const : project.status === 'closed' ? 'active' as const : project.status,
      },
      `MD override: ${PRODUCT_SALE_STAGE_LABEL[stage]} → ${PRODUCT_SALE_STAGE_LABEL[toStage]} — ${reason}`,
      toStage,
    )
  }

  async function handleReject() {
    const req = project.pendingProductSaleStageRequest
    if (!req || !rejectReason.trim()) return
    const updated = await persist(
      { pendingProductSaleStageRequest: undefined },
      `MD rejected moving to ${PRODUCT_SALE_STAGE_LABEL[req.toStage]}: ${rejectReason.trim()}`,
      stage,
    )
    if (updated && req.requestedById) {
      await sendNotification([req.requestedById], 'Product Sale Stage Rejected',
        `${updated.name} — MD rejected moving to ${PRODUCT_SALE_STAGE_LABEL[req.toStage]}: ${rejectReason.trim()}`, `/product-sales/${updated.leadId}`)
    }
    setRejectReason(''); setShowRejectBox(false)
  }

  async function submitPayment() {
    const next = nextProductSaleStage('payment')
    await submitForApproval(next, `Payment received in full, ready to move to ${PRODUCT_SALE_STAGE_LABEL[next]}`)
  }

  async function submitOrdering() {
    const next = nextProductSaleStage('product_ordering')
    await submitForApproval(next, `Product ordered, ready to move to ${PRODUCT_SALE_STAGE_LABEL[next]}`)
  }

  async function submitDelivery() {
    const next = nextProductSaleStage('delivery')
    await submitForApproval(next, 'Product delivered, ready to close')
  }

  const respRole = ROLE_FOR_PRODUCT_SALE_STAGE[stage]
  const respName = project.assignedToName
  const canAct = !respRole || user?.role === respRole || user?.role === 'owner'
  const canApprove = can('approve_product_sale_stage')

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`

  function renderPending() {
    const req = project.pendingProductSaleStageRequest!
    if (!canApprove) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Submitted by {req.requestedBy} — waiting for MD approval to move to {PRODUCT_SALE_STAGE_LABEL[req.toStage]}.
          </p>
          <p className="text-xs text-slate-400">{req.note}</p>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-sm">
          <p className="font-bold text-slate-800">Move to {PRODUCT_SALE_STAGE_LABEL[req.toStage]}</p>
          <p className="text-slate-600">{req.note}</p>
          <p className="text-[12px] text-slate-400">Submitted by {req.requestedBy}</p>
        </div>
        {showRejectBox ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 block">Reason for rejecting *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
            <div className="flex gap-2">
              <button disabled={saving || !rejectReason.trim()} onClick={handleReject} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>
                Confirm Reject
              </button>
              <button onClick={() => { setShowRejectBox(false); setRejectReason('') }} className={`flex-1 ${secondaryBtn}`}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button disabled={saving} onClick={handleApprove} className={`flex-1 ${btn} text-white`} style={{ background: '#059669' }}>
              Approve
            </button>
            <button disabled={saving} onClick={() => setShowRejectBox(true)} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderBody() {
    if (project.pendingProductSaleStageRequest) return renderPending()

    if (!canAct) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {respName ?? (respRole ? respRole.replace('_', ' ') : 'the next step')}.
        </p>
      )
    }

    switch (stage) {
      case 'payment':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {paymentOutstanding ? 'Payment is still outstanding.' : 'Payment has been received in full.'}
            </p>
            {paymentOutstanding ? (
              <button onClick={() => { onClose(); navigate('/receivables', { state: { projectId: project.id } }) }} className={secondaryBtn}>
                Go to Receivables →
              </button>
            ) : (
              <button disabled={saving} onClick={submitPayment} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit for MD Approval
              </button>
            )}
          </div>
        )
      case 'product_ordering':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {hasPurchaseOrder ? 'A purchase order has been raised with the brand/vendor.' : 'No purchase order raised yet — raise one in Procurement first.'}
            </p>
            {hasPurchaseOrder ? (
              <button disabled={saving} onClick={submitOrdering} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit for MD Approval
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/procurement', { state: { projectId: project.id } }) }} className={secondaryBtn}>
                Go to Procurement →
              </button>
            )}
          </div>
        )
      case 'delivery':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {hasDelivery ? 'Delivery has been recorded.' : 'No delivery recorded yet — record it in Procurement first.'}
            </p>
            {hasDelivery ? (
              <button disabled={saving} onClick={submitDelivery} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit for MD Approval
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/procurement', { state: { projectId: project.id } }) }} className={secondaryBtn}>
                Go to Procurement →
              </button>
            )}
          </div>
        )
      case 'completed':
        return <p className="text-sm text-slate-400 py-6 text-center">This product sale is completed.</p>
      default:
        return <p className="text-sm text-slate-400 py-6 text-center">No action available at this stage.</p>
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Update Status — ${PRODUCT_SALE_STAGE_LABEL[stage]}`}>
      <div className="space-y-4">
        {!project.pendingProductSaleStageRequest && canAct && stage !== 'completed' && (
          <p className="text-xs text-slate-400 -mt-2">Moving to the next stage needs MD approval before it takes effect.</p>
        )}
        {renderBody()}
        {user?.role === 'owner' && (
          <MdOverrideCard noun="stage" title="product sale stage" saving={saving} onApply={submitMdOverride}
            options={PRODUCT_SALE_STAGE_ORDER.slice(PRODUCT_SALE_STAGE_ORDER.indexOf('payment')).filter(s => s !== stage).map(s => ({ value: s, label: PRODUCT_SALE_STAGE_LABEL[s] }))} />
        )}
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
