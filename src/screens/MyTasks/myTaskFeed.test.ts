import { describe, it, expect, vi } from 'vitest'
import { buildMyTaskFeed } from './myTaskFeed'
import type { AuthUser, Lead } from '../../types'

// myTaskFeed.ts imports LEAD_STATUS_LABEL from LeadStatusSheet.tsx, which
// transitively pulls in the real Supabase client — see pipelineStage.test.ts
// for why that crashes in vitest's node environment without this.
vi.mock('../../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

const user: AuthUser = { id: 'u1', name: 'Mohammed Fazil', role: 'designer', initials: 'MF', email: 'mf@example.com' }

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', name: 'Test Lead', phone: '9000000000', city: 'Chennai',
    source: 'walk_in', interest: 'medium', status: 'new', ownerName: 'Someone',
    slaDueAt: '2026-01-01T00:00:00.000Z', activity: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const emptyOpts = { projects: [], tasks: [], mrfs: [], appointments: [], siteVisits: [], dailyReports: [] }

describe('buildMyTaskFeed — Lead bucket', () => {
  it('includes a lead the user owns (ownerId) even with no assignedToId yet', () => {
    const lead = baseLead({ ownerId: 'u1', assignedToId: undefined })
    const items = buildMyTaskFeed({ user, leads: [lead], ...emptyOpts })
    expect(items.some(i => i.key === 'lead-l1')).toBe(true)
  })

  it('includes a lead the user is the current stage-assignee for (assignedToId), even if owned by someone else', () => {
    const lead = baseLead({ ownerId: 'someone-else', assignedToId: 'u1' })
    const items = buildMyTaskFeed({ user, leads: [lead], ...emptyOpts })
    expect(items.some(i => i.key === 'lead-l1')).toBe(true)
  })

  it('excludes a lead that is neither owned by nor assigned to the user', () => {
    const lead = baseLead({ ownerId: 'someone-else', assignedToId: 'another-person' })
    const items = buildMyTaskFeed({ user, leads: [lead], ...emptyOpts })
    expect(items.some(i => i.key === 'lead-l1')).toBe(false)
  })
})
