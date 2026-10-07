import { describe, it, expect } from 'vitest'
import { parseLeadCsv, leadsToCsvText, LEAD_CSV_HEADERS } from './leadCsv'
import type { Lead } from '../types'

function csv(rows: string[]): string {
  return [LEAD_CSV_HEADERS.join(','), ...rows].join('\n')
}

describe('parseLeadCsv', () => {
  it('parses a fully valid SK row', () => {
    const rows = parseLeadCsv(csv(['Rajesh,9876543210,,Chennai,,SK,sk_interiors,,,,,walk_in,,hot,Raj Kamal']))
    expect(rows).toHaveLength(1)
    expect(rows[0].errors).toEqual([])
    expect(rows[0].input).toMatchObject({
      name: 'Rajesh', phone: '9876543210', city: 'Chennai', leadCodePrefix: 'SK',
      businessDivision: 'sk_interiors', source: 'walk_in', interest: 'hot', ownerNameRaw: 'Raj Kamal',
    })
  })

  it('flags missing required fields without crashing', () => {
    const rows = parseLeadCsv(csv([',,,,SiteOnly,,,,,,,,,,']))
    expect(rows[0].errors).toEqual(expect.arrayContaining([
      'Name is required', 'Phone is required', 'City is required', 'Owner Name is required', 'Type must be SK or FGD',
    ]))
    expect(rows[0].input).toBeUndefined()
  })

  it('auto-fills Business Division to fgd when Type is FGD, even if the column is blank', () => {
    const rows = parseLeadCsv(csv(['Harish,99999,,Bangalore,,FGD,,,siemens,,,walk_in,,medium,Raj']))
    expect(rows[0].errors).toEqual([])
    expect(rows[0].input?.businessDivision).toBe('fgd')
  })

  it('requires a Business Brand when the division is fgd', () => {
    const rows = parseLeadCsv(csv(['Harish,99999,,Bangalore,,FGD,,,,,,walk_in,,medium,Raj']))
    expect(rows[0].errors).toContain('Business Brand is required for FGD leads')
  })

  it('rejects an unrecognized Business Division rather than silently dropping it', () => {
    const rows = parseLeadCsv(csv(['A,1,,City,,SK,not_a_real_division,,,,,walk_in,,medium,Owner']))
    expect(rows[0].errors.some(e => e.includes('Unrecognized Business Division'))).toBe(true)
  })

  it('falls back unrecognized Source text to "other" + Sub Source instead of rejecting the row', () => {
    const rows = parseLeadCsv(csv(['A,1,,City,,SK,,,,,,Trade Show,,medium,Owner']))
    expect(rows[0].errors).toEqual([])
    expect(rows[0].input?.source).toBe('other')
    expect(rows[0].input?.subSource).toBe('Trade Show')
  })

  it('handles quoted fields containing commas', () => {
    const rows = parseLeadCsv(csv(['"Rajesh, Jr.",1,,"Anna Nagar, Chennai",,SK,,,,,,walk_in,,medium,Owner']))
    expect(rows[0].errors).toEqual([])
    expect(rows[0].name).toBe('Rajesh, Jr.')
    expect(rows[0].input?.city).toBe('Anna Nagar, Chennai')
  })

  it('defaults Interest to medium when blank or unrecognized', () => {
    const rows = parseLeadCsv(csv(['A,1,,City,,SK,,,,,,walk_in,,,Owner']))
    expect(rows[0].input?.interest).toBe('medium')
  })
})

describe('leadsToCsvText', () => {
  it('round-trips through parseLeadCsv', () => {
    const lead: Lead = {
      id: 'l1', name: 'Rajesh, Jr.', phone: '9876543210', city: 'Anna Nagar, Chennai',
      leadCodePrefix: 'SK', businessDivision: 'sk_interiors',
      source: 'walk_in', interest: 'hot', status: 'new',
      ownerName: 'Raj Kamal', slaDueAt: '2026-01-01T00:00:00.000Z', activity: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const text = leadsToCsvText([lead])
    const parsed = parseLeadCsv(text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].errors).toEqual([])
    expect(parsed[0].input).toMatchObject({ name: 'Rajesh, Jr.', phone: '9876543210', city: 'Anna Nagar, Chennai' })
  })
})
