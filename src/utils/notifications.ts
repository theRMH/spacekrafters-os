import { supabase } from '../lib/supabase'
import { sendPushNotification } from './pushNotifications'

// SMS/WhatsApp go through the send-notification Edge Function — see its
// header for why both channels are currently no-ops (no provider chosen
// yet) and what "configuring the real provider later" means in practice.
// This call is safe to make today: it just reports "not configured" per
// channel instead of sending anything, and starts sending for real the
// moment provider secrets are set, with no client-side changes needed.
async function sendTextNotification(
  userIds: string[], title: string, body: string, channels: ('sms' | 'whatsapp')[],
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase || userIds.length === 0) return { ok: true }
  const { data, error } = await supabase.functions.invoke('send-notification', { body: { userIds, title, body, channels } })
  if (error) return { ok: false, error: error.message }
  return { ok: data?.ok !== false, error: data?.error }
}

export async function sendSmsNotification(userIds: string[], title: string, body: string) {
  return sendTextNotification(userIds, title, body, ['sms'])
}

export async function sendWhatsAppNotification(userIds: string[], title: string, body: string) {
  return sendTextNotification(userIds, title, body, ['whatsapp'])
}

// Canonical notification entry point — fires every channel (push works
// today; SMS/WhatsApp are wired end-to-end but no-op until a provider is
// configured, see send-notification/index.ts). Every place in the CRM that
// needs to alert someone should call this instead of sendPushNotification
// directly, so SMS/WhatsApp light up automatically everywhere the moment a
// provider is configured — no per-call-site changes needed later.
// Best-effort, same convention as the rest of the app's side effects: never
// throws, never blocks the action that triggered it.
export async function sendNotification(
  userIds: string[], title: string, body: string, url?: string,
): Promise<{ ok: boolean; errors: string[] }> {
  if (userIds.length === 0) return { ok: true, errors: [] }
  const [push, text] = await Promise.all([
    sendPushNotification(userIds, title, body, url),
    sendTextNotification(userIds, title, body, ['sms', 'whatsapp']),
  ])
  const errors = [push, text].filter(r => !r.ok).map(r => r.error ?? 'Unknown error')
  return { ok: errors.length === 0, errors }
}
