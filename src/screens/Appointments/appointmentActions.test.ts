import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideAppointmentReschedule, updateAppointmentStatus } from './appointmentActions'
import { upsertAppointment } from '../../services/appointmentService'
import type { Appointment } from '../../types'

vi.mock('../../services/appointmentService', () => ({
  upsertAppointment: vi.fn(async () => ({ ok: true })),
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
