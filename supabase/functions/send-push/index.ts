// Deploy with: npx supabase functions deploy send-push
// Requires a Supabase CLI login + `supabase link` (see admin-user-sync's own
// header comment for the exact steps — same requirement, not repeated here).
// After deploying, set these as function secrets:
//   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<value>
//   npx supabase secrets set VAPID_PUBLIC_KEY=<value>
//   npx supabase secrets set VAPID_PRIVATE_KEY=<value>
// (VAPID keys generated this session — see CHANGES.md for the exact values
// to use; the public one also needs to reach the client as
// VITE_VAPID_PUBLIC_KEY, both in .env.local and in Vercel's env vars.)
//
// Called by src/utils/pushNotifications.ts sendPushNotification() whenever
// something needs to alert specific managed users right away (first caller:
// LeaveScreen.tsx notifying MD/Admin the moment a leave request comes in).
// Sends real Web Push messages via VAPID — the private key must never reach
// the browser, hence this being a server-side function rather than a direct
// client call.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface RequestBody {
  userIds: string[]
  title: string
  body: string
  url?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
  const admin = createClient(url, serviceRoleKey)

  // Any authenticated managed user may trigger a notification (this isn't a
  // privileged action like admin-user-sync's account management) — just
  // confirm the caller has a real, current session before letting them send
  // anything at all.
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(callerToken)
  if (callerAuthError || !callerAuth.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders })
  }

  const body = (await req.json()) as RequestBody
  if (!Array.isArray(body.userIds) || body.userIds.length === 0 || !body.title || !body.body) {
    return new Response(JSON.stringify({ error: 'userIds, title, and body are required' }), { status: 400, headers: corsHeaders })
  }

  webpush.setVapidDetails('mailto:admin@spacekrafters.com', vapidPublicKey, vapidPrivateKey)

  const { data: rows, error: fetchError } = await admin
    .from('sks_push_subscriptions')
    .select('id, data')
    .in('user_id', body.userIds)
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500, headers: corsHeaders })
  }

  const payload = JSON.stringify({ title: body.title, body: body.body, url: body.url })
  let sent = 0
  let failed = 0
  const staleIds: string[] = []

  await Promise.all((rows ?? []).map(async row => {
    const sub = row.data as { endpoint: string; p256dh: string; auth: string }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent++
    } catch (err) {
      failed++
      // 404/410 means the browser's subscription is gone for good (expired,
      // uninstalled, permission revoked) — keeping it around just means every
      // future send fails the same way, so clean it up now.
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) staleIds.push(row.id)
    }
  }))

  if (staleIds.length > 0) {
    await admin.from('sks_push_subscriptions').delete().in('id', staleIds)
  }

  return new Response(JSON.stringify({ ok: true, sent, failed }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
