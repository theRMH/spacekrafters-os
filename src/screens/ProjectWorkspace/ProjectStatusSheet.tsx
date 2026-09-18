import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { useAuth } from '../../context/AuthContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllPurchaseOrders, getAllVendorBills } from '../../services/procurementService'
import { getAllPayables, getAllPaymentMilestones } from '../../services/financeService'
import { getAllPunchListItems } from '../../services/punchListService'
import { upsertProject } from '../../services/projectService'
import type { Project, ProjectStage, ManagedUser, UserRole, StatusHistoryItem } from '../../types'

// Single source of truth for stage sequence — the client will share their
// final order separately; reordering this array (and nothing else) is all
// that's needed to change it. Every `submit*` transition below reads its
// "next stage" from this array rather than hardcoding it, so the notes/
// buttons stay correct automatically. STAGE_OPTIONS in ProjectsScreen.tsx
// (the manual stage picker) should be kept in the same order.
export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'advance_payment',
  'designing',
  'execution',
  'procurement',
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
  advance_payment:    'accounts',
  designing:          'designer',
  execution:          'site_engineer',
  procurement:        'purchase',
  handover_prep:      'project_coordinator',
  final_payment:      'accounts',
  reconciliation:     'accounts',
  closed:             'owner',
}

export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  advance_payment:   'Advance Payment',
  designing:         'Designing',
  execution:         'Execution',
  procurement:       'Procurement',
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
  const { user } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [procurementComplete, setProcurementComplete] = useState(false)
  const [unresolvedPunchItems, setUnresolvedPunchItems] = useState(0)
  const [milestonesOutstanding, setMilestonesOutstanding] = useState(0)
  const [saving, setSaving] = useState(false)

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

  function nextResponsible(stage: ProjectStage): { role?: UserRole; id?: string; name?: string } {
    const role = ROLE_FOR_PROJECT_STAGE[stage]
    if (!role) return {}
    const person = users.find(u => u.role === role)
    return { role, id: person?.id, name: person?.fullName }
  }

  async function save(stage: ProjectStage, note: string, extra?: Partial<Project>) {
    if (!user) return
    setSaving(true)
    const { role, id, name } = nextResponsible(stage)
    const historyEntry: StatusHistoryItem = {
      stage,
      note,
      updatedBy: user.name,
      updatedRole: user.role,
      updatedAt: new Date().toISOString(),
    }
    const updated: Project = {
      ...project,
      stage,
      assignedRole: role,
      assignedToId: id,
      assignedToName: name,
      statusHistory: [...(project.statusHistory ?? []), historyEntry],
      updatedAt: new Date().toISOString(),
      ...extra,
    }
    const result = await upsertProject(updated)
    setSaving(false)
    if (result.ok) {
      onDone(note)
      onClose()
    } else {
      onDone(result.error ?? 'Could not update status.')
    }
  }

  async function submitAdvance() {
    const next = nextProjectStage('advance_payment')
    await save(next, `Moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitDesigning() {
    const next = nextProjectStage('designing')
    await save(next, `Design finalized, moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitExecution() {
    const next = nextProjectStage('execution')
    await save(next, `Moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitProcurement() {
    const next = nextProjectStage('procurement')
    await save(next, `Procurement complete, moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitHandoverPrep() {
    const next = nextProjectStage('handover_prep')
    await save(next, `Handover prepared, moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitFinalPayment() {
    const next = nextProjectStage('final_payment')
    await save(next, `Final payment received, moved to ${PROJECT_STAGE_LABEL[next]}`)
  }

  async function submitReconciliation() {
    const next = nextProjectStage('reconciliation')
    await save(next, 'Project reconciled', next === 'closed' ? { status: 'closed' } : undefined)
  }

  const respRole = ROLE_FOR_PROJECT_STAGE[project.stage]
  const respName = project.assignedToName
  const canAct = !respRole || user?.role === respRole || user?.role === 'owner'

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`

  function renderBody() {
    if (!canAct) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {respName ?? (respRole ? respRole.replace('_', ' ') : 'the next step')}.
        </p>
      )
    }

    switch (project.stage) {
      case 'advance_payment':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Advance payment is recorded. Confirm the project is ready to move to {PROJECT_STAGE_LABEL[nextProjectStage('advance_payment')]}.</p>
            <button disabled={saving} onClick={submitAdvance} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Move to {PROJECT_STAGE_LABEL[nextProjectStage('advance_payment')]}
            </button>
          </div>
        )
      case 'designing':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Design is in progress — track it in the Design Center tab. Confirm here once the design is finalized and construction can begin.</p>
            <button disabled={saving} onClick={submitDesigning} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Design Finalized
            </button>
          </div>
        )
      case 'execution':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Track day-to-day progress in the Tasks and Diary tabs. Confirm here once material procurement needs to begin.</p>
            <button disabled={saving} onClick={submitExecution} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Move To Procurement
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
                Confirm Procurement Complete
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
              Confirm Ready For Final Payment
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
                Confirm Final Payment Received
              </button>
            )}
          </div>
        )
      case 'reconciliation':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm accounts are reconciled and the project is ready to close.</p>
            <button disabled={saving} onClick={submitReconciliation} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Close Project
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
        {renderBody()}
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
