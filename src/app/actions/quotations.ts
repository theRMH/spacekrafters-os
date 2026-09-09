'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyTelegram } from '@/lib/notifications'
import { logActivity } from './activity'

export async function createQuotation(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const lineItemsRaw = formData.get('line_items') as string
  const lineItems = JSON.parse(lineItemsRaw || '[]')
  const subtotal = lineItems.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0)
  const discountPercent = parseFloat(formData.get('discount_percent') as string) || 0
  const discountAmount = (subtotal * discountPercent) / 100
  const taxPercent = parseFloat(formData.get('tax_percent') as string) || 0
  const taxAmount = ((subtotal - discountAmount) * taxPercent) / 100
  const totalAmount = subtotal - discountAmount + taxAmount

  const { data: existing } = await supabase.from('quotations').select('version').eq('project_id', projectId).order('version', { ascending: false }).limit(1).single()
  const version = (existing?.version || 0) + 1

  const payload = {
    project_id: projectId,
    version,
    status: 'draft',
    line_items: lineItems,
    subtotal,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    total_sqft: parseFloat(formData.get('total_sqft') as string) || null,
    notes: formData.get('notes') as string || null,
    terms: formData.get('terms') as string || null,
    valid_until: formData.get('valid_until') as string || null,
    created_by: user.id,
  }

  const { data, error } = await supabase.from('quotations').insert(payload).select().single()
  if (error) return { error: error.message }

  await logActivity('quotation', data.id, 'created', `Quotation v${version} created`)
  revalidatePath(`/quotations`)
  revalidatePath(`/projects/${projectId}`)
  return { data }
}

export async function submitQuotationForApproval(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('quotations').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).select('*, project:projects(project_name, client_name)').single()
  if (error) return { error: error.message }

  await logActivity('quotation', id, 'submitted', 'Submitted for approval')
  await notifyTelegram('quotation_created', { project_name: data.project?.project_name, client_name: data.project?.client_name, total_amount: data.total_amount, version: data.version })
  revalidatePath(`/quotations/${id}`)
  return { success: true }
}

export async function approveQuotation(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return { error: 'Only owner can approve quotations' }

  const { data, error } = await supabase.from('quotations').update({
    status: 'approved', approved_by: user.id, approved_at: new Date().toISOString()
  }).eq('id', id).select('*, project:projects(project_name, client_name, id)').single()
  if (error) return { error: error.message }

  await supabase.from('projects').update({ current_stage: 'quotation_approved', progress_percent: 40 }).eq('id', data.project_id)
  await logActivity('quotation', id, 'approved', 'Quotation approved by owner')
  await notifyTelegram('quotation_approved', { project_name: data.project?.project_name, client_name: data.project?.client_name, total_amount: data.total_amount })

  revalidatePath(`/quotations/${id}`)
  revalidatePath('/quotations')
  return { success: true }
}

export async function rejectQuotation(id: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('quotations').update({
    status: 'rejected', rejected_by: user.id, rejected_at: new Date().toISOString(), rejection_reason: reason
  }).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('quotation', id, 'rejected', `Quotation rejected: ${reason}`)
  revalidatePath(`/quotations/${id}`)
  return { success: true }
}
