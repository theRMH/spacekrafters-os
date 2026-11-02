import { describe, it, expect } from 'vitest'
import { generatePurchaseOrderPdf, purchaseOrderFileName } from './purchaseOrderPdf'
import type { VendorOrder } from '../types'

const order = (lineCount: number): VendorOrder => ({
  id: 'v1', poNumber: 'PO-PRJ-SK010-1', name: 'Sai Enterprises', gstin: '33AFMFS2882P1Z6', phone: '7200257412', email: 'vendor@example.com',
  address: 'No 3/25, Senthamizh Nagar, Kamarajar Salai, Ramapuram, Chennai, TAMIL NADU, 600089',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    id: `l${i}`, category: 'Plywood', description: `Office Table ${i + 1}`, spec: 'As per image, laminate colour attached',
    unit: 'Nos', qty: '4', rate: '4500', hsn: '94033010', gstPercent: '18',
  })),
  createdAt: '', updatedAt: '',
})

describe('purchase order PDF', () => {
  it('draws a PDF', async () => {
    const blob = await generatePurchaseOrderPdf(order(2), 'PRJ-SK010 - Test Project', new Date('2026-10-23'))
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
  })

  it('runs onto more pages for a long order', async () => {
    const short = await generatePurchaseOrderPdf(order(2), 'P')
    const long = await generatePurchaseOrderPdf(order(40), 'P')
    expect(long.size).toBeGreaterThan(short.size)
  })

  it('names the file after the PO and the vendor', () => {
    expect(purchaseOrderFileName(order(1))).toBe('PO-PRJ-SK010-1_Sai_Enterprises.pdf')
  })
})
