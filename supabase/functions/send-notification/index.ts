// Deploy with: npx supabase functions deploy send-notification
// Requires a Supabase CLI login + `supabase link` (see admin-user-sync's own
// header comment for the exact steps — same requirement, not repeated here).
// After deploying, set the service role key as a function secret:
//   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<value>
//
// Called by src/utils/notifications.ts sendNotification() alongside
// send-push, to cover the SMS and WhatsApp channels. No SMS/WhatsApp
// provider has been chosen yet, so both channels are stubbed below — this
// function still runs end-to-end (auth check, phone-number lookup, a clean
// per-channel result), it just reports `sent: 0` until a provider is wired
// in. Swap the two sendSms/sendWhatsApp bodies for a real provider call once
// one is chosen; nothing else in this function or its callers needs to
// change.
//
// Once a provider is picked, set its secrets, e.g.:
//   npx supabase secrets set SMS_PROVIDER_API_KEY=<value> SMS_PROVIDER_API_URL=<value>
//   npx supabase secrets set WHATSAPP_PROVIDER_API_KEY=<value> WHATSAPP_PROVIDER_API_URL=<value>
// (names above are placeholders — use whatever the chosen provider's API expects.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Channel = 'sms' | 'whatsapp'

interface RequestBody {
  userIds: string[]
  title: string
  body: string
  channels: Channel[]
}

interface ChannelOutcome {
  sent: number
  skipped: number
  reason?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- Provider stubs -------------------------------------------------------
// Called once per recipient phone number. Each returns true only once it
// actually sent something — until a provider is configured, both just
// report "not configured" and no message goes out.

async function sendSms(_phone: string, _message: string): Promise<boolean> {
  const apiKey = Deno.env.get('SMS_PROVIDER_API_KEY')
  if (!apiKey) return false
  // TODO: call the chosen SMS provider's API here, e.g.:
  //   const res = await fetch(Deno.env.get('SMS_PROVIDER_API_URL')!, {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ to: _phone, message: _message }),
  //   })
  //   return res.ok
  return false
}

async function sendWhatsApp(_phone: string, _message: string): Promise<boolean> {
  const apiKey = Deno.env.get('WHATSAPP_PROVIDER_API_KEY')
  if (!apiKey) return false
  // TODO: call the chosen WhatsApp provider's API here (e.g. Meta WhatsApp
  // Cloud API, Gupshup, Twilio WhatsApp) — same shape as sendSms above.
  return false
}

const SENDERS: Record<Channel, (phone: string, message: string) => Promise<boolean>> = {
  sms: sendSms,
  whatsapp: sendWhatsApp,
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
  const admin = createClient(url, serviceRoleKey)

  // Any authenticated managed user may trigger a notification (matches
  // send-push's own reasoning) — just confirm the caller has a real, current
  // session before letting them send anything at all.
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(callerToken)
  if (callerAuthError || !callerAuth.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders })
  }

  const body = (await req.json()) as RequestBody
  if (
    !Array.isArray(body.userIds) || body.userIds.length === 0 ||
    !body.title || !body.body ||
    !Array.isArray(body.channels) || body.channels.length === 0
  ) {
    return new Response(JSON.stringify({ error: 'userIds, title, body, and channels are required' }), { status: 400, headers: corsHeaders })
  }

  const { data: rows, error: fetchError } = await admin
    .from('sks_managed_users')
    .select('id, data')
    .in('id', body.userIds)
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500, headers: corsHeaders })
  }

  const message = `${body.title}: ${body.body}`
  const results: Partial<Record<Channel, ChannelOutcome>> = {}

  for (const channel of body.channels) {
    const send = SENDERS[channel]
    let sent = 0
    let skipped = 0
    for (const row of rows ?? []) {
      const phone = (row.data as { mobile?: string } | null)?.mobile
      if (!phone) { skipped++; continue }
      const ok = await send(phone, message)
      if (ok) sent++
      else skipped++
    }
    results[channel] = { sent, skipped, reason: sent === 0 ? 'not_configured_or_failed' : undefined }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
