import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { useAuth } from '../../context/AuthContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllPurchaseOrders, getAllVendorBills } from '../../services/procurementService'
import { getAllPayables, getAllPaymentMilestones } from '../../services/financeService'
import { getAllPunchListItems } from '../../services/punchListService'
import { upsertProject } from '../../services/projectService'
import type { Project, ProjectStage, ManagedUser, UserRole, StatusHistoryItem } from '../../types'

export const ROLE_FOR_PROJECT_STAGE: Partial<Record<ProjectStage, UserRole>> = {
  site_visit:         'site_engineer',
  requirements:       'project_coordinator',
  boq_preparation:    'qs',
  internal_approval:  'owner',
  design:             'designer',
  client_approval:    'project_coordinator',
  advance_payment:    'accounts',
  execution:          'site_engineer',
  procurement:        'purchase',
  handover_prep:      'project_coordinator',
  final_payment:      'accounts',
  reconciliation:     'accounts',
  closed:             'owner',
}

export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  lead_converted:    'Lead Converted',
  site_visit:        'Site Visit',
  requirements:      'Requirements',
  boq_preparation:   'BOQ Preparation',
  internal_approval: 'Internal Approval',
  design:            'Design',
  client_approval:   'Client Approval',
  advance_payment:   'Advance Payment',
  execution:         'Execution',
  procurement:       'Procurement',
  handover_prep:     'Handover Prep',
  final_payment:     'Final Payment',
  reconciliation:    'Reconciliation',
  closed:            'Closed',
}

const STAGE_ORDER: ProjectStage[] = [
  'lead_converted', 'site_visit', 'requirements', 'boq_preparation', 'internal_approval',
  'design', 'client_approval', 'advance_payment', 'execution', 'procurement',
  'handover_prep', 'final_payment', 'reconciliation', 'closed',
]

function nextStage(stage: ProjectStage): ProjectStage | undefined {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : undefined
}

interface Props {
  isOpen: boolean
  onClose: () => void
  project: Project
  onDone: (msg: string) => void
}

export function ProjectStatusSheet({ isOpen, onClose, project, onDone }: Props) {
  const { user } = useAuth()

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
    await save('execution', 'Execution started')
  }

  async function submitExecution() {
    await save('procurement', 'Moved to procurement')
  }

  async function submitProcurement() {
    await save('handover_prep', 'Procurement complete, preparing handover')
  }

  async function submitHandoverPrep() {
    await save('final_payment', 'Handover prepared, awaiting final payment')
  }

  async function submitFinalPayment() {
    await save('reconciliation', 'Final payment received, reconciling')
  }

  async function submitReconciliation() {
    await save('closed', 'Project reconciled', { status: 'closed' })
  }

  async function submitGeneric() {
    const next = nextStage(project.stage)
    if (!next) return
    await save(next, `Advanced to ${PROJECT_STAGE_LABEL[next]}`)
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
            <p className="text-sm text-slate-600">Advance payment is recorded. Confirm execution has started on site.</p>
            <button disabled={saving} onClick={submitAdvance} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Mark Execution Started
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
                : 'Purchase orders are still open or have unpaid bills — manage them in the Procurement tab.'}
            </p>
            <button disabled={!procurementComplete || saving} onClick={submitProcurement} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Procurement Complete
            </button>
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
                ? `${milestonesOutstanding} payment milestone${milestonesOutstanding > 1 ? 's' : ''} still outstanding — record receipts in the Finance tab.`
                : 'All payment milestones are received.'}
            </p>
            <button disabled={milestonesOutstanding > 0 || saving} onClick={submitFinalPayment} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Final Payment Received
            </button>
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
      default:
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm this stage is complete to move on.</p>
            <button disabled={saving} onClick={submitGeneric} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm {PROJECT_STAGE_LABEL[project.stage]} Complete
            </button>
          </div>
        )
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
