import type { BusinessDivision, BusinessCategory, BusinessBrand } from '../types'

export const BUSINESS_DIVISION_OPTIONS: { value: BusinessDivision; label: string }[] = [
  { value: 'fgd',                    label: 'FGD — Future Group Distributors' },
  { value: 'first_property_contractors', label: 'First Property Contractors — Real Estate' },
  { value: 'sk_constructions',        label: 'Space Krafters — Construction'      },
  { value: 'sk_interiors',            label: 'Space Krafters — Interiors'        },
  { value: 'sk_turnkey_interiors',    label: 'Space Krafters — Turnkey Interior Projects' },
]
export const BUSINESS_DIVISION_LABEL: Record<BusinessDivision, string> =
  Object.fromEntries(BUSINESS_DIVISION_OPTIONS.map(o => [o.value, o.label])) as Record<BusinessDivision, string>

// Only Turnkey Interior Projects splits further into a Residential/Commercial/Industrial category.
export const DIVISIONS_WITH_CATEGORY: BusinessDivision[] = ['sk_turnkey_interiors']

export const BUSINESS_CATEGORY_OPTIONS: { value: BusinessCategory; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial',  label: 'Commercial'  },
  { value: 'industrial',  label: 'Industrial'  },
]
export const BUSINESS_CATEGORY_LABEL: Record<BusinessCategory, string> =
  Object.fromEntries(BUSINESS_CATEGORY_OPTIONS.map(o => [o.value, o.label])) as Record<BusinessCategory, string>

// FGD is one company with two brand lines — not two separate divisions.
export const DIVISIONS_WITH_BRAND: BusinessDivision[] = ['fgd']

export const BUSINESS_BRAND_OPTIONS: { value: BusinessBrand; label: string }[] = [
  { value: 'kitchenaid',             label: 'KitchenAid (KA)' },
  { value: 'bosch_siemens_gaggenau', label: 'Bosch, Siemens & Gaggenau' },
]
export const BUSINESS_BRAND_LABEL: Record<BusinessBrand, string> =
  Object.fromEntries(BUSINESS_BRAND_OPTIONS.map(o => [o.value, o.label])) as Record<BusinessBrand, string>
