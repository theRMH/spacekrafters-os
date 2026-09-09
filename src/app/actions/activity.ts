'use server'

import { createClient } from '@/lib/supabase/server'

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  description: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('activity_history').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    performed_by: user?.id,
  })
}
