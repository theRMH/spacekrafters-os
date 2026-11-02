import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { MdOverrideCard, withReason } from '../../components/forms/MdOverrideCard'
import { useAuth } from '../../context/AuthContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllPurchaseOrders, getAllVendorBills } from '../../services/procurementService'
import { getAllPayables, getAllPaymentMilestones } from '../../services/financeService'
import { getAllPunchListItems } from '../../services/punchListService'
import { upsertProject } from '../../services/projectService'
import { sendNotification } from '../../utils/notifications'
import { StageWorkStep, isWorkStage } from './StageWorkStep'
import { MaterialIndentStep } from './MaterialIndentStep'
import type { Project, ProjectStage, ManagedUser, UserRole, StatusHistoryItem } from '../../types'

// Single source of truth for stage sequence — the client will share their
// final order separately; reordering this array (and nothing else) is all
// that's needed to change it. Every `submit*` transition below reads its
// "next stage" from this array rather than hardcoding it, so the notes/
// buttons stay correct automatically. STAGE_OPTIONS in ProjectsScreen.tsx
// (the manual stage picker) should be kept in the same order.
export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'design_center',
  'shop_drawing',
  'mrf',
  'material_intent',
  'procurement',
  'waiting_for_delivery',
  'execution',
  'handover_prep',
  'final_payment',
  'reconciliation',
  'closed',
]

export function nextProjectStage(from: ProjectStage): ProjectStage {
  const idx = PROJECT_STAGE_ORDER.indexOf(from)
  return PROJECT_STAGE_ORDER[idx + 1] ?? from
}

export const ROLE_FOR_PROJECT_STAGE: Partial<Record<ProjectStage, UserRole>> = {
  design_center:      'designer',
  shop_drawing:       'qs',
  mrf:                'site_engineer',
  material_intent:    'qs',
  procurement:        'purchase',
  waiting_for_delivery: 'purchase',
  execution:          'site_engineer',
  handover_prep:      'project_coordinator',
  final_payment:      'accounts',
  reconciliation:     'accounts',
  closed:             'owner',
}

export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  design_center:     'Design Center',
  shop_drawing:      'Shop Drawing',
  mrf:               'MRF',
  material_intent:   'Material Intent',
  procurement:       'Procurement',
  waiting_for_delivery: 'Waiting for Delivery',
  execution:         'Execution',
  handover_prep:     'Handover Prep',
  final_payment:     'Final Payment',
  reconciliation:    'Reconciliation',
  closed:            'Closed',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  project: Project
  onDone: (msg: string) => void
}

