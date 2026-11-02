import type { VendorLine } from '../types'

const num = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }
const round2 = (n: number) => Math.round(n * 100) / 100

export interface LineAmounts { taxable: number; tax: number; amount: number }

export function lineAmounts(l: Pick<VendorLine, 'qty' | 'rate' | 'gstPercent'>): LineAmounts {
  const taxable = round2(num(l.qty) * num(l.rate))
  const tax = round2(taxable * num(l.gstPercent) / 100)
  return { taxable, tax, amount: round2(taxable + tax) }
}

export function orderTotals(lines: VendorLine[]) {
  const t = lines.reduce((s, l) => { const a = lineAmounts(l); return { taxable: s.taxable + a.taxable, tax: s.tax + a.tax } }, { taxable: 0, tax: 0 })
  const taxable = round2(t.taxable), tax = round2(t.tax)
  // Tax is split equally into CGST and SGST (the vendor and the buyer are both in Tamil Nadu).
  return { taxable, tax, cgst: round2(tax / 2), sgst: round2(tax / 2), total: round2(taxable + tax) }
}

export const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Parses the QS's estimated amount (blank or invalid = 0).
export const parseAmount = (s?: string) => (s ? num(s) : 0)
