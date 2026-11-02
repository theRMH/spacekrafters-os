import { storeFile } from './fileStorage'
import type { IndentForm } from '../types'

// Draws the Material Indent Form straight onto A4 with jsPDF (no screenshot), so text stays sharp and long
// lists break cleanly between rows, repeating the column headings on each page.

const PAGE_H = 297
const M = 10
const W = 190
const LH = 3.9      // line height at 9.5pt
const PAD = 1.6

// S.No · Category · Description · Specification / Brand · Unit · Qty Required · Remarks
const COLS = [12, 26, 52, 38, 16, 18, 28]
const HEADS = ['S.No', 'Category', 'Description', 'Specification / Brand', 'Unit', 'Qty', 'Remarks']
const CENTERED = new Set([0, 4, 5])

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

export function indentPdfFileName(form: IndentForm): string {
  const safe = form.projectName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Project'
  return `Material_Indent_${form.indentNo.replace(/[^a-z0-9]+/gi, '') || 'x'}_${safe}.pdf`
}

export async function generateIndentPdf(form: IndentForm): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor(0)
  doc.setLineHeightFactor(1.15)
  let y = M

  // A bordered cell; `fill` is an RGB triple. Text is drawn by the caller.
  const box = (x: number, top: number, w: number, h: number, fill?: [number, number, number]) => {
    if (fill) { doc.setFillColor(...fill); doc.rect(x, top, w, h, 'FD') } else doc.rect(x, top, w, h)
  }
  const text = (s: string | string[], x: number, top: number, align: 'left' | 'center' = 'left') =>
    doc.text(s, x, top, { align, baseline: 'top' })

  // Title band + the five detail rows (first page only).
  doc.setFont('times', 'bold'); doc.setFontSize(12)
  box(M, y, W, 9, [191, 191, 191])
  text('MATERIAL INDENT FORM', M + W / 2, y + 2.6, 'center')
  y += 9
  const info: [string, string][] = [
    ['Company Name', form.companyName], ['Project Name', form.projectName], ['Site Location', form.siteLocation],
    ['Date', fmtDate(form.date)], ['Indent No', form.indentNo],
    ...(form.estimatedAmount ? [['Estimated Amount', 'Rs. ' + form.estimatedAmount] as [string, string]] : []),
  ]
  doc.setFontSize(10.5)
  for (const [label, value] of info) {
    box(M, y, 84, 7); box(M + 84, y, W - 84, 7)
    doc.setFont('times', 'bold'); text(label, M + 1.5, y + 2)
    doc.setFont('times', 'normal'); text(value, M + 85.5, y + 2)
    y += 7
  }

  const drawHeads = () => {
    doc.setFont('times', 'bold'); doc.setFontSize(10)
    let x = M
    COLS.forEach((w, i) => {
      box(x, y, w, 7.5, [157, 195, 230])
      text(HEADS[i], x + w / 2, y + 2.2, 'center')
      x += w
    })
    y += 7.5
  }
  drawHeads()

  doc.setFont('times', 'normal'); doc.setFontSize(9.5)
  form.items.forEach((it, idx) => {
    const cells = [String(idx + 1), it.category, it.description, it.spec, it.unit, it.qty, it.remarks]
    const lines = cells.map((c, i) => doc.splitTextToSize(c, COLS[i] - PAD * 2) as string[])
    const h = Math.max(8, Math.max(...lines.map(l => l.length)) * LH + PAD * 2)
    if (y + h > PAGE_H - M) { doc.addPage(); y = M; drawHeads(); doc.setFont('times', 'normal'); doc.setFontSize(9.5) }
    let x = M
    COLS.forEach((w, i) => {
      box(x, y, w, h)
      if (CENTERED.has(i)) text(lines[i], x + w / 2, y + PAD + 0.4, 'center')
      else text(lines[i], x + PAD, y + PAD + 0.4)
      x += w
    })
    y += h
  })

  // Prepared / Checked / Approved by.
  if (y + 18 > PAGE_H - M) { doc.addPage(); y = M }
  const sw = W / 3
  const sigs: [string, string][] = [['Prepared By', form.preparedBy], ['Checked By', form.checkedBy], ['Approved By', form.approvedBy]]
  sigs.forEach(([label, name], i) => {
    const x = M + sw * i
    box(x, y, sw, 8); box(x, y + 8, sw, 10)
    doc.setFont('times', 'bold'); doc.setFontSize(10.5); text(label, x + sw / 2, y + 2.4, 'center')
    doc.setFont('times', 'normal'); doc.setFontSize(10); text(name, x + sw / 2, y + 11.5, 'center')
  })

  return doc.output('blob')
}

// Generates the PDF and uploads it with the app's normal file storage; returns the stored file reference and the blob.
export async function generateAndUploadIndentPdf(form: IndentForm): Promise<{ url: string; blob: Blob; fileName: string }> {
  const blob = await generateIndentPdf(form)
  const fileName = indentPdfFileName(form)
  const url = await storeFile(new File([blob], fileName, { type: 'application/pdf' }))
  return { url, blob, fileName }
}
