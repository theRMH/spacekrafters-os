import * as XLSX from 'xlsx'
import type { Quotation } from '../types'

export function downloadQuotationExcel(quotation: Quotation, leadName: string) {
  const rows: (string | number)[][] = [
    ['SpaceKrafters — Quotation'],
    ['Client', leadName],
    ['Version', quotation.version],
    ['Status', quotation.status],
    [],
    ['Section', 'Description', 'Unit', 'Qty', 'Rate', 'Tax %', 'Amount'],
  ]

  for (const section of quotation.sections) {
    for (const item of section.items) {
      rows.push([section.title, item.description, item.unit, item.quantity, item.rate, item.taxPercent ?? 0, item.amount])
    }
  }

  rows.push([])
  rows.push(['', '', '', '', '', 'Subtotal', quotation.totalAmount])
  rows.push(['', '', '', '', '', 'Tax', quotation.taxAmount])
  rows.push(['', '', '', '', '', 'Discount', -quotation.discountAmount])
  rows.push(['', '', '', '', '', 'Net Amount', quotation.netAmount])

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Quotation')
  XLSX.writeFile(workbook, `Quotation_${leadName.replace(/\s+/g, '_')}_v${quotation.version}.xlsx`)
}
