import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

let _client: SupabaseClient | null = null

if (url && key) {
  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    // Stay logged in across refreshes/new tabs/browser restarts until the
    // user explicitly logs out — sessionStorage previously logged everyone
    // out on every refresh/new session, which is what this replaces.
    auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true },
  })
} else {
  console.warn(
    '[SpaceKrafters] Supabase is not configured. Cross-device sync will not work.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.'
  )
}

export const supabase: SupabaseClient | null = _client
export const isSupabaseConfigured: boolean   = _client !== null
