import { getFileUrl } from './fileStorage'
import type { ManagedUser, Project, ProcurementWork, VendorOrder, VendorOrderLogItem, VendorOrderStatus } from '../types'

export const VENDOR_STATUS_LABEL: Record<VendorOrderStatus, string> = {
  draft: 'Draft',
  with_pc: 'Waiting for PC approval',
  rejected: 'Rejected by PC',
  approved: 'Approved — ready to send',
  sent: 'Waiting for vendor response',
  order_placed: 'Order Placed',
  in_transit: 'In Transit',
  delivered: 'Delivered',
}

export const VENDOR_STATUS_TINT: Record<VendorOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  with_pc: 'bg-amber-50 text-amber-700',
  rejected: 'bg-red-50 text-red-700',
  approved: 'bg-sky-50 text-sky-700',
  sent: 'bg-violet-50 text-violet-700',
  order_placed: 'bg-indigo-50 text-indigo-700',
  in_transit: 'bg-orange-50 text-orange-700',
  delivered: 'bg-emerald-50 text-emerald-700',
}

// Position in the order's journey; "has been sent" means rank >= SENT_RANK.
const RANK: Record<VendorOrderStatus, number> = { draft: 0, rejected: 0, with_pc: 1, approved: 2, sent: 3, order_placed: 4, in_transit: 5, delivered: 6 }
export const hasBeenSent = (s: VendorOrderStatus) => RANK[s] >= RANK.sent

// A vendor saved before per-vendor approval has no status: it takes the old whole-set review's outcome.
export function vendorStatus(work: Pick<ProcurementWork, 'review'>, v: Pick<VendorOrder, 'status'>): VendorOrderStatus {
  if (v.status) return v.status
  const r = work.review?.status
  return r === 'with_pc' ? 'with_pc' : r === 'approved' ? 'approved' : r === 'rejected' ? 'rejected' : 'draft'
}

export function logEntry(status: VendorOrderStatus, label: string, by: string, note?: string, via?: 'whatsapp' | 'email'): VendorOrderLogItem {
  return { status, label, by, at: new Date().toISOString(), note: note || undefined, via }
}

export type Assignee = { assignedRole: Project['assignedRole']; assignedToId?: string; assignedToName?: string }

// Whose turn the project is, from the vendors' statuses: the PC while any order waits for approval or all are delivered; otherwise the
// person who sends / follows up (the named sender, else the procurer) while orders are approved or on their way; the
// procurer while orders are drafts or were rejected.
export function routeFor(work: ProcurementWork, project: Pick<Project, 'coordinatorId' | 'coordinatorName'>, users: ManagedUser[]): Assignee {
  const statuses = work.vendors.map(v => vendorStatus(work, v))
  const person = (id: string, name: string): Assignee => ({ assignedRole: users.find(u => u.id === id)?.role ?? 'purchase', assignedToId: id, assignedToName: name })
  if (statuses.includes('with_pc')) {
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    return { assignedRole: 'project_coordinator', assignedToId: pc?.id ?? project.coordinatorId, assignedToName: pc?.fullName ?? project.coordinatorName }
  }
  // Everything delivered: the PC moves the project on.
  if (statuses.length > 0 && statuses.every(s => s === 'delivered')) {
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    return { assignedRole: 'project_coordinator', assignedToId: pc?.id ?? project.coordinatorId, assignedToName: pc?.fullName ?? project.coordinatorName }
  }
  if (statuses.some(s => s === 'draft' || s === 'rejected')) return person(work.procurerId, work.procurerName)
  return person(work.senderId ?? work.procurerId, work.senderName ?? work.procurerName)
}

// Opens the vendor's WhatsApp chat with the order message and the PO PDF link ready (wa.me). Call it straight from the
// click so the browser doesn't block the window. Returns false when the vendor has no phone number.
export function openVendorWhatsApp(vendor: Pick<VendorOrder, 'name' | 'phone' | 'poNumber' | 'pdf'>, projectName: string): boolean {
  const digits = vendor.phone.replace(/\D/g, '')
  if (digits.length < 10) return false
  const fileUrl = vendor.pdf ? getFileUrl(vendor.pdf) : undefined
  const link = fileUrl ? new URL(fileUrl, window.location.origin).href : ''
  const text = `Hi ${vendor.name}, please find purchase order ${vendor.poNumber} for ${projectName}.${link ? `\n${link}` : ''}`
  const intl = digits.length === 10 ? `91${digits}` : digits
  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  return true
}
