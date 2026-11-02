import { storeFile } from './fileStorage'
import { amountInWords } from './amountInWords'
import { inr, lineAmounts, orderTotals } from './purchaseOrderMath'
import { PO_COMPANY } from '../data/procurementRules'
import type { VendorOrder } from '../types'

// Draws a purchase order straight onto A4 with jsPDF, laid out like the sample PO: title bar, buyer block with the
// PO number / date / place of supply, the vendor block, the item table (HSN, rate, qty, taxable value, tax, amount),
// the tax totals, the amount in words and the authorised-signatory box. Rows break cleanly across pages.

const PAGE_H = 297
const M = 10
const W = 190
const PAD = 1.8
const LH = 3.9

// # · Item · HSN/SAC · Rate / Item · Qty · Taxable Value · Tax Amount · Amount
const COLS = [8, 56, 20, 22, 18, 24, 22, 20]
const HEADS = ['#', 'Item', 'HSN/SAC', 'Rate / Item', 'Qty', 'Taxable Value', 'Tax Amount', 'Amount']

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function purchaseOrderFileName(vendor: Pick<VendorOrder, 'poNumber' | 'name'>): string {
  const safe = vendor.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Vendor'
  return `${vendor.poNumber.replace(/[^a-z0-9-]+/gi, '_')}_${safe}.pdf`
}

