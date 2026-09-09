'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyTelegram } from '@/lib/notifications'
import { logActivity } from './activity'

export async function createLead(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const payload = {
    client_name: formData.get('client_name') as string,
    phone: formData.get('phone') as string,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
    product_interest: formData.get('product_interest') as string || null,
    source: formData.get('source') as string || null,
    notes: formData.get('notes') as string || null,
    owner_id: (formData.get('owner_id') as string) || user.id,
    created_by: user.id,
    status: 'new',
  }

  const { data, error } = await supabase.from('leads').insert(payload).select().single()
  if (error) return { error: error.message }

  await logActivity('lead', data.id, 'created', `Lead created for ${payload.client_name}`)
  await notifyTelegram('lead_created', { client_name: payload.client_name, phone: payload.phone, product_interest: payload.product_interest, source: payload.source })

  revalidatePath('/leads')
  return { data }
}

export async function updateLeadStatus(id: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  await logActivity('lead', id, 'status_updated', `Status changed to ${status}`)
  revalidatePath(`/leads/${id}`)
  revalidatePath('/leads')
  return { success: true }
}

export async function assignLeadOwner(id: string, ownerId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('leads').update({ owner_id: ownerId, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  await logActivity('lead', id, 'owner_assigned', `Lead owner reassigned`)
  revalidatePath(`/leads/${id}`)
  return { success: true }
}

export async function addLeadNote(id: string, note: string) {
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('notes').eq('id', id).single()
  const updatedNotes = lead?.notes ? `${lead.notes}\n\n${note}` : note
  const { error } = await supabase.from('leads').update({ notes: updatedNotes, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  await logActivity('lead', id, 'note_added', 'Note added to lead')
  revalidatePath(`/leads/${id}`)
  return { success: true }
}

export async function convertLeadToProject(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single()
  if (!lead) return { error: 'Lead not found' }

  const project = {
    lead_id: id,
    client_name: lead.client_name,
    phone: lead.phone,
    email: lead.email,
    project_name: formData.get('project_name') as string,
    product_type: formData.get('product_type') as string || null,
    current_stage: 'lead_created',
    progress_percent: 5,
    order_value: 0,
    advance_paid: 0,
    balance_amount: 0,
    payment_status: 'pending',
    installation_status: 'pending',
    owner_id: lead.owner_id,
    created_by: user.id,
    is_imported: false,
  }

  const { data: projectData, error: projectError } = await supabase.from('projects').insert(project).select().single()
  if (projectError) return { error: projectError.message }

  await supabase.from('leads').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', id)
  await logActivity('lead', id, 'converted', `Converted to project: ${project.project_name}`)
  await notifyTelegram('lead_converted', { client_name: lead.client_name, project_name: project.project_name })

  revalidatePath('/leads')
  revalidatePath('/projects')
  return { data: projectData }
}
