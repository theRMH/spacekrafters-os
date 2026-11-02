import { describe, it, expect } from 'vitest'
import { hasBeenSent, routeFor, senderOf, vendorStatus } from './vendorOrderFlow'
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

  it('hands it to the PC while an order is approved but not yet sent on to the procurer', () => {
    expect(routeFor(work([vendor('approved'), vendor('sent')]), project, users).assignedToId).toBe('pc')
  })

  it('hands it to the procurer while orders are drafts or rejected', () => {
    expect(routeFor(work([vendor('rejected'), vendor('sent')]), project, users).assignedToId).toBe('proc')
  })

  it('hands it to the person the PC handed the order to, else the procurer', () => {
    const named = { ...vendor('with_procurer'), sendById: 'snd', sendByName: 'Sender' }
    expect(routeFor(work([named]), project, users)).toEqual({ assignedRole: 'qs', assignedToId: 'snd', assignedToName: 'Sender' })
    expect(routeFor(work([vendor('with_procurer')]), project, users).assignedToId).toBe('proc')
    expect(senderOf(work([]), named)).toEqual({ id: 'snd', name: 'Sender' })
  })

  it('hands the project back to the PC once every order is delivered', () => {
    expect(routeFor(work([vendor('delivered'), vendor('delivered')]), project, users).assignedToId).toBe('pc')
    expect(routeFor(work([vendor('delivered'), vendor('in_transit')]), project, users).assignedToId).toBe('proc')
  })
})
