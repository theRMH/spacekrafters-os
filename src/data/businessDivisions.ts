import type { BusinessDivision, BusinessCategory } from '../types'

export const BUSINESS_DIVISION_OPTIONS: { value: BusinessDivision; label: string }[] = [
  { value: 'fgd',                 label: 'Future Group Distributors (FGD) — KitchenAid, Bosch, Siemens & Gaggenau' },
  { value: 'sk_constructions',    label: 'Space Krafters — Constructions'      },
  { value: 'sk_interiors',        label: 'Space Krafters — Interiors'          },
  { value: 'sk_turnkey_projects', label: 'Space Krafters — Turnkey Projects'   },
  { value: 'sk_real_estate',      label: 'Space Krafters — Real Estate Projects' },
]
export const BUSINESS_DIVISION_LABEL: Record<BusinessDivision, string> =
  Object.fromEntries(BUSINESS_DIVISION_OPTIONS.map(o => [o.value, o.label])) as Record<BusinessDivision, string>

// Only these divisions split further into a Residential/Commercial/Industrial category.
export const DIVISIONS_WITH_CATEGORY: BusinessDivision[] = ['sk_interiors', 'sk_turnkey_projects']

export const BUSINESS_CATEGORY_OPTIONS: { value: BusinessCategory; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial',  label: 'Commercial'  },
  { value: 'industrial',  label: 'Industrial'  },
]
export const BUSINESS_CATEGORY_LABEL: Record<BusinessCategory, string> =
  Object.fromEntries(BUSINESS_CATEGORY_OPTIONS.map(o => [o.value, o.label])) as Record<BusinessCategory, string>
