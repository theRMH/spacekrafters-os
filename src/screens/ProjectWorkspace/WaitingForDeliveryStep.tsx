import { useState } from 'react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { sendNotification } from '../../utils/notifications'
import { ROLE_LABELS } from '../../data/permissions'
import { VendorOrdersPanel } from './VendorOrdersPanel'
import { VENDOR_STATUS_LABEL, vendorStatus } from '../../utils/vendorOrderFlow'
import type { AuthUser, ManagedUser, Project, ProjectStage } from '../../types'

const STAGE: ProjectStage = 'waiting_for_delivery'

// The title a project shows in My Tasks while it sits in Waiting for Delivery (it follows whose turn it is).
export function waitingForDeliveryTaskTitle(project: Project): string {
  const work = project.procurementWork
  if (!work || work.vendors.length === 0) return 'Follow Up Vendor Orders'
  return work.vendors.every(v => vendorStatus(work, v) === 'delivered') ? 'Assign Site Engineer & Move to Execution' : 'Follow Up Vendor Orders'
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
  const [siteEngineerId, setSiteEngineerId] = useState('')
  const [error, setError] = useState('')
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

  // The PC picks the site engineer who runs Execution; the project is assigned to them, so it shows in their My Tasks.
  async function moveOn() {
    const person = users.find(u => u.id === siteEngineerId)
    if (!person) { setError('Choose the site engineer for Execution.'); return }
    const updated = await persist(
      { stage: 'execution', assignedRole: person.role, assignedToId: person.id, assignedToName: person.fullName, pendingStageRequest: undefined },
      `PC moved the project to Execution — assigned to ${person.fullName}`, 'execution',
    )
    if (updated) await sendNotification([person.id], 'Execution Assigned', `${project.name} — you have been assigned Execution.`, `/my-tasks/project/${project.id}`)
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
          {isPc ? (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Site Engineer for Execution *</label>
                <select value={siteEngineerId} onChange={e => setSiteEngineerId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">— Select —</option>
                  {[...users].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
                </select>
              </div>
              {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
              <button disabled={saving || !siteEngineerId} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>Assign Site Engineer & Move to Execution</button>
            </>
          ) : <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to assign a site engineer and move the project to Execution.</p>}
        </>
      )}
    </div>
  )
}
