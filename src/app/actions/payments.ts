'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyTelegram } from '@/lib/notifications'
import { logActivity } from './activity'

export async function recordPayment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const projectId = formData.get('project_id') as string
  const amount = parseFloat(formData.get('amount') as string)

  const { data: payment, error } = await supabase.from('payments').insert({
    project_id: projectId,
    amount,
    payment_mode: formData.get('payment_mode') as string,
    reference: formData.get('reference') as string || null,
    notes: formData.get('notes') as string || null,
    payment_date: formData.get('payment_date') as string || new Date().toISOString().split('T')[0],
    recorded_by: user.id,
  }).select().single()
  if (error) return { error: error.message }

  const { data: project } = await supabase.from('projects').select('advance_paid, order_value, client_name, project_name').eq('id', projectId).single()
  if (project) {
    const newAdvance = (project.advance_paid || 0) + amount
    const newBalance = Math.max(0, (project.order_value || 0) - newAdvance)
    const paymentStatus = newBalance === 0 ? 'paid' : newAdvance > 0 ? 'partial' : 'pending'
    await supabase.from('projects').update({ advance_paid: newAdvance, balance_amount: newBalance, payment_status: paymentStatus }).eq('id', projectId)
    await notifyTelegram('payment_received', { project_name: project.project_name, client_name: project.client_name, amount, payment_mode: formData.get('payment_mode'), balance_amount: newBalance })
  }

  await logActivity('payment', payment.id, 'recorded', `Payment of ₹${amount} recorded`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/payments')
  return { data: payment }
}
