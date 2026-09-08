// Deploy with: npx supabase functions deploy admin-user-sync
// Requires a Supabase CLI login + `supabase link` (needs a personal access
// token from the Supabase dashboard — not the same as the service role key).
// After deploying, set the service role key as a function secret:
//   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<value>
//
// Called by UserManagementScreen.tsx whenever an owner creates a user or
// changes an existing user's mobile number / password — creates or updates
// the matching Supabase Auth account so the app-level `sks_managed_users`
// row and the real login credential never drift apart. The browser can't do
// this directly because it requires the service role key, which must never
// reach client code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Must match src/utils/authIdentity.ts — kept in sync by hand since this Deno
// function can't import a TS module from the Vite app.
function syntheticEmailFromMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10)
  return `u${digits}@sks.internal`
}

interface RequestBody {
  managedUserId: string
  mobile: string
  password?: string   // omitted when only non-credential fields changed
  action?: 'delete'   // omitted for the normal create/update path
}

// The browser calls this cross-origin, so every response (including the
// preflight) needs these or the fetch never reaches the function at all.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceRoleKey)

  // Verify the caller's own session, then verify they hold the owner role —
  // never trust a client-supplied role claim for a privileged operation.
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(callerToken)
  if (callerAuthError || !callerAuth.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: corsHeaders })
  }
  const { data: callerProfile } = await admin
    .from('sks_managed_users')
    .select('data')
    .eq('auth_user_id', callerAuth.user.id)
    .maybeSingle()
  const callerRoles: string[] = callerProfile?.data?.roles ?? [callerProfile?.data?.role]
  if (!callerRoles.includes('owner')) {
    return new Response(JSON.stringify({ error: 'Forbidden — owner role required' }), { status: 403, headers: corsHeaders })
  }

  const body = (await req.json()) as RequestBody
  if (!body.managedUserId) {
    return new Response(JSON.stringify({ error: 'managedUserId is required' }), { status: 400, headers: corsHeaders })
  }

  if (body.action === 'delete') {
    if (body.managedUserId === callerProfile?.data?.id) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own account.' }), { status: 400, headers: corsHeaders })
    }
    try {
      const { data: target } = await admin
        .from('sks_managed_users')
        .select('auth_user_id')
        .eq('id', body.managedUserId)
        .maybeSingle()
      // sks_managed_users.auth_user_id has a FK to auth.users(id), so the
      // row must go first — deleting the auth account while the row still
      // references it fails with a foreign-key violation.
      const { error: deleteError } = await admin.from('sks_managed_users').delete().eq('id', body.managedUserId)
      if (deleteError) throw deleteError
      if (target?.auth_user_id) {
        const { error } = await admin.auth.admin.deleteUser(target.auth_user_id)
        if (error && error.status !== 404) throw error
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: corsHeaders })
    }
  }

  if (!body.mobile) {
    return new Response(JSON.stringify({ error: 'mobile is required' }), { status: 400, headers: corsHeaders })
  }
  const email = syntheticEmailFromMobile(body.mobile)

  const { data: existingRow } = await admin
    .from('sks_managed_users')
    .select('auth_user_id')
    .eq('id', body.managedUserId)
    .maybeSingle()

  try {
    let authUserId = existingRow?.auth_user_id as string | undefined

    if (authUserId) {
      // Existing user — update email (if mobile changed) and/or password (if provided)
      const updates: { email?: string; password?: string } = { email }
      if (body.password) updates.password = body.password
      const { error } = await admin.auth.admin.updateUserById(authUserId, updates)
      if (error) throw error
    } else {
      // New user — create the auth account and link it back
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: body.password, email_confirm: true,
      })
      if (error) throw error
      authUserId = created.user.id
      const { error: linkError } = await admin
        .from('sks_managed_users')
        .update({ auth_user_id: authUserId })
        .eq('id', body.managedUserId)
      if (linkError) throw linkError
    }

    return new Response(JSON.stringify({ ok: true, authUserId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: corsHeaders })
  }
})
