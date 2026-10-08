// The single place a DesignPackage's PC/MD status actually changes — called
// by both DesignCenterScreen.tsx's own Detail sheet and the compact
// Lead-page status card (DesignStatusCard.tsx), so there is exactly one
// implementation of the transition + history + notify + Lead-advance logic.
import { upsertDesignPackage } from '../../services/designService'
import { getManagedUsersDirectory } from '../../services/userService'
import { sendNotification } from '../../utils/notifications'
import { approvalHistoryEntry } from '../../utils/approvalHistory'
import type { DesignPackage, DesignPackageStatus, Lead, AuthUser } from '../../types'

const DESIGN_HISTORY_LABEL: Partial<Record<DesignPackageStatus, string>> = {
  in_progress:         'Back to in progress',
  pending_pc_review:   'Submitted for PC review',
  internal_review:     'PC approved — sent to MD for approval',
  internally_approved: 'MD approved',
  sent_to_client:      'Sent to client',
  client_approved:     'Client approved',
  revision_requested:  'Revision requested',
}

interface ActionResult { ok: boolean; error?: string; updated?: DesignPackage }

export async function changeDesignStatus(params: {
  pkg: DesignPackage
  status: DesignPackageStatus
  user: AuthUser | null
  note?: string
  labelOverride?: string
  packageLabel?: string
  lead?: Lead
  updateLead?: (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
}): Promise<ActionResult> {
  const { pkg, status, user, note, labelOverride, packageLabel, lead, updateLead } = params
  const label = labelOverride ?? (status === 'rejected'
    ? (pkg.status === 'internal_review' ? 'MD rejected' : 'Client rejected')
    : DESIGN_HISTORY_LABEL[status] ?? status)
  const isRejection = status === 'rejected' || status === 'pc_rejected' || status === 'md_rejected'
  const updated: DesignPackage = {
    ...pkg, status,
    rejectionReason: isRejection ? note : undefined,
    statusHistory: [...(pkg.statusHistory ?? []), approvalHistoryEntry(status, label, user, note)],
    updatedAt: new Date().toISOString(),
  }
  const result = await upsertDesignPackage(updated)
  if (!result.ok) return { ok: false, error: result.error }

  if (status === 'pending_pc_review') await notifyPcPending(updated, packageLabel, user?.id)
  if (status === 'internal_review') await notifyMdPending(updated, packageLabel, user?.id)
  if (status === 'pc_rejected' && note) await notifyDesignerRevision(updated, note, packageLabel, user?.id)

  if (lead && updateLead) {
    if (status === 'internally_approved' && lead.status === 'design_in_progress') {
      await updateLead(lead.id, { status: 'design_approved' }, 'MD approved the design')
    } else if (status === 'sent_to_client' && lead.status === 'design_approved') {
      await updateLead(lead.id, { status: 'sent_to_client' }, 'Design sent to client')
    }
  }

  return { ok: true, updated }
}

async function notifyMdPending(pkg: DesignPackage, packageLabel: string | undefined, excludeId: string | undefined) {
  const mdIds = (await getManagedUsersDirectory()).filter(u => u.role === 'owner' && u.id !== excludeId).map(u => u.id)
  await sendNotification(mdIds, 'Design Pending MD Approval', `"${pkg.name}" (${packageLabel ?? pkg.leadId ?? pkg.projectId}) is waiting for your approval.`)
}
async function notifyPcPending(pkg: DesignPackage, packageLabel: string | undefined, excludeId: string | undefined) {
  const pcIds = (await getManagedUsersDirectory()).filter(u => u.role === 'project_coordinator' && u.id !== excludeId).map(u => u.id)
  await sendNotification(pcIds, 'Design Pending PC Review', `"${pkg.name}" (${packageLabel ?? pkg.leadId ?? pkg.projectId}) is waiting for PC review.`)
}
async function notifyDesignerRevision(pkg: DesignPackage, reason: string, packageLabel: string | undefined, excludeId: string | undefined) {
  const creatorId = (await getManagedUsersDirectory()).find(u => u.fullName === pkg.createdBy)?.id
  if (!creatorId || creatorId === excludeId) return
  await sendNotification([creatorId], 'Design Sent Back for Revision', `"${pkg.name}" (${packageLabel ?? pkg.leadId ?? pkg.projectId}) needs revision: ${reason}`)
}
