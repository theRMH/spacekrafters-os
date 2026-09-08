import { supabase } from '../lib/supabase'

const TABLE = 'sks_push_subscriptions'

export async function savePushSubscription(managedUserId: string, sub: PushSubscription): Promise<void> {
  if (!supabase) return
  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser subscription is missing encryption keys.')
  }
  const { error } = await supabase.from(TABLE).upsert({
    managed_user_id: managedUserId,
    endpoint:        sub.endpoint,
    p256dh:          json.keys.p256dh,
    auth_key:        json.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from(TABLE).delete().eq('endpoint', endpoint)
  if (error) console.error('[SpaceKrafters] push subscription delete error:', error.message)
}
