import { supabase } from '../lib/supabase'
import type { PurchaseRequest, VendorQuote, PurchaseOrder, GoodsReceipt, VendorBill } from '../types'

const PR_TABLE    = 'sks_purchase_requests'
const QUOTE_TABLE = 'sks_vendor_quotes'
const PO_TABLE    = 'sks_purchase_orders'
const GRN_TABLE   = 'sks_goods_receipts'
const BILL_TABLE  = 'sks_vendor_bills'

export async function getAllPurchaseRequests(): Promise<PurchaseRequest[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PR_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PurchaseRequest)
}

export async function upsertPurchaseRequest(pr: PurchaseRequest): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PR_TABLE).upsert({
    id:         pr.id,
    project_id: pr.projectId ?? null,
    status:     pr.status,
    data:       pr,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deletePurchaseRequest(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PR_TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllVendorQuotes(): Promise<VendorQuote[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(QUOTE_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as VendorQuote)
}

export async function addVendorQuote(quote: VendorQuote): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(QUOTE_TABLE).insert({
    id:                  quote.id,
    purchase_request_id: quote.purchaseRequestId,
    vendor_id:           quote.vendorId,
    data:                quote,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PO_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PurchaseOrder)
}

export async function upsertPurchaseOrder(po: PurchaseOrder): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PO_TABLE).upsert({
    id:                  po.id,
    purchase_request_id: po.purchaseRequestId ?? null,
    vendor_id:           po.vendorId,
    project_id:          po.projectId ?? null,
    status:              po.status,
    data:                po,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllGoodsReceipts(): Promise<GoodsReceipt[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(GRN_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as GoodsReceipt)
}

export async function addGoodsReceipt(grn: GoodsReceipt): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(GRN_TABLE).insert({
    id:                grn.id,
    purchase_order_id: grn.purchaseOrderId,
    data:              grn,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllVendorBills(): Promise<VendorBill[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(BILL_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as VendorBill)
}

export async function upsertVendorBill(bill: VendorBill): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(BILL_TABLE).upsert({
    id:                 bill.id,
    vendor_id:          bill.vendorId,
    purchase_order_id:  bill.purchaseOrderId ?? null,
    status:             bill.status,
    data:               bill,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
