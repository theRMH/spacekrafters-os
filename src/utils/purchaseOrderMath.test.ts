import { describe, it, expect } from 'vitest'
import { lineAmounts, orderTotals, parseAmount } from './purchaseOrderMath'
import type { VendorLine } from '../types'

const line = (qty: string, rate: string, gstPercent = '18'): VendorLine =>
  ({ id: 'l', category: '', description: '', spec: '', unit: 'Nos', qty, rate, hsn: '', gstPercent })

describe('purchase order amounts', () => {
  it('works out taxable value, tax and amount for a line', () => {
    expect(lineAmounts(line('4', '4500'))).toEqual({ taxable: 18000, tax: 3240, amount: 21240 })
  })

  it('totals an order the way the sample PO does (27,000 + 18% = 31,860, CGST/SGST 2,430 each)', () => {
    const t = orderTotals([line('4', '4500'), line('1', '9000')])
    expect(t).toEqual({ taxable: 27000, tax: 4860, cgst: 2430, sgst: 2430, total: 31860 })
  })

  it('treats blank or invalid numbers as zero', () => {
    expect(lineAmounts(line('', 'abc'))).toEqual({ taxable: 0, tax: 0, amount: 0 })
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('50,000')).toBe(50000)
  })
})
