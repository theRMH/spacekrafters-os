import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QuotationPrintTemplate } from '../screens/Quotations/QuotationPrintTemplate'
import { storeFile } from './fileStorage'
import type { Quotation, QuotationTemplateData } from '../types'

// Builds the quotation PDF from the on-screen template (QuotationPrintTemplate): the template
// is rendered off-screen, each of its pages is captured, and the capture is laid onto A4 pages
// — cutting only between table rows so a line of text is never sliced in half.

const A4_W_MM = 210
const A4_H_MM = 297
const MARGIN_MM = 10
const RENDER_W_PX = 780

export function quotationPdfFileName(q: Quotation, clientName: string): string {
  const safe = clientName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Client'
  return `Quotation_${safe}_v${q.version}.pdf`
}

async function renderPages(q: Quotation, tpl: QuotationTemplateData, clientName: string) {
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_W_PX}px;background:#fff;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(createElement(QuotationPrintTemplate, { q, tpl, clientName }))
    // Let React commit, then wait for the logo (and any fonts) so the capture is complete.
    await new Promise(r => setTimeout(r, 50))
    await Promise.all([...host.querySelectorAll('img')].map(img => img.complete ? null : new Promise(res => { img.onload = img.onerror = () => res(null) })))
    if ('fonts' in document) await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
    const pages: { canvas: HTMLCanvasElement; cssW: number; cssH: number; breaks: number[] }[] = []
    for (const el of [...host.querySelectorAll<HTMLElement>('[data-pdf-page]')]) {
      const top = el.getBoundingClientRect().top
      const breaks = [...el.querySelectorAll('tr, li, p')].map(n => n.getBoundingClientRect().bottom - top)
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      pages.push({ canvas, cssW: el.offsetWidth, cssH: el.offsetHeight, breaks })
    }
    return pages
  } finally {
    root.unmount()
    host.remove()
  }
}

export async function generateQuotationPdf(q: Quotation, tpl: QuotationTemplateData, clientName: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pages = await renderPages(q, tpl, clientName)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const usableW = A4_W_MM - MARGIN_MM * 2
  const usableH = A4_H_MM - MARGIN_MM * 2
  let first = true

  for (const page of pages) {
    const mmPerCssPx = usableW / page.cssW
    const maxSliceCssPx = usableH / mmPerCssPx
    const pxPerCss = page.canvas.height / page.cssH // canvas pixels per css pixel (the capture scale)
    let start = 0
    while (start < page.cssH - 0.5) {
      let end = Math.min(start + maxSliceCssPx, page.cssH)
      if (end < page.cssH) {
        // Cut at the last row boundary that fits (but never leave less than half a page).
        const fit = page.breaks.filter(b => b > start + maxSliceCssPx * 0.5 && b <= end)
        if (fit.length) end = Math.max(...fit)
      }
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = page.canvas.width
      sliceCanvas.height = Math.max(1, Math.round((end - start) * pxPerCss))
      const ctx = sliceCanvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
      ctx.drawImage(page.canvas, 0, Math.round(start * pxPerCss), page.canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height)
      if (!first) pdf.addPage()
      first = false
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM, usableW, (end - start) * mmPerCssPx)
      start = end
    }
  }
  return pdf.output('blob')
}

// Generates the PDF and uploads it with the app's normal file storage; returns the stored file reference.
export async function generateAndUploadQuotationPdf(q: Quotation, tpl: QuotationTemplateData, clientName: string): Promise<string> {
  const blob = await generateQuotationPdf(q, tpl, clientName)
  return storeFile(new File([blob], quotationPdfFileName(q, clientName), { type: 'application/pdf' }))
}

export async function downloadQuotationPdf(q: Quotation, tpl: QuotationTemplateData, clientName: string): Promise<void> {
  const blob = await generateQuotationPdf(q, tpl, clientName)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = quotationPdfFileName(q, clientName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
