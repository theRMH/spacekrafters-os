'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function inviteUser(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return { error: 'Only owner can invite users' }

  const email = formData.get('email') as string
  const role = formData.get('role') as string
  const full_name = formData.get('full_name') as string

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role, full_name }
  })
  if (error) return { error: error.message }

  revalidatePath('/users')
  return { data }
}