export function ProjectStatusSheet({ isOpen, onClose, project, onDone }: Props) {
  const { user, can } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [procurementComplete, setProcurementComplete] = useState(false)
  const [unresolvedPunchItems, setUnresolvedPunchItems] = useState(0)
  const [milestonesOutstanding, setMilestonesOutstanding] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showRejectBox, setShowRejectBox] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!isOpen) return
    getManagedUsersDirectory().then(setUsers)
    Promise.all([getAllPurchaseOrders(), getAllVendorBills(), getAllPayables()]).then(([pos, bills, payables]) => {
      const projectPoIds = new Set(pos.filter(po => po.projectId === project.id).map(po => po.id))
      const projectBillIds = new Set(bills.filter(b => b.purchaseOrderId && projectPoIds.has(b.purchaseOrderId)).map(b => b.id))
      const unpaidPayables = payables.filter(p => p.vendorBillId && projectBillIds.has(p.vendorBillId) && p.status !== 'paid').length
      setProcurementComplete(projectPoIds.size > 0 && unpaidPayables === 0)
    })
    getAllPunchListItems().then(items => setUnresolvedPunchItems(items.filter(i => i.projectId === project.id && i.status === 'open').length))
    getAllPaymentMilestones().then(ms => setMilestonesOutstanding(ms.filter(m => m.projectId === project.id && m.status !== 'received').length))
  }, [isOpen, project.id])

  useEffect(() => { if (isOpen) { setShowRejectBox(false); setRejectReason('') } }, [isOpen])

  function nextResponsible(stage: ProjectStage): { role?: UserRole; id?: string; name?: string } {
    const role = ROLE_FOR_PROJECT_STAGE[stage]
    if (!role) return {}
    const person = users.find(u => u.role === role)
    return { role, id: person?.id, name: person?.fullName }
  }

  async function persist(patch: Partial<Project>, historyNote: string, historyStage: ProjectStage): Promise<Project | null> {
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
    await sendNotification(ids, 'Project Stage Pending Approval', `${project.name} — ${note}`, `/projects/${project.id}`)
  }

  // The responsible role no longer advances the project directly — it submits
  // a request, which sits at the current stage (nothing has moved yet) until
  // the MD approves or rejects it. Same pattern as MRF / Quotation / Design
  // approval elsewhere in this app.
  async function submitForApproval(toStage: ProjectStage, note: string) {
    if (!user) return
    const updated = await persist(
      {
        pendingStageRequest: {
          toStage, note, requestedBy: user.name, requestedById: user.id, requestedByRole: user.role,
          requestedAt: new Date().toISOString(),
        },
      },
      `Submitted for MD approval — ${note}`,
      project.stage,
    )
    if (updated) await notifyMd(note)
  }

  async function handleApprove() {
    const req = project.pendingStageRequest
    if (!req) return
    const { role, id, name } = nextResponsible(req.toStage)
    const updated = await persist(
      {
        stage: req.toStage,
        assignedRole: role, assignedToId: id, assignedToName: name,
        pendingStageRequest: undefined,
        ...(req.toStage === 'closed' ? { status: 'closed' as const } : {}),
      },
      `MD approved — moved to ${PROJECT_STAGE_LABEL[req.toStage]}`,
      req.toStage,
    )
    if (updated && req.requestedById) {
      await sendNotification([req.requestedById], 'Project Stage Approved',
        `${updated.name} — MD approved moving to ${PROJECT_STAGE_LABEL[req.toStage]}.`, `/projects/${updated.id}`)
    }
  }

  // MD-only: move the project to any stage (forward or back), skipping the
  // approval flow. Clears a pending request, reassigns to the stage's
  // responsible role, and reopens a closed project. Reason is mandatory.
  async function submitMdOverride(value: string, reason: string) {
    const stage = value as ProjectStage
    const { role, id, name } = nextResponsible(stage)
    await persist(
      {
        stage,
        assignedRole: role, assignedToId: id, assignedToName: name,
        pendingStageRequest: undefined,
        status: stage === 'closed' ? 'closed' as const : project.status === 'closed' ? 'active' as const : project.status,
      },
      `MD override: ${PROJECT_STAGE_LABEL[project.stage]} → ${PROJECT_STAGE_LABEL[stage]}${withReason(reason)}`,
      stage,
    )
  }

  async function handleReject() {
    const req = project.pendingStageRequest
    if (!req || !rejectReason.trim()) return
    const updated = await persist(
      { pendingStageRequest: undefined },
      `MD rejected moving to ${PROJECT_STAGE_LABEL[req.toStage]}: ${rejectReason.trim()}`,
      project.stage,
    )
    if (updated && req.requestedById) {
      await sendNotification([req.requestedById], 'Project Stage Rejected',
        `${updated.name} — MD rejected moving to ${PROJECT_STAGE_LABEL[req.toStage]}: ${rejectReason.trim()}`, `/projects/${updated.id}`)
    }
    setRejectReason(''); setShowRejectBox(false)
  }

  // Shop Drawing, MRF, Material Intent and Waiting for Delivery: their detailed screens are not built yet, so these
  // only confirm the stage is done and ask to move on.
  async function submitStageDone(stage: ProjectStage) {
    const next = nextProjectStage(stage)
    await submitForApproval(next, `${PROJECT_STAGE_LABEL[stage]} complete, ready to move to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitExecution() {
    const next = nextProjectStage('execution')
    await submitForApproval(next, `Ready to move to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitProcurement() {
    const next = nextProjectStage('procurement')
    await submitForApproval(next, `Procurement complete, ready to move to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitHandoverPrep() {
    const next = nextProjectStage('handover_prep')
    await submitForApproval(next, `Handover prepared, ready to move to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitFinalPayment() {
    const next = nextProjectStage('final_payment')
    await submitForApproval(next, `Final payment received, ready to move to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitReconciliation() {
    const next = nextProjectStage('reconciliation')
    await submitForApproval(next, 'Project reconciled, ready to close')
  }

  const respRole = ROLE_FOR_PROJECT_STAGE[project.stage]
  const respName = project.assignedToName
  const canAct = !respRole || user?.role === respRole || user?.role === 'owner'
  const canApprove = can('approve_project_stage')

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`

  function renderPending() {
    const req = project.pendingStageRequest!
    if (!canApprove) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Submitted by {req.requestedBy} — waiting for MD approval to move to {PROJECT_STAGE_LABEL[req.toStage]}.
          </p>
          <p className="text-xs text-slate-400">{req.note}</p>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-sm">
          <p className="font-bold text-slate-800">Move to {PROJECT_STAGE_LABEL[req.toStage]}</p>
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
    if (project.pendingStageRequest) return renderPending()

    // Design Center has its own flow (PC assigns the architect, the architect uploads, the PC approves or rejects),
    // so it is open to the PC and the architect rather than only the stage's responsible role.
    if (isWorkStage(project.stage)) {
      return <StageWorkStep project={project} stage={project.stage} users={users} user={user} saving={saving} persist={persist} />
    }

    // Material Intent: the QS fills in the indent, the PC approves or rejects it — same loop, open to both.
    if (project.stage === 'material_intent') {
      return <MaterialIndentStep project={project} users={users} user={user} saving={saving} persist={persist} />
    }

    if (!canAct) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {respName ?? (respRole ? respRole.replace('_', ' ') : 'the next step')}.
        </p>
      )
    }

    switch (project.stage) {
      case 'mrf':
      case 'waiting_for_delivery':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm {PROJECT_STAGE_LABEL[project.stage]} is complete and the project is ready to move to {PROJECT_STAGE_LABEL[nextProjectStage(project.stage)]}.</p>
            <button disabled={saving} onClick={() => submitStageDone(project.stage)} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Submit for MD Approval
            </button>
          </div>
        )
      case 'execution':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Track day-to-day progress in the Tasks and Diary tabs. Confirm here once material procurement needs to begin.</p>
            <button disabled={saving} onClick={submitExecution} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Submit for MD Approval
            </button>
          </div>
        )
      case 'procurement':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {procurementComplete
                ? 'All purchase orders are billed and paid.'
                : 'Purchase orders are still open or have unpaid bills.'}
            </p>
            {procurementComplete ? (
              <button disabled={saving} onClick={submitProcurement} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit for MD Approval
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/procurement', { state: { projectId: project.id } }) }} className={secondaryBtn}>
                Go to Procurement →
              </button>
            )}
          </div>
        )
      case 'handover_prep':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {unresolvedPunchItems > 0
                ? `${unresolvedPunchItems} punch list item${unresolvedPunchItems > 1 ? 's' : ''} still open — manage them in the Handover tab.`
                : 'All punch list items are resolved.'}
            </p>
            <button disabled={saving} onClick={submitHandoverPrep} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Submit for MD Approval
            </button>
          </div>
        )
      case 'final_payment':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {milestonesOutstanding > 0
                ? `${milestonesOutstanding} payment milestone${milestonesOutstanding > 1 ? 's' : ''} still outstanding.`
                : 'All payment milestones are received.'}
            </p>
            {milestonesOutstanding > 0 ? (
              <button onClick={() => { onClose(); navigate('/receivables', { state: { projectId: project.id } }) }} className={secondaryBtn}>
                Go to Receivables →
              </button>
            ) : (
              <button disabled={saving} onClick={submitFinalPayment} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit for MD Approval
              </button>
            )}
          </div>
        )
      case 'reconciliation':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm accounts are reconciled and the project is ready to close.</p>
            <button disabled={saving} onClick={submitReconciliation} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Submit for MD Approval
            </button>
          </div>
        )
      case 'closed':
        return <p className="text-sm text-slate-400 py-6 text-center">This project is closed.</p>
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Update Status — ${PROJECT_STAGE_LABEL[project.stage]}`}>
      <div className="space-y-4">
        {!project.pendingStageRequest && canAct && project.stage !== 'closed' && project.stage !== 'material_intent' && !isWorkStage(project.stage) && (
          <p className="text-xs text-slate-400 -mt-2">Moving to the next stage needs MD approval before it takes effect.</p>
        )}
        {renderBody()}
        {user?.role === 'owner' && (
          <MdOverrideCard noun="stage" title="project stage" saving={saving} onApply={submitMdOverride}
            options={PROJECT_STAGE_ORDER.filter(s => s !== project.stage).map(s => ({ value: s, label: PROJECT_STAGE_LABEL[s] }))} />
        )}
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
