// CSV export/import for the Leads list — plain CSV (no library), matching
// the same hand-written-parser convention already used for bank-statement
// CSVs (StatementImportScreen.tsx), just with quoted-field support added
// since lead data (addresses, notes) routinely contains commas.
import type { Lead, LeadSource, LeadInterest, BusinessDivision, BusinessCategory, BusinessBrand, LeadCodePrefix } from '../types'

export const LEAD_CSV_HEADERS = [
  'Name', 'Phone', 'Email', 'City', 'Site No', 'Type (SK/FGD)',
  'Business Division', 'Business Category', 'Business Brand',
  'Requirement', 'Notes', 'Source', 'Sub Source', 'Interest', 'Owner Name',
] as const

const VALID_DIVISIONS: BusinessDivision[] = ['fgd', 'first_property_contractors', 'sk_constructions', 'sk_interiors', 'sk_turnkey_interiors']
const VALID_CATEGORIES: BusinessCategory[] = ['residential', 'commercial', 'industrial']
const VALID_BRANDS: BusinessBrand[] = ['kitchenaid', 'bosch', 'siemens', 'gaggenau']
const VALID_SOURCES: LeadSource[] = [
  'existing_client', 'md_reference', 'ed_reference', 'google', 'instagram', 'facebook', 'walk_in',
  'client_reference', 'cold_call', 'bni', 'referral', 'whatsapp', 'online', 'website', 'social_media', 'exhibition', 'other',
]
const VALID_INTERESTS: LeadInterest[] = ['hot', 'medium', 'cold']

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

// Minimal RFC4180-style parser — handles quoted fields (with "" escaping)
// and commas/newlines inside quotes, which a plain split(',') breaks on.
function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const chars = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (inQuotes) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

function csvField(v: string | undefined): string {
  const s = v ?? ''
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ParsedLeadInput {
  name: string; phone: string; email?: string; city: string; siteNo?: string
  leadCodePrefix: LeadCodePrefix
  businessDivision?: BusinessDivision; businessCategory?: BusinessCategory; businessBrand?: BusinessBrand
  requirement?: string; notes?: string
  source: LeadSource; subSource?: string
  interest: LeadInterest
  ownerNameRaw: string
}

export interface ParsedLeadRow {
  rowNumber: number // 1-indexed, counting the header row, for human-readable error messages
  name: string
  phone: string
  errors: string[]
  input?: ParsedLeadInput
}

export function parseLeadCsv(text: string): ParsedLeadRow[] {
  const rows = parseCsvText(text)
  if (rows.length === 0) return []
  const header = rows[0].map(norm)
  const col = (label: string) => header.indexOf(norm(label))
  const idx = {
    name: col('Name'), phone: col('Phone'), email: col('Email'), city: col('City'),
    siteNo: col('Site No'), type: col('Type (SK/FGD)'),
    division: col('Business Division'), category: col('Business Category'), brand: col('Business Brand'),
    requirement: col('Requirement'), notes: col('Notes'),
    source: col('Source'), subSource: col('Sub Source'), interest: col('Interest'), owner: col('Owner Name'),
  }
  const get = (cols: string[], i: number) => (i >= 0 ? (cols[i] ?? '').trim() : '')

  return rows.slice(1).map((cols, i): ParsedLeadRow => {
    const rowNumber = i + 2
    const name = get(cols, idx.name)
    const phone = get(cols, idx.phone)
    const city = get(cols, idx.city)
    const ownerNameRaw = get(cols, idx.owner)
    const typeRaw = get(cols, idx.type).toUpperCase()
    const errors: string[] = []
    if (!name) errors.push('Name is required')
    if (!phone) errors.push('Phone is required')
    if (!city) errors.push('City is required')
    if (!ownerNameRaw) errors.push('Owner Name is required')
    if (typeRaw !== 'SK' && typeRaw !== 'FGD') errors.push('Type must be SK or FGD')

    // FGD leads always belong to the 'fgd' division, same auto-fill the
    // manual Add Lead form applies when Type is set to FGD.
    let businessDivision: BusinessDivision | undefined
    const divisionRaw = get(cols, idx.division)
    if (typeRaw === 'FGD') {
      businessDivision = 'fgd'
    } else if (divisionRaw) {
      const match = VALID_DIVISIONS.find(d => norm(d) === norm(divisionRaw))
      if (!match) errors.push(`Unrecognized Business Division "${divisionRaw}"`)
      else businessDivision = match
    }

    let businessCategory: BusinessCategory | undefined
    const categoryRaw = get(cols, idx.category)
    if (categoryRaw) {
      const match = VALID_CATEGORIES.find(c => norm(c) === norm(categoryRaw))
      if (!match) errors.push(`Unrecognized Business Category "${categoryRaw}"`)
      else businessCategory = match
    }

    let businessBrand: BusinessBrand | undefined
    const brandRaw = get(cols, idx.brand)
    if (brandRaw) {
      const match = VALID_BRANDS.find(b => norm(b) === norm(brandRaw))
      if (!match) errors.push(`Unrecognized Business Brand "${brandRaw}"`)
      else businessBrand = match
    }
    if (businessDivision === 'fgd' && !businessBrand) errors.push('Business Brand is required for FGD leads')

    const sourceRaw = get(cols, idx.source)
    let source: LeadSource = 'other'
    let subSource = get(cols, idx.subSource) || undefined
    if (sourceRaw) {
      const match = VALID_SOURCES.find(s => norm(s) === norm(sourceRaw))
      if (match) source = match
      else if (!subSource) subSource = sourceRaw // unrecognized text kept, not rejected
    }

    const interestRaw = get(cols, idx.interest)
    const interest = VALID_INTERESTS.find(v => norm(v) === norm(interestRaw)) ?? 'medium'

    if (errors.length > 0) return { rowNumber, name, phone, errors }

    return {
      rowNumber, name, phone, errors: [],
      input: {
        name, phone, email: get(cols, idx.email) || undefined, city,
        siteNo: get(cols, idx.siteNo) || undefined,
        leadCodePrefix: typeRaw as LeadCodePrefix,
        businessDivision, businessCategory, businessBrand,
        requirement: get(cols, idx.requirement) || undefined, notes: get(cols, idx.notes) || undefined,
        source, subSource, interest, ownerNameRaw,
      },
    }
  })
}

export function leadsToCsvText(leads: Lead[]): string {
  const lines = [LEAD_CSV_HEADERS.join(',')]
  for (const l of leads) {
    lines.push([
      l.name, l.phone, l.email ?? '', l.city, l.siteNo ?? '',
      l.leadCodePrefix ?? '', l.businessDivision ?? '', l.businessCategory ?? '', l.businessBrand ?? '',
      l.requirement ?? '', l.notes ?? '', l.source, l.subSource ?? '', l.interest, l.ownerName,
    ].map(csvField).join(','))
  }
  return lines.join('\n')
}

export function sampleLeadCsvText(): string {
  const sample = [
    'Rajesh Kumar', '9876543210', 'rajesh@example.com', 'Anna Nagar, Chennai', 'SC 12',
    'SK', 'sk_interiors', '', '',
    '3BHK interior fit-out', 'Prefers weekend site visits', 'walk_in', '', 'hot', 'Raj Kamal',
  ]
  return [LEAD_CSV_HEADERS.join(','), sample.map(csvField).join(',')].join('\n')
}

export function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
