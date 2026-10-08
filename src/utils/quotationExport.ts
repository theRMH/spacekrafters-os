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
    if (section.notes) rows.push([section.title, `Notes: ${section.notes}`])
  }

  rows.push([])
  rows.push(['', '', '', '', '', 'Subtotal', quotation.totalAmount])
  rows.push(['', '', '', '', '', 'Discount', -quotation.discountAmount])
  rows.push(['', '', '', '', '', 'Taxable Amount', quotation.taxableAmount ?? quotation.totalAmount - quotation.discountAmount])
  rows.push(['', '', '', '', '', 'Tax', quotation.taxAmount])
  if (quotation.transportCost) rows.push(['', '', '', '', '', 'Transport Cost', quotation.transportCost])
  rows.push(['', '', '', '', '', 'Net Amount', quotation.netAmount])
  if (quotation.advanceTermOption) {
    rows.push(['', '', '', '', '', `Advance (${quotation.advanceTermOption})`, quotation.advanceTermAmount ?? 0])
    rows.push(['', '', '', '', '', 'Balance Due', quotation.advanceTermBalance ?? quotation.netAmount])
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)

  const colCount = Math.max(...rows.map(r => r.length))
  sheet['!cols'] = Array.from({ length: colCount }, (_, colIdx) => {
    const maxLen = rows.reduce((max, row) => {
      const cell = row[colIdx]
      return Math.max(max, cell === undefined ? 0 : String(cell).length)
    }, 0)
    return { wch: Math.min(Math.max(maxLen + 2, 8), 30) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Quotation')
  XLSX.writeFile(workbook, `Quotation_${leadName.replace(/\s+/g, '_')}_v${quotation.version}.xlsx`)
}
