import { describe, expect, it } from 'vitest'
import { coreStatus, leadStatusForQuotation, statusToSyncFromQuotation } from './leadPipeline'
import type { Quotation } from '../../types'

function quotation(status: Quotation['status']): Quotation {
  return {
    id: 'q1', leadId: 'l1', version: 1, status, sections: [],
    subtotal: 0, taxAmount: 0, netAmount: 0, createdBy: 'PC', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Quotation
}

// The lead's status follows its quotation step by step.
describe('leadStatusForQuotation', () => {
  it.each([
    ['draft', 'quotation_drafted'], ['internal_review', 'sent_to_md'], ['md_rejected', 'md_rejected'],
    ['internally_approved', 'internally_approved'], ['sent_to_client', 'sent_to_client'],
    ['revision_requested', 'client_rejected'], ['client_approved', 'client_approved'],
  ] as const)('quotation %s -> lead %s', (q, lead) => {
    expect(leadStatusForQuotation(q)).toBe(lead)
  })

  it('a dropped (rejected) quotation leaves the lead alone', () => {
    expect(leadStatusForQuotation('rejected')).toBeNull()
  })
})

// Guards the sync in LeadStatusSheet / quotationActions: the status follows the quotation, never backwards past its stage.
describe('statusToSyncFromQuotation', () => {
  it('no quotation -> nothing to sync', () => {
    expect(statusToSyncFromQuotation('requirements_captured', null)).toBeNull()
  })

  it('lead already matches -> nothing to sync', () => {
    expect(statusToSyncFromQuotation('sent_to_md', quotation('internal_review'))).toBeNull()
  })

  it('requirements done, quotation created -> Quotation Created', () => {
    expect(statusToSyncFromQuotation('requirements_captured', quotation('draft'))).toBe('quotation_drafted')
  })

  it('inside the quotation stage the status moves with each step, and can step back after an MD rejection', () => {
    expect(statusToSyncFromQuotation('quotation_drafted', quotation('internal_review'))).toBe('sent_to_md')
    expect(statusToSyncFromQuotation('sent_to_md', quotation('internally_approved'))).toBe('internally_approved')
    expect(statusToSyncFromQuotation('sent_to_md', quotation('md_rejected'))).toBe('md_rejected')
    expect(statusToSyncFromQuotation('md_rejected', quotation('draft'))).toBe('quotation_drafted')
  })

  it('client approval moves the lead on to Payment', () => {
    expect(statusToSyncFromQuotation('sent_to_client', quotation('client_approved'))).toBe('client_approved')
  })

  it('never moves a lead back out of Payment, or touches Project Created / Lost', () => {
    expect(statusToSyncFromQuotation('client_approved', quotation('sent_to_client'))).toBeNull()
    expect(statusToSyncFromQuotation('won', quotation('client_approved'))).toBeNull()
    expect(statusToSyncFromQuotation('lost', quotation('draft'))).toBeNull()
  })
})

// Older leads can still hold a retired status; it must map onto the stage it belongs to.
describe('coreStatus', () => {
  it.each([
    ['qualified', 'contacted'], ['site_visit_scheduled', 'contacted'],
    ['sent_to_md', 'quotation_drafted'], ['md_rejected', 'quotation_drafted'], ['client_rejected', 'quotation_drafted'],
    ['internally_approved', 'quotation_drafted'], ['design_in_progress', 'quotation_drafted'], ['design_approved', 'quotation_drafted'],
    ['sent_to_client', 'quotation_drafted'], ['negotiating', 'quotation_drafted'],
  ] as const)('%s -> %s', (from, to) => {
    expect(coreStatus(from)).toBe(to)
  })

  it.each(['new', 'contacted', 'site_visit_done', 'requirements_captured', 'quotation_drafted', 'client_approved', 'won', 'lost'] as const)(
    'stage %s is unchanged', status => {
      expect(coreStatus(status)).toBe(status)
    })
})
