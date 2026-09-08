import { savePushSubscription, deletePushSubscription } from '../services/pushSubscriptionService'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

// Web Push wants the VAPID key as a raw Uint8Array, but it's handed out as a
// URL-safe base64 string.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Also re-saves the subscription to Supabase whenever the browser still has
// one — the server-side row gets deleted the moment a push to it bounces
// (subscription expired/revoked), but the browser doesn't get told that
// happened, so it can keep reporting "subscribed" locally long after the
// server has forgotten about it. Re-syncing on every check closes that gap
// without requiring the person to notice and manually re-toggle it.
export interface PushSubscriptionStatus {
  status: 'subscribed' | 'unsubscribed' | 'unsupported'
  syncError?: string
}

export async function getPushSubscriptionStatus(managedUserId: string): Promise<PushSubscriptionStatus> {
  if (!isPushSupported()) return { status: 'unsupported' }
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (!sub) return { status: 'unsubscribed' }
    try {
      await savePushSubscription(managedUserId, sub)
    } catch (err) {
      // The browser genuinely has a subscription, but re-saving it to our
      // server just failed — surface why instead of quietly reporting
      // "subscribed" (which was misleading) or "unsubscribed" (which hides
      // the real cause).
      return { status: 'subscribed', syncError: err instanceof Error ? err.message : 'Could not sync with server.' }
    }
    return { status: 'subscribed' }
  } catch {
    return { status: 'unsubscribed' }
  }
}

// Requests notification permission (if needed) and subscribes this device,
// saving the subscription against the given managed-user id so send-push can
// find it later.
export async function enablePushNotifications(managedUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Push notifications are not supported on this device/browser.' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, error: 'Notification permission was not granted.' }

    const registration = await navigator.serviceWorker.ready
    let sub = await registration.pushManager.getSubscription()
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      })
    }
    await savePushSubscription(managedUserId, sub)
    return { ok: true }
  } catch (err) {
    // Nothing here was surfaced to the UI before — subscribe() failures (a
    // real, recurring source of "notifications just don't work" with no
    // visible error) silently became unhandled rejections instead.
    return { ok: false, error: err instanceof Error ? err.message : 'Could not enable notifications.' }
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return
  await deletePushSubscription(sub.endpoint)
  await sub.unsubscribe()
}
