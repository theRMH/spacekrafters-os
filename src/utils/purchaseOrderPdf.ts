import { storeFile } from './fileStorage'
import { amountInWords } from './amountInWords'
import { inr, lineAmounts, orderTotals } from './purchaseOrderMath'
import { PO_COMPANY } from '../data/procurementRules'
import type { VendorOrder } from '../types'

// Draws a purchase order straight onto A4 with jsPDF, laid out like the sample PO: a title bar, the buyer block (logo,
// GSTIN, PAN, address, contact) beside the PO number / date / place of supply / payment-by boxes, the vendor block
// underneath, then the item table (shaded alternate rows, empty body down to the totals), the tax totals, the amount in
// words and the authorised-signatory box. Long orders break cleanly between rows.

const PAGE_H = 297
const M = 10
const W = 190
const PAD = 2.2
const LH = 4.1
const HALF = 95                // width of the left column (buyer + vendor)
const TOTALS_H = 72            // room kept at the bottom for the totals, words and signature

// # · Item · HSN/SAC · Rate / Item · Qty · Taxable Value · Tax Amount · Amount
const COLS = [8.6, 54.8, 16.8, 25.2, 19, 21.2, 23.2, 21.2]
const HEADS = ['#', 'Item', 'HSN/SAC', 'Rate / Item', 'Qty', 'Taxable Value', 'Tax Amount', 'Amount']
const colX = (i: number) => M + COLS.slice(0, i).reduce((s, w) => s + w, 0)

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function purchaseOrderFileName(vendor: Pick<VendorOrder, 'poNumber' | 'name'>): string {
  const safe = vendor.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Vendor'
  return `${vendor.poNumber.replace(/[^a-z0-9-]+/gi, '_')}_${safe}.pdf`
}

// The company logo is a static asset; if it cannot be loaded the PDF is simply made without it.
let logoLoad: Promise<Uint8Array | null> | null = null
function loadLogo(): Promise<Uint8Array | null> {
  logoLoad ??= (async () => {
    try {
      const res = await fetch(PO_COMPANY.logo)
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
    } catch { return null }
  })()
  return logoLoad
}

