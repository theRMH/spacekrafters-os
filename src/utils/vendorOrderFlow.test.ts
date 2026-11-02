import { describe, it, expect } from 'vitest'
import { hasBeenSent, routeFor, vendorStatus } from './vendorOrderFlow'
import type { ManagedUser, ProcurementWork, VendorOrder, VendorOrderStatus } from '../types'

const vendor = (status?: VendorOrderStatus): VendorOrder => ({ id: 'v', poNumber: 'PO-1', name: 'V', gstin: '', phone: '', email: '', address: '', lines: [], status, createdAt: '', updatedAt: '' })
const work = (vendors: VendorOrder[], extra: Partial<ProcurementWork> = {}): ProcurementWork =>
  ({ procurerId: 'proc', procurerName: 'Procurer', assignedBy: 'PC', assignedAt: '', vendors, ...extra })
const users = [
  { id: 'pc', fullName: 'Coordinator', role: 'project_coordinator' }, { id: 'proc', fullName: 'Procurer', role: 'purchase' }, { id: 'snd', fullName: 'Sender', role: 'qs' },
] as ManagedUser[]
const project = { coordinatorId: 'pc', coordinatorName: 'Coordinator' }

describe('vendor order flow', () => {
  it('reads a vendor saved before per-vendor approval from the old whole-set review', () => {
    expect(vendorStatus({}, vendor())).toBe('draft')
    expect(vendorStatus({ review: { status: 'with_pc', submittedBy: '', submittedAt: '' } }, vendor())).toBe('with_pc')
    expect(vendorStatus({ review: { status: 'approved', submittedBy: '', submittedAt: '' } }, vendor())).toBe('approved')
    expect(vendorStatus({}, vendor('sent'))).toBe('sent')
  })

  it('counts an order as sent from "Waiting for vendor response" onwards', () => {
    expect(hasBeenSent('approved')).toBe(false)
    expect(['sent', 'order_placed', 'in_transit', 'delivered'].every(s => hasBeenSent(s as VendorOrderStatus))).toBe(true)
  })

  it('hands the project to the PC while any order waits for approval', () => {
    expect(routeFor(work([vendor('with_pc'), vendor('draft')]), project, users).assignedToId).toBe('pc')
  })

  it('hands it to the procurer while orders are drafts or rejected, then to the named sender', () => {
    expect(routeFor(work([vendor('rejected'), vendor('approved')]), project, users).assignedToId).toBe('proc')
    const sender = routeFor(work([vendor('approved'), vendor('sent')], { senderId: 'snd', senderName: 'Sender' }), project, users)
    expect(sender).toEqual({ assignedRole: 'qs', assignedToId: 'snd', assignedToName: 'Sender' })
    expect(routeFor(work([vendor('approved')]), project, users).assignedToId).toBe('proc')
  })

  it('hands the project back to the PC once every order is delivered', () => {
    expect(routeFor(work([vendor('delivered'), vendor('delivered')]), project, users).assignedToId).toBe('pc')
    expect(routeFor(work([vendor('delivered'), vendor('in_transit')]), project, users).assignedToId).toBe('proc')
  })
})
