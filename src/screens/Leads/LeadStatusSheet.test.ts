import { describe, it, expect } from 'vitest'
import { impliedMinLeadStatus } from './LeadStatusSheet'
import type { DesignPackage, Quotation } from '../../types'

// LeadStatusSheet.tsx transitively imports DesignCenterScreen.tsx/
// QuotationsScreen.tsx, which pull in the real Supabase client — see
// pipelineStage.test.ts for why that crashes in vitest's node environment
// without this.
import { vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

function baseQuotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q1', leadId: 'l1', version: 1, status: 'draft', sections: [],
    subtotal: 0, taxAmount: 0, netAmount: 0, createdBy: 'QS', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Quotation
}
function baseDesign(overrides: Partial<DesignPackage> = {}): DesignPackage {
  return {
    id: 'd1', leadId: 'l1', name: 'Pkg', status: 'in_progress',
    createdBy: 'Designer', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DesignPackage
}

// Guards the self-healing catch-up in LeadStatusSheet.tsx's fetch effect —
// without this, a Lead whose linked Quotation/Design has progressed past
// where Lead.status still sits gets permanently stuck (the exact bug this
// was written to fix: a Lead stuck at "Quotation Drafted" despite its real
// Quotation being Client Approved and its Design being MD Approved).
describe('impliedMinLeadStatus', () => {
  it('no quotation, no design -> no implied minimum', () => {
    expect(impliedMinLeadStatus(null, null)).toBeNull()
  })

  it('quotation still pending PC/MD -> quotation_drafted', () => {
    expect(impliedMinLeadStatus(baseQuotation({ status: 'pending_pc_review' }), null)).toBe('quotation_drafted')
  })

  it('quotation internally_approved -> internally_approved', () => {
    expect(impliedMinLeadStatus(baseQuotation({ status: 'internally_approved' }), null)).toBe('internally_approved')
  })

  it('quotation client_approved, no design -> sent_to_client (quotation-only flow completes on its own)', () => {
    expect(impliedMinLeadStatus(baseQuotation({ status: 'client_approved' }), null)).toBe('sent_to_client')
  })

  it('quotation client_approved, design still in progress -> capped at internally_approved, design wins via its own branch', () => {
    const result = impliedMinLeadStatus(baseQuotation({ status: 'client_approved' }), baseDesign({ status: 'in_progress' }))
    expect(result).toBe('design_in_progress')
  })

  it('design internally_approved (MD approved) -> design_approved, even with an earlier-stage quotation reading', () => {
    const result = impliedMinLeadStatus(baseQuotation({ status: 'client_approved' }), baseDesign({ status: 'internally_approved' }))
    expect(result).toBe('design_approved')
  })

  it('design sent_to_client -> sent_to_client', () => {
    expect(impliedMinLeadStatus(null, baseDesign({ status: 'sent_to_client' }))).toBe('sent_to_client')
  })

  it('design still pending_pc_review -> design_in_progress', () => {
    expect(impliedMinLeadStatus(null, baseDesign({ status: 'pending_pc_review' }))).toBe('design_in_progress')
  })
})
