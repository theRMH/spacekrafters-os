import { supabase } from '../lib/supabase'
import type { AppNotification } from '../types'

const TABLE = 'sks_notifications'

function fromRow(r: any): AppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.data?.title ?? '',
    body: r.data?.body ?? '',
    url: r.data?.url ?? undefined,
    readAt: r.read_at ?? undefined,
    createdAt: r.created_at,
  }
}

// RLS scopes this to the signed-in user's own rows (user_id = sks_my_id()) —
// no client-side filtering needed.
export async function getMyNotifications(): Promise<AppNotification[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(50)
  if (error || !data) return []
  return data.map(fromRow)
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from(TABLE).update({ read_at: new Date().toISOString() }).eq('id', id)
}

// RLS already scopes every row to the signed-in user (user_id = sks_my_id()),
// so this can only ever touch the caller's own unread notifications.
export async function markAllNotificationsRead(): Promise<void> {
  if (!supabase) return
  await supabase.from(TABLE).update({ read_at: new Date().toISOString() }).is('read_at', null)
}

// One row per recipient — persists what sendNotification() already sends as a
// push/SMS/WhatsApp alert, so it also survives refresh/logout and is there
// when the recipient logs in later, not just delivered in the moment.
export async function createNotifications(userIds: string[], title: string, body: string, url?: string): Promise<void> {
  if (!supabase || userIds.length === 0) return
  const now = Date.now()
  const rows = userIds.map((userId, i) => ({
    id: `notif_${now}_${i}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    data: { title, body, url },
  }))
  const { error } = await supabase.from(TABLE).insert(rows)
  if (error) console.error('[SpaceKrafters] notification insert error:', error.message)
}
