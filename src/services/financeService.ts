import { supabase } from '../lib/supabase'
import type { PaymentMilestone, Receipt, Payable, Payment } from '../types'

const MILESTONE_TABLE = 'sks_payment_milestones'
const RECEIPT_TABLE    = 'sks_receipts'
const PAYABLE_TABLE    = 'sks_payables'
const PAYMENT_TABLE    = 'sks_payments'

export async function getAllPaymentMilestones(): Promise<PaymentMilestone[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(MILESTONE_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PaymentMilestone)
}

export async function upsertPaymentMilestone(milestone: PaymentMilestone): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(MILESTONE_TABLE).upsert({
    id:         milestone.id,
    project_id: milestone.projectId,
    status:     milestone.status,
    data:       milestone,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllReceipts(): Promise<Receipt[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(RECEIPT_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Receipt)
}

export async function addReceipt(receipt: Receipt): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(RECEIPT_TABLE).insert({
    id:           receipt.id,
    project_id:   receipt.projectId ?? null,
    milestone_id: receipt.milestoneId ?? null,
    data:         receipt,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPayables(): Promise<Payable[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PAYABLE_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Payable)
}

export async function upsertPayable(payable: Payable): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PAYABLE_TABLE).upsert({
    id:         payable.id,
    vendor_id:  payable.vendorId ?? null,
    status:     payable.status,
    data:       payable,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPayments(): Promise<Payment[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PAYMENT_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Payment)
}

export async function addPayment(payment: Payment): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PAYMENT_TABLE).insert({
    id:         payment.id,
    payable_id: payment.payableId,
    data:       payment,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
