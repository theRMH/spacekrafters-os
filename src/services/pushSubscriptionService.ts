import { supabase } from '../lib/supabase'

const TABLE = 'sks_push_subscriptions'

// sks_push_subscriptions is id/user_id/data JSONB/created_at, same shape as
// every other sks_* table (see schema.sql) — not its own flat columns. The id
// is derived deterministically from the endpoint (rather than random) so the
// same device upserts its own row instead of creating a duplicate each time
// it re-subscribes, while different devices for the same person still get
// separate rows (each has its own endpoint).
async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `push_${hex.slice(0, 32)}`
}

export async function savePushSubscription(managedUserId: string, sub: PushSubscription): Promise<void> {
  if (!supabase) return
  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser subscription is missing encryption keys.')
  }
  const id = await subscriptionId(sub.endpoint)
  const { error } = await supabase.from(TABLE).upsert({
    id,
    user_id: managedUserId,
    data: { endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
  }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!supabase) return
  const id = await subscriptionId(endpoint)
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) console.error('[SpaceKrafters] push subscription delete error:', error.message)
}
