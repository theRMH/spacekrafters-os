import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { VendorOrdersPanel } from './VendorOrdersPanel'
import { VENDOR_STATUS_LABEL, vendorStatus } from '../../utils/vendorOrderFlow'
import type { AuthUser, ManagedUser, Project, ProjectStage } from '../../types'

const STAGE: ProjectStage = 'waiting_for_delivery'

// The title a project shows in My Tasks while it sits in Waiting for Delivery (it follows whose turn it is).
export function waitingForDeliveryTaskTitle(project: Project): string {
  const work = project.procurementWork
  if (!work || work.vendors.length === 0) return 'Follow Up Vendor Orders'
  return work.vendors.every(v => vendorStatus(work, v) === 'delivered') ? 'Move to Execution' : 'Follow Up Vendor Orders'
}

interface Props {
  project: Project
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage, opts?: { keepOpen?: boolean; quiet?: boolean }) => Promise<Project | null>
}

const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'

// Waiting for Delivery: every vendor order moves Waiting for vendor response → Order Placed → In Transit → Delivered, each
// step recorded by whoever follows the orders up. When every order is delivered the PC moves the project to Execution.
export function WaitingForDeliveryStep({ project, users, user, saving, persist }: Props) {
  const work = project.procurementWork
  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'

  if (!work || work.vendors.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No vendor orders on this project yet.</p>
  }

  const statuses = work.vendors.map(v => vendorStatus(work, v))
  const delivered = statuses.filter(s => s === 'delivered').length
  const allDelivered = delivered === statuses.length
  const approvedIndent = [...(project.materialIndents ?? [])].reverse().find(s => s.decision === 'approved')
  const counts = (['sent', 'order_placed', 'in_transit', 'delivered'] as const)
    .map(s => ({ s, n: statuses.filter(x => x === s).length })).filter(c => c.n > 0)

  async function moveOn() {
    const pc = users.find(u => u.id === project.coordinatorId)
    await persist(
      { stage: 'execution', assignedRole: 'project_coordinator', assignedToId: pc?.id ?? project.coordinatorId, assignedToName: pc?.fullName ?? project.coordinatorName, pendingStageRequest: undefined },
      'PC moved the project to Execution — all vendor orders delivered', 'execution',
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
        <p className="text-xs text-slate-500">Procurer</p>
        <p className="text-sm font-bold text-slate-800">{work.procurerName}</p>
        <p className="text-xs text-slate-500">{delivered} of {statuses.length} delivered{counts.length > 0 ? ` · ${counts.map(c => `${c.n} ${VENDOR_STATUS_LABEL[c.s].toLowerCase()}`).join(' · ')}` : ''}</p>
      </div>
      {approvedIndent && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1.5">
          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Approved material indent {approvedIndent.indent.indentNo}</p>
          <MultiFileUploadField label="" files={approvedIndent.files} onChange={() => {}} readOnly />
        </div>
      )}
      <VendorOrdersPanel project={project} users={users} user={user} saving={saving} stage={STAGE} persist={persist} />
      {allDelivered && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">All delivered</p>
            <p className="text-sm text-emerald-700 mt-1">Every vendor order has reached the site.</p>
          </div>
          {isPc
            ? <button disabled={saving} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>Move to Execution</button>
            : <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to move the project to Execution.</p>}
        </>
      )}
    </div>
  )
}
