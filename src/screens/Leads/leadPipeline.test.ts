import { describe, expect, it } from 'vitest'
import { coreStatus, impliedMinLeadStatus } from './leadPipeline'
import type { Quotation } from '../../types'

function quotation(status: Quotation['status']): Quotation {
  return {
    id: 'q1', leadId: 'l1', version: 1, status, sections: [],
    subtotal: 0, taxAmount: 0, netAmount: 0, createdBy: 'PC', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Quotation
}

// Guards the self-healing catch-up in LeadStatusSheet: a lead whose quotation has moved on must not stay behind.
describe('impliedMinLeadStatus', () => {
  it('no quotation -> no implied minimum', () => {
    expect(impliedMinLeadStatus(null)).toBeNull()
  })

  it.each(['draft', 'internal_review', 'md_rejected', 'internally_approved', 'sent_to_client', 'revision_requested'] as const)(
    'quotation %s -> quotation_drafted', status => {
      expect(impliedMinLeadStatus(quotation(status))).toBe('quotation_drafted')
    })

  it('quotation client_approved -> client_approved', () => {
    expect(impliedMinLeadStatus(quotation('client_approved'))).toBe('client_approved')
  })
})

// Older leads can still hold a retired status; it must map onto the stage it belongs to.
describe('coreStatus', () => {
  it.each([
    ['qualified', 'contacted'], ['site_visit_scheduled', 'contacted'],
    ['internally_approved', 'quotation_drafted'], ['design_in_progress', 'quotation_drafted'], ['design_approved', 'quotation_drafted'],
    ['sent_to_client', 'quotation_drafted'], ['negotiating', 'quotation_drafted'],
  ] as const)('%s -> %s', (from, to) => {
    expect(coreStatus(from)).toBe(to)
  })

  it.each(['new', 'contacted', 'site_visit_done', 'requirements_captured', 'quotation_drafted', 'client_approved', 'won', 'lost'] as const)(
    'current stage %s is unchanged', status => {
      expect(coreStatus(status)).toBe(status)
    })
})
