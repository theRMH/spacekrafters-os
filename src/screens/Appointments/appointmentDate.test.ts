import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPastScheduledAt, toLocalInputValue, toProperIso, appointmentStage, mergeNote } from './appointmentDate'
import type { Appointment } from '../../types'

function baseAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt_1', leadId: 'lead_1', clientName: 'Test Client',
    scheduledAt: '2026-10-06T09:00:00.000Z', location: 'Chennai',
    coordinatorName: 'Raj Kamal', status: 'scheduled',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isPastScheduledAt', () => {
  afterEach(() => vi.useRealTimers())

  it('flags a time before now as past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T10:00:00.000Z'))
    expect(isPastScheduledAt('2026-10-06T09:00:00.000Z')).toBe(true)
  })

  it('does not flag a time after now as past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T10:00:00.000Z'))
    expect(isPastScheduledAt('2026-10-06T11:00:00.000Z')).toBe(false)
  })

  it('treats an unparseable value as not-past rather than throwing', () => {
    expect(isPastScheduledAt('not-a-date')).toBe(false)
  })
})

describe('toLocalInputValue', () => {
  it('round-trips a proper ISO string into a bare "YYYY-MM-DDTHH:mm" for the date/time fields', () => {
    const result = toLocalInputValue('2026-10-06T09:30:00.000Z')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('returns an empty string for an unparseable value instead of throwing', () => {
    expect(toLocalInputValue('not-a-date')).toBe('')
  })
})

// Regression coverage for the production bug: a reschedule's new date/time
// (built from DateField+TimeField as a bare "YYYY-MM-DDTHH:mm" string with no
// timezone) was being stored directly as rescheduledDate, and then copied
// straight into scheduledAt on MD approval, with no normalization anywhere in
// that path. A bare string is interpreted as local time by whichever
// device/server reads it back — inconsistent with every other scheduledAt in
// the app, which is always a proper "...Z" UTC ISO string. Confirmed live:
// every appointment that had gone through an MD-approved reschedule had a
// scheduledAt missing the "Z" suffix, while freshly-created appointments did
// not — this is the exact mechanism, and toProperIso() is the fix.
describe('toProperIso', () => {
  it('converts a bare date/time-field string into a proper UTC ISO string', () => {
    const result = toProperIso('2026-10-06T09:00')
    expect(result.endsWith('Z')).toBe(true)
    expect(() => new Date(result).toISOString()).not.toThrow()
  })

  it('preserves the instant when given an already-proper ISO string (safe to call defensively on existing data)', () => {
    const original = '2026-10-06T09:00:00.000Z'
    expect(toProperIso(original)).toBe(new Date(original).toISOString())
  })

  it('produces the same absolute instant as the browser would already resolve the bare string to', () => {
    const bare = '2026-10-06T09:00'
    expect(new Date(toProperIso(bare)).getTime()).toBe(new Date(bare).getTime())
  })
})

// Regression coverage for the Tasks-screen Appointment Status section — the
// stage is always derived from status + rescheduleRequestStatus, never a
// separate stored field, so these lock in the exact mapping against the real
// reschedule state machine in LeadStatusSheet.submitReschedule() (creates a
// request: status='rescheduled', rescheduleRequestStatus='requested') and
// MDTasksScreen.handleDecision() (approve: status='scheduled',
// rescheduleRequestStatus='accepted'; reject: status stays 'rescheduled',
// rescheduleRequestStatus='rejected').
describe('appointmentStage', () => {
  it('a plain scheduled appointment, never rescheduled, is "scheduled"', () => {
    expect(appointmentStage(baseAppointment({ status: 'scheduled' }))).toBe('scheduled')
  })

  it('a newly-requested reschedule is "pending"', () => {
    expect(appointmentStage(baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'requested' }))).toBe('pending')
  })

  it('an MD-rejected reschedule is "rejected"', () => {
    expect(appointmentStage(baseAppointment({ status: 'rescheduled', rescheduleRequestStatus: 'rejected' }))).toBe('rejected')
  })

  it('an MD-approved reschedule (status reverted to scheduled) is "approved"', () => {
    expect(appointmentStage(baseAppointment({ status: 'scheduled', rescheduleRequestStatus: 'accepted' }))).toBe('approved')
  })

  it('completed/cancelled take priority regardless of any reschedule history', () => {
    expect(appointmentStage(baseAppointment({ status: 'completed', rescheduleRequestStatus: 'accepted' }))).toBe('completed')
    expect(appointmentStage(baseAppointment({ status: 'cancelled', rescheduleRequestStatus: 'rejected' }))).toBe('cancelled')
  })
})

describe('mergeNote', () => {
  it('returns the existing notes unchanged when no new note is given', () => {
    expect(mergeNote('Original note', 'Cancelled', '')).toBe('Original note')
    expect(mergeNote('Original note', 'Cancelled', '   ')).toBe('Original note')
  })

  it('sets a fresh labeled note when there were no existing notes', () => {
    expect(mergeNote(undefined, 'Completed', 'All good')).toBe('Completed: All good')
  })

  it('appends to existing notes rather than overwriting them', () => {
    expect(mergeNote('Original note', 'Cancelled', 'Client backed out'))
      .toBe('Original note\n\nCancelled: Client backed out')
  })

  it('trims the new note before labeling it', () => {
    expect(mergeNote(undefined, 'Completed', '  tidy  ')).toBe('Completed: tidy')
  })
})