export async function generatePurchaseOrderPdf(order: VendorOrder, projectLabel: string, date: Date = new Date()): Promise<Blob> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor(40)
  doc.setLineHeightFactor(1.15)
  let y = M

  const box = (x: number, top: number, w: number, h: number) => doc.rect(x, top, w, h)
  const text = (s: string | string[], x: number, top: number, align: 'left' | 'center' | 'right' = 'left') =>
    doc.text(s, x, top, { align, baseline: 'top' })
  const font = (style: 'bold' | 'normal', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size) }
  const wrap = (s: string, w: number) => doc.splitTextToSize(s, w) as string[]
  // "Label: value" on one line, the label in bold.
  const labelled = (label: string, value: string, x: number, top: number) => {
    font('bold', 8.5); text(label, x, top)
    const w = doc.getTextWidth(label) + 1
    font('normal', 8.5); text(value, x + w, top)
  }

  // Title bar.
  box(M, y, W, 6.5)
  font('bold', 11); doc.setTextColor(37, 99, 235); doc.setCharSpace(1.4)
  text('PURCHASE ORDER', M + W / 2, y + 1.9, 'center')
  doc.setCharSpace(0.4); font('normal', 7.5); doc.setTextColor(50)
  text('ORIGINAL FOR RECIPIENT', M + W - 2, y + 2.4, 'right')
  doc.setCharSpace(0); doc.setTextColor(0)
  y += 6.5

  // Buyer block (left): logo, company name, GSTIN, PAN, address, mobile, email.
  const logoSize = 25
  const textX = M + (logo ? logoSize + 6 : 2)
  const addr = wrap(PO_COMPANY.address, M + HALF - textX - 2)
  const buyerLines = 2 + addr.length + 2
  const buyerH = Math.max(logo ? logoSize + 5 : 0, 9 + buyerLines * LH + 2)
  box(M, y, HALF, buyerH)
  if (logo) doc.addImage(logo, 'PNG', M + 2, y + 2.5, logoSize, logoSize)
  font('bold', 12); text(PO_COMPANY.name, textX, y + 2.4)
  let ty = y + 8.6
  font('bold', 8.5); text(`GSTIN: ${PO_COMPANY.gstin}`, textX, ty); ty += LH
  text(`PAN: ${PO_COMPANY.pan}`, textX, ty); ty += LH
  font('normal', 8.5); text(addr, textX, ty); ty += addr.length * LH
  labelled('Mobile:', PO_COMPANY.phone, textX, ty); ty += LH
  labelled('Email:', PO_COMPANY.email, textX, ty)

  // Vendor block (left, under the buyer).
  const addrLines = order.address ? wrap(order.address, HALF - 4) : []
  const vendorLines = 2 + (order.gstin ? 1 : 0) + (order.address ? 1 + addrLines.length : 0) + (order.phone ? 1 : 0) + (order.email ? 1 : 0)
  const vendorH = Math.max(36, vendorLines * LH + 5)
  box(M, y + buyerH, HALF, vendorH)
  let vy = y + buyerH + 2.4
  font('bold', 8.5); text('Vendor Details:', M + 2, vy); vy += LH
  text(order.name, M + 2, vy); vy += LH
  if (order.gstin) { text(`GSTIN: ${order.gstin}`, M + 2, vy); vy += LH }
  if (order.address) {
    text('Vendor Billing Address:', M + 2, vy); vy += LH
    font('normal', 8.5); text(addrLines, M + 2, vy); vy += addrLines.length * LH
  }
  font('normal', 8.5)
  if (order.phone) { text(`Ph: ${order.phone}`, M + 2, vy); vy += LH }
  if (order.email) text(order.email, M + 2, vy)

  // Right column: PO number / date / place of supply / payment by, then the project in the empty box below.
  const rw = (W - HALF) / 2
  const dh = 11.5
  const dateText = fmtDate(date)
  const details: [string, string][] = [
    ['Purchase Order #:', order.poNumber], ['Purchase Order Date:', dateText],
    ['Place of Supply:', PO_COMPANY.placeOfSupply], ['Payment by:', dateText],
  ]
  details.forEach(([label, value], i) => {
    const x = M + HALF + (i % 2) * rw, top = y + Math.floor(i / 2) * dh
    box(x, top, rw, dh)
    font('normal', 8); text(label, x + 2, top + 2)
    font('bold', 9.5); text(wrap(value, rw - 4).slice(0, 1), x + 2, top + 6.4)
  })
  const restH = buyerH + vendorH - dh * 2
  box(M + HALF, y + dh * 2, W - HALF, restH)
  font('normal', 8); text('Project:', M + HALF + 2, y + dh * 2 + 2)
  font('bold', 9); text(wrap(projectLabel, W - HALF - 4).slice(0, 2), M + HALF + 2, y + dh * 2 + 6.2)
  y += buyerH + vendorH

  // Item table: plain headings, then rows with vertical rules only and every other row shaded.
  const drawHeads = () => {
    box(M, y, W, 6)
    font('normal', 8.5)
    HEADS.forEach((h, i) => {
      if (i > 0) doc.line(colX(i), y, colX(i), y + 6)
      if (i === 0) text(h, colX(i) + PAD, y + 1.8)
      else if (i === 1) text(h, colX(i) + PAD, y + 1.8)
      else text(h, colX(i + 1) - PAD, y + 1.8, 'right')
    })
    y += 6
    doc.setLineWidth(0.45); doc.line(M, y, M + W, y); doc.setLineWidth(0.2)
  }
  const verticals = (top: number, bottom: number) => {
    for (let i = 0; i <= COLS.length; i++) doc.line(colX(i), top, colX(i), bottom)
  }
  // Empty table body down to `to`, closed with a rule.
  const fillBody = (to: number) => {
    if (to > y) { verticals(y, to); y = to }
    doc.line(M, y, M + W, y)
  }
  drawHeads()

  const gstValues = [...new Set(order.lines.map(l => l.gstPercent))]
  order.lines.forEach((l, idx) => {
    const a = lineAmounts(l)
    const title = wrap(l.description, COLS[1] - PAD * 2)
    const sub = wrap([l.category, l.spec].filter(Boolean).join(' — '), COLS[1] - PAD * 2)
    const h = Math.max(11, (title.length + sub.length) * LH + PAD * 2)
    if (y + h > PAGE_H - M - 2) { fillBody(PAGE_H - M); doc.addPage(); y = M; drawHeads() }
    if (idx % 2 === 1) { doc.setFillColor(245, 245, 245); doc.rect(colX(0), y, W, h, 'F') }
    verticals(y, y + h)
    const top = y + PAD
    font('normal', 8.5); text(String(idx + 1), colX(0) + PAD, top)
    font('bold', 8.5); text(title, colX(1) + PAD, top)
    font('normal', 8.5); text(sub, colX(1) + PAD, top + title.length * LH)
    text(l.hsn, colX(3) - PAD, top, 'right')
    font('bold', 8.5); text(inr(parseFloat(l.rate) || 0), colX(4) - PAD, top, 'right')
    font('normal', 8.5)
    text(`${l.qty} ${l.unit.toUpperCase()}`.trim(), colX(5) - PAD, top, 'right')
    text(inr(a.taxable), colX(6) - PAD, top, 'right')
    text(`${inr(a.tax)} (${l.gstPercent || 0}%)`, colX(7) - PAD, top, 'right')
    text(inr(a.amount), colX(8) - PAD, top, 'right')
    y += h
  })

  // The totals sit at the bottom of the page (on a new page if the table ran too long to leave room).
  if (y + TOTALS_H > PAGE_H - M) { fillBody(PAGE_H - M); doc.addPage(); y = M } else fillBody(PAGE_H - M - TOTALS_H)

  const t = orderTotals(order.lines)
  const totalQty = order.lines.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0)
  box(M, y, W, 6)
  font('normal', 8.5); text(`Total Items / Qty : ${order.lines.length} / ${totalQty}`, M + 2, y + 1.8)
  y += 6
  const rate = gstValues.length === 1 ? ` ${(parseFloat(gstValues[0]) || 0) / 2}%` : ''
  const rows: [string, string][] = [
    ['Taxable Amount', `Rs. ${inr(t.taxable)}`], [`CGST${rate}`, `Rs. ${inr(t.cgst)}`], [`SGST${rate}`, `Rs. ${inr(t.sgst)}`],
  ]
  box(M, y, W, rows.length * 6 + 11)
  rows.forEach(([label, value], i) => {
    font('bold', 8.5); text(label, M + W - 44, y + 1.8 + i * 6, 'right'); text(value, M + W - 2, y + 1.8 + i * 6, 'right')
  })
  const totalTop = y + rows.length * 6
  font('bold', 13); text('Total', M + W - 44, totalTop + 2.6, 'right'); text(`Rs. ${inr(t.total)}`, M + W - 2, totalTop + 2.6, 'right')
  y += rows.length * 6 + 11
  const words = amountInWords(t.total).replace(/^Rupees /, '')
  box(M, y, W, 7)
  font('normal', 8.5); text(`Total amount (in words): INR ${words}${/Paise$/.test(words) ? '' : ' Rupees'} Only.`, M + 2, y + 2)
  y += 7
  const sigH = 28
  box(M, y, W - 80, sigH); box(M + W - 80, y, 80, sigH)
  font('normal', 8); text(`For ${PO_COMPANY.name}`, M + W - 78, y + 2)
  text('Authorized Signatory', M + W - 2, y + sigH - 5, 'right')

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); font('normal', 7.5); doc.setTextColor(90)
    text(`Page ${p} / ${pages}`, M, PAGE_H - 7)
  }
  return doc.output('blob')
}

// Generates the PDF and uploads it with the app's normal file storage; returns the stored file reference.
export async function generateAndUploadPurchaseOrderPdf(order: VendorOrder, projectLabel: string): Promise<string> {
  const blob = await generatePurchaseOrderPdf(order, projectLabel)
  return storeFile(new File([blob], purchaseOrderFileName(order), { type: 'application/pdf' }))
}
