import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideAppointmentReschedule, decideRescheduleAndAdvanceLead, updateAppointmentStatus } from './appointmentActions'
import type { Appointment, Lead } from '../../types'

vi.mock('../../services/appointmentService', () => ({
  updateAppointment: vi.fn(async () => ({ ok: true })),
}))
// decideRescheduleAndAdvanceLead (added alongside decideAppointmentReschedule
// in this file) pulls in sendNotification, which transitively imports the
// Supabase client — crashes in vitest's Node environment without this, same
// as every other test file here that ends up importing a real screen.
vi.mock('../../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('../../utils/notifications', () => ({ sendNotification: vi.fn(async () => {}) }))

function baseAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt_1', leadId: 'lead_1', clientName: 'Test Client',
    scheduledAt: '2026-10-06T09:00:00.000Z', location: 'Chennai',
    coordinatorName: 'Raj Kamal', status: 'scheduled',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1', name: 'Test Lead', phone: '9000000000', city: 'Chennai',
    source: 'walk_in', interest: 'medium', status: 'qualified', ownerName: 'Someone',
    slaDueAt: '2026-01-01T00:00:00.000Z', activity: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

// Locks in the exact field writes against what MDTasksScreen.tsx's
// handleDecision() actually writes today (verified by direct code read) — the
// Tasks screen's in-page mini-flow must never drift from those semantics,
// since there is deliberately only one appointment-decision workflow, just
// two UI entry points into it (/md-tasks and the in-page Tasks sheet).
describe('decideAppointmentReschedule', () => {
  it('on approve: reverts status to scheduled, adopts rescheduledDate as the new scheduledAt, marks accepted', async () => {
    const appt = baseAppointment({
      status: 'rescheduled', rescheduleReason: 'moved', rescheduleRequestStatus: 'requested',
      rescheduledDate: '2026-10-10T09:00:00.000Z', rescheduleRequestedBy: 'Raj Kamal',
    })
    const result = await decideAppointmentReschedule(appt, true, 'Looks fine', 'M. Nirmal Kumar', 'owner')
    expect(result.updated).toMatchObject({
      status: 'scheduled',
      scheduledAt: '2026-10-10T09:00:00.000Z',
      rescheduleRequestStatus: 'accepted',
      rescheduleAcceptedBy: 'M. Nirmal Kumar',
    })
    expect(result.updated?.rescheduleHistory).toHaveLength(1)
    expect(result.updated?.rescheduleHistory?.[0]).toMatchObject({ decision: 'accepted', by: 'M. Nirmal Kumar', note: 'Looks fine' })
  })

  it('on reject: status is left exactly as it was, marks rejected, still appends to history', async () => {
    const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested', rescheduleReason: 'moved' })
    const result = await decideAppointmentReschedule(appt, false, '', 'M. Nirmal Kumar', 'owner')
    expect(result.updated).toMatchObject({ status: 'rescheduled', rescheduleRequestStatus: 'rejected', rescheduleAcceptedBy: undefined })
    expect(result.updated?.rescheduleHistory?.[0]).toMatchObject({ decision: 'rejected' })
  })

  it('on approve with no rescheduledDate on record, keeps the original scheduledAt unchanged', async () => {
    const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested', scheduledAt: '2026-10-06T09:00:00.000Z' })
    const result = await decideAppointmentReschedule(appt, true, '', 'M. Nirmal Kumar', 'owner')
    expect(result.updated?.scheduledAt).toBe('2026-10-06T09:00:00.000Z')
  })
})

// Regression coverage for the fix reported via screenshot: approving a
// reschedule used to also silently push the Lead to 'site_visit_scheduled',
// removing the Complete/Rescheduled choice. An accepted reschedule only
// confirms a new appointment date now — lead.status is never written by
// this function, approved or not.
describe('decideRescheduleAndAdvanceLead', () => {
  it('on approve: updates the appointment but never calls updateLead with a status change', async () => {
    const appt = baseAppointment({
      status: 'rescheduled', rescheduleRequestStatus: 'requested', rescheduleReason: 'moved',
      rescheduledDate: '2026-10-10T09:00:00.000Z',
    })
    const lead = baseLead({ status: 'qualified' })
    const updateLead = vi.fn(async (_id: string, _updates: Partial<Lead>, _note?: string) => ({ ok: true }))
    const result = await decideRescheduleAndAdvanceLead({
      appt, approved: true, notes: 'Looks fine', lead, decidedByName: 'M. Nirmal Kumar', decidedByRole: 'owner', updateLead,
    })
    expect(result.ok).toBe(true)
    expect(updateLead).toHaveBeenCalledTimes(1)
    const [, updates] = updateLead.mock.calls[0]
    expect(updates).not.toHaveProperty('status')
  })

  it('on reject: still records the decision via updateLead, never touches lead.status', async () => {
    const appt = baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested' })
    const lead = baseLead({ status: 'qualified' })
    const updateLead = vi.fn(async (_id: string, _updates: Partial<Lead>, _note?: string) => ({ ok: true }))
    await decideRescheduleAndAdvanceLead({
      appt, approved: false, notes: '', lead, decidedByName: 'M. Nirmal Kumar', decidedByRole: 'owner', updateLead,
    })
    const [, updates] = updateLead.mock.calls[0]
    expect(updates).not.toHaveProperty('status')
  })
})

describe('updateAppointmentStatus', () => {
  it('sets the new status and appends a statusHistory entry with who/when/note', async () => {
    const appt = baseAppointment({ status: 'scheduled' })
    const result = await updateAppointmentStatus(appt, 'completed', 'Santhosh', 'site_engineer', 'Done')
    expect(result.updated?.status).toBe('completed')
    expect(result.updated?.statusHistory).toHaveLength(1)
    expect(result.updated?.statusHistory?.[0]).toMatchObject({
      status: 'completed', label: 'Completed', by: 'Santhosh', byRole: 'site_engineer', note: 'Done',
    })
  })

  it('appends to existing statusHistory rather than replacing it', async () => {
    const appt = baseAppointment({
      status: 'scheduled',
      statusHistory: [{ status: 'scheduled', label: 'Scheduled', by: 'Raj Kamal', at: '2026-10-01T00:00:00.000Z' }],
    })
    const result = await updateAppointmentStatus(appt, 'cancelled', 'Santhosh')
    expect(result.updated?.statusHistory).toHaveLength(2)
  })
})
