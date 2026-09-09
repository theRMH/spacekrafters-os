'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyTelegram } from '@/lib/notifications'
import { logActivity } from './activity'
import { STAGE_PROGRESS, ProjectStage } from '@/types'

export async function confirmOrder(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const orderValue = parseFloat(formData.get('order_value') as string) || 0
  const advancePaid = parseFloat(formData.get('advance_paid') as string) || 0

  const payload = {
    order_value: orderValue,
    advance_paid: advancePaid,
    balance_amount: orderValue - advancePaid,
    payment_status: advancePaid >= orderValue ? 'paid' : advancePaid > 0 ? 'partial' : 'pending',
    promised_delivery_date: formData.get('promised_delivery_date') as string || null,
    product_type: formData.get('product_type') as string || null,
    profile_brand: formData.get('profile_brand') as string || null,
    total_sqft: parseFloat(formData.get('total_sqft') as string) || null,
    current_stage: 'order_confirmed' as ProjectStage,
    progress_percent: 50,
    order_confirmed_at: new Date().toISOString(),
    order_confirmed_by: user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('projects').update(payload).eq('id', projectId).select('*, owner:users(full_name)').single()
  if (error) return { error: error.message }

  await logActivity('project', projectId, 'order_confirmed', 'Order confirmed')
  await notifyTelegram('order_confirmed', {
    project_name: data.project_name,
    client_name: data.client_name,
    order_value: orderValue,
    advance_paid: advancePaid,
    balance_amount: orderValue - advancePaid,
    promised_delivery_date: payload.promised_delivery_date,
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  return { data }
}

export async function updateProjectStage(projectId: string, newStage: ProjectStage) {
  const supabase = await createClient()
  const progress = STAGE_PROGRESS[newStage]
  const payload: Record<string, unknown> = {
    current_stage: newStage,
    progress_percent: progress,
    updated_at: new Date().toISOString(),
  }
  if (newStage === 'installation_completed') {
    payload.completed_at = new Date().toISOString()
    payload.installation_status = 'completed'
  }

  const { error } = await supabase.from('projects').update(payload).eq('id', projectId)
  if (error) return { error: error.message }

  await logActivity('project', projectId, 'stage_updated', `Stage changed to ${newStage}`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  return { success: true }
}

export async function addProjectComment(projectId: string, comment: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('project_comments').insert({
    project_id: projectId,
    comment,
    created_by: user.id,
  })
  if (error) return { error: error.message }

  await logActivity('project', projectId, 'comment_added', 'Comment added')
  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