export async function generatePurchaseOrderPdf(order: VendorOrder, projectLabel: string, date: Date = new Date()): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor(60)
  doc.setLineHeightFactor(1.15)
  let y = M

  const box = (x: number, top: number, w: number, h: number, fill?: [number, number, number]) => {
    if (fill) { doc.setFillColor(...fill); doc.rect(x, top, w, h, 'FD') } else doc.rect(x, top, w, h)
  }
  const text = (s: string | string[], x: number, top: number, align: 'left' | 'center' | 'right' = 'left') =>
    doc.text(s, x, top, { align, baseline: 'top' })
  const bold = (size: number) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size) }
  const normal = (size: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size) }
  const wrap = (s: string, w: number) => doc.splitTextToSize(s, w) as string[]

  // Title bar.
  box(M, y, W, 8)
  bold(11); doc.setTextColor(37, 99, 235); text('PURCHASE ORDER', M + W / 2, y + 2.4, 'center')
  doc.setTextColor(60); normal(7.5); text('ORIGINAL FOR RECIPIENT', M + W - 2, y + 2.9, 'right')
  doc.setTextColor(0)
  y += 8

  // Buyer block (left) with the PO details (right).
  const LEFT_W = 100
  const buyer = [
    `GSTIN: ${PO_COMPANY.gstin}`, `PAN: ${PO_COMPANY.pan}`, ...wrap(PO_COMPANY.address, LEFT_W - 4),
    `Mobile: ${PO_COMPANY.phone}`, `Email: ${PO_COMPANY.email}`,
  ]
  const buyerH = Math.max(34, 8 + buyer.length * LH + 3)
  box(M, y, LEFT_W, buyerH)
  bold(11); text(PO_COMPANY.name, M + 2, y + 2.4)
  normal(8.5); text(buyer, M + 2, y + 8)
  const rw = (W - LEFT_W) / 2
  const details: [string, string][] = [
    ['Purchase Order #:', order.poNumber], ['Purchase Order Date:', fmtDate(date)],
    ['Place of Supply:', PO_COMPANY.placeOfSupply], ['Project:', projectLabel],
  ]
  const dh = 12.5
  details.forEach(([label, value], i) => {
    const x = M + LEFT_W + (i % 2) * rw, top = y + Math.floor(i / 2) * dh
    box(x, top, rw, dh)
    normal(7.5); text(label, x + 2, top + 1.8)
    bold(8.5); text(wrap(value, rw - 4).slice(0, 2), x + 2, top + 6)
  })
  box(M + LEFT_W, y + dh * 2, W - LEFT_W, buyerH - dh * 2)
  y += buyerH

  // Vendor block.
  const vendor = [
    `GSTIN: ${order.gstin}`, ...(order.address ? ['Vendor Billing Address:', ...wrap(order.address, LEFT_W - 4)] : []),
    ...(order.phone ? [`Ph: ${order.phone}`] : []), ...(order.email ? [order.email] : []),
  ]
  const vendorH = 12 + vendor.length * LH + 2
  box(M, y, LEFT_W, vendorH); box(M + LEFT_W, y, W - LEFT_W, vendorH)
  bold(8.5); text('Vendor Details:', M + 2, y + 2)
  bold(10); text(order.name, M + 2, y + 6.4)
  normal(8.5); text(vendor, M + 2, y + 11.4)
  y += vendorH

  // Item table.
  const drawHeads = () => {
    bold(8)
    let x = M
    COLS.forEach((w, i) => {
      box(x, y, w, 7, [242, 242, 242])
      text(HEADS[i], i === 1 ? x + PAD : i === 0 ? x + w / 2 : x + w - PAD, y + 2.2, i === 1 ? 'left' : i === 0 ? 'center' : 'right')
      x += w
    })
    y += 7
  }
  drawHeads()

  const gstValues = [...new Set(order.lines.map(l => l.gstPercent))]
  order.lines.forEach((l, idx) => {
    const a = lineAmounts(l)
    const title = wrap(l.description, COLS[1] - PAD * 2)
    const sub = wrap([l.category, l.spec].filter(Boolean).join(' — '), COLS[1] - PAD * 2)
    const itemLines = title.length + sub.length
    const h = Math.max(9, itemLines * LH + PAD * 2)
    if (y + h > PAGE_H - M - 12) { doc.addPage(); y = M; drawHeads() }
    let x = M
    COLS.forEach((w, i) => { box(x, y, w, h); x += w })
    const cx = (i: number) => M + COLS.slice(0, i).reduce((s, w) => s + w, 0)
    normal(8.5); text(String(idx + 1), cx(0) + COLS[0] / 2, y + PAD + 0.3, 'center')
    bold(8.5); text(title, cx(1) + PAD, y + PAD + 0.3)
    normal(8); text(sub, cx(1) + PAD, y + PAD + 0.3 + title.length * LH)
    normal(8.5)
    text(l.hsn, cx(2) + COLS[2] - PAD, y + PAD + 0.3, 'right')
    bold(8.5); text(inr(parseFloat(l.rate) || 0), cx(3) + COLS[3] - PAD, y + PAD + 0.3, 'right')
    normal(8.5)
    text(`${l.qty} ${l.unit}`.trim(), cx(4) + COLS[4] - PAD, y + PAD + 0.3, 'right')
    text(inr(a.taxable), cx(5) + COLS[5] - PAD, y + PAD + 0.3, 'right')
    text(inr(a.tax), cx(6) + COLS[6] - PAD, y + PAD + 0.3, 'right')
    normal(7); text(`(${l.gstPercent || 0}%)`, cx(6) + COLS[6] - PAD, y + PAD + 4.2, 'right')
    normal(8.5); text(inr(a.amount), cx(7) + COLS[7] - PAD, y + PAD + 0.3, 'right')
    y += h
  })

  // Totals, amount in words and signature (kept together, on a new page if they do not fit).
  const t = orderTotals(order.lines)
  const totalQty = order.lines.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0)
  if (y + 62 > PAGE_H - M) { doc.addPage(); y = M }
  box(M, y, W, 6)
  normal(8); text(`Total Items / Qty : ${order.lines.length} / ${totalQty}`, M + 2, y + 1.8)
  y += 6
  const rate = gstValues.length === 1 ? `${(parseFloat(gstValues[0]) || 0) / 2}%` : ''
  const rows: [string, string, boolean][] = [
    ['Taxable Amount', `Rs. ${inr(t.taxable)}`, true], [`CGST ${rate}`.trim(), `Rs. ${inr(t.cgst)}`, true], [`SGST ${rate}`.trim(), `Rs. ${inr(t.sgst)}`, true],
  ]
  box(M, y, W, 7 * rows.length + 11)
  rows.forEach(([label, value], i) => {
    bold(8.5); text(label, M + W - 50, y + 2 + i * 7, 'right'); text(value, M + W - 2, y + 2 + i * 7, 'right')
  })
  const totalTop = y + 7 * rows.length
  bold(12); text('Total', M + W - 50, totalTop + 2.5, 'right'); text(`Rs. ${inr(t.total)}`, M + W - 2, totalTop + 2.5, 'right')
  y += 7 * rows.length + 11
  box(M, y, W, 7)
  normal(8.5); text(`Total amount (in words): ${amountInWords(t.total)}`, M + 2, y + 2)
  y += 7
  const sigH = 28
  box(M, y, W - 80, sigH); box(M + W - 80, y, 80, sigH)
  normal(8); text(`For ${PO_COMPANY.name}`, M + W - 40, y + 2, 'center')
  normal(8); text('Authorized Signatory', M + W - 40, y + sigH - 5, 'center')

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); normal(7.5); doc.setTextColor(90)
    text(`Page ${p} / ${pages}`, M, PAGE_H - 7)
  }
  return doc.output('blob')
}

// Generates the PDF and uploads it with the app's normal file storage; returns the stored file reference.
export async function generateAndUploadPurchaseOrderPdf(order: VendorOrder, projectLabel: string): Promise<string> {
  const blob = await generatePurchaseOrderPdf(order, projectLabel)
  return storeFile(new File([blob], purchaseOrderFileName(order), { type: 'application/pdf' }))
}
