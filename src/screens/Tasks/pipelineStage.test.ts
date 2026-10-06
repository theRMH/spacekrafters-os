import { describe, it, expect, vi } from 'vitest'
import { pipelineStage, pipelineBucket, pipelineStageLabel } from './pipelineStage'
import type { Lead, Appointment, Project } from '../../types'

// This module transitively imports LeadStatusSheet.tsx/ProjectStatusSheet.tsx
// for their label maps, which pull in real service modules that import the
// Supabase client singleton. That client auto-instantiates at module-load
// time (including a background auto-refresh timer) whenever the real env
// vars are present, which crashes in vitest's default node environment (no
// `window`) — unrelated to anything under test here, so stub it out.
vi.mock('../../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1', name: 'Test Lead', phone: '9000000000', city: 'Chennai',
    source: 'walk_in', interest: 'hot', status: 'new', ownerName: 'Raj Kamal',
    slaDueAt: '2026-10-10T00:00:00.000Z', activity: [],
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function baseAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt_1', leadId: 'lead_1', clientName: 'Test Lead',
    scheduledAt: '2026-10-06T09:00:00.000Z', location: 'Chennai',
    coordinatorName: 'Raj Kamal', status: 'scheduled',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1', name: 'Test Project', leadId: 'lead_1',
    coordinatorId: 'u1', clientName: 'Test Lead', clientPhone: '9000000000',
    coordinatorName: 'Raj Kamal', stage: 'advance_payment', status: 'active',
    ...overrides,
  } as Project
}

describe('pipelineStage', () => {
  it('passes through every plain LeadStatus unchanged (not qualified/won)', () => {
    expect(pipelineStage(baseLead({ status: 'new' }), [], [])).toBe('new')
    expect(pipelineStage(baseLead({ status: 'site_visit_scheduled' }), [], [])).toBe('site_visit_scheduled')
    expect(pipelineStage(baseLead({ status: 'client_approved' }), [], [])).toBe('client_approved')
    expect(pipelineStage(baseLead({ status: 'lost' }), [], [])).toBe('lost')
  })

  it('lost always wins, even with appointment/project data present', () => {
    const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested' })
    expect(pipelineStage(baseLead({ status: 'lost' }), [appt], [])).toBe('lost')
  })

  describe('qualified refinement', () => {
    it('no appointments at all → qualified_no_appointment', () => {
      expect(pipelineStage(baseLead({ status: 'qualified' }), [], [])).toBe('qualified_no_appointment')
    })

    it('only a cancelled appointment exists → treated as no appointment, same as LeadStatusSheet', () => {
      const appt = baseAppointment({ status: 'cancelled' })
      expect(pipelineStage(baseLead({ status: 'qualified' }), [appt], [])).toBe('qualified_no_appointment')
    })

    it('a cancelled appointment plus an older real one → uses the real one, not "no appointment"', () => {
      const older = baseAppointment({ id: 'appt_old', status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z' })
      const cancelled = baseAppointment({ id: 'appt_new', status: 'cancelled', createdAt: '2026-10-01T00:00:00.000Z' })
      expect(pipelineStage(baseLead({ status: 'qualified' }), [cancelled, older], [])).toBe('qualified_scheduled')
    })

    it('a pending reschedule request → qualified_pending_approval', () => {
      const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested' })
      expect(pipelineStage(baseLead({ status: 'qualified' }), [appt], [])).toBe('qualified_pending_approval')
    })

    it('a rejected reschedule request → qualified_rejected', () => {
      const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'rejected' })
      expect(pipelineStage(baseLead({ status: 'qualified' }), [appt], [])).toBe('qualified_rejected')
    })

    it('a plain scheduled appointment → qualified_scheduled', () => {
      const appt = baseAppointment({ status: 'scheduled' })
      expect(pipelineStage(baseLead({ status: 'qualified' }), [appt], [])).toBe('qualified_scheduled')
    })
  })

  describe('won refinement', () => {
    it('won with no matching project → won_pending_project', () => {
      expect(pipelineStage(baseLead({ status: 'won' }), [], [])).toBe('won_pending_project')
    })

    it('won with a matching project → project_<stage>, the project takes over entirely', () => {
      const project = baseProject({ stage: 'execution' })
      expect(pipelineStage(baseLead({ status: 'won' }), [], [project])).toBe('project_execution')
    })

    it('won with only a product_sale project for this lead → still won_pending_project (excluded)', () => {
      const project = baseProject({ type: 'product_sale' })
      expect(pipelineStage(baseLead({ status: 'won' }), [], [project])).toBe('won_pending_project')
    })

    it("a project belonging to a different lead doesn't match", () => {
      const project = baseProject({ leadId: 'some_other_lead' })
      expect(pipelineStage(baseLead({ status: 'won' }), [], [project])).toBe('won_pending_project')
    })
  })
})

describe('pipelineBucket', () => {
  it('groups every stage into the expected bucket', () => {
    expect(pipelineBucket('new')).toBe('lead')
    expect(pipelineBucket('contacted')).toBe('lead')
    expect(pipelineBucket('qualified_no_appointment')).toBe('qualified')
    expect(pipelineBucket('qualified_pending_approval')).toBe('qualified')
    expect(pipelineBucket('site_visit_scheduled')).toBe('site_visit')
    expect(pipelineBucket('site_visit_done')).toBe('site_visit')
    expect(pipelineBucket('requirements_captured')).toBe('requirements_quotation')
    expect(pipelineBucket('client_approved')).toBe('requirements_quotation')
    expect(pipelineBucket('won_pending_project')).toBe('won_pending_project')
    expect(pipelineBucket('project_advance_payment')).toBe('project')
    expect(pipelineBucket('project_closed')).toBe('project')
    expect(pipelineBucket('lost')).toBe('lost')
  })
})

describe('pipelineStageLabel', () => {
  it('labels synthetic stages with a readable description', () => {
    expect(pipelineStageLabel('qualified_no_appointment')).toBe('Qualified — No Appointment')
    expect(pipelineStageLabel('qualified_pending_approval')).toBe('Pending MD Approval')
    expect(pipelineStageLabel('won_pending_project')).toBe('Won — Project Pending')
  })

  it('labels project_<stage> via the real PROJECT_STAGE_LABEL map', () => {
    expect(pipelineStageLabel('project_advance_payment')).toBe('Advance Payment')
    expect(pipelineStageLabel('project_closed')).toBe('Closed')
  })

  it('labels plain LeadStatus passthrough values via the real LEAD_STATUS_LABEL map', () => {
    expect(pipelineStageLabel('new')).toBe('New')
    expect(pipelineStageLabel('lost')).toBe('Lost')
  })
})
