import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

let _client: SupabaseClient | null = null

// A stable id for this browser TAB (not this app load) — generated once and
// kept in sessionStorage, so it survives refreshes but is never shared with
// any other tab. Used to give each tab its own Supabase auth storage key.
function getTabId(): string {
  const KEY = '__sks_tab_id__'
  let id = window.sessionStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.sessionStorage.setItem(KEY, id)
  }
  return id
}

if (url && key) {
  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      // sessionStorage (not localStorage): each browser TAB gets its own
      // independent login, which is required for QA to run multiple roles
      // side by side in one browser. A normal page refresh (F5) does NOT log
      // the tab out — sessionStorage survives reloads and persists for the
      // life of that tab; it only clears when the tab itself is closed. Note:
      // duplicating an existing tab (or restoring tabs after a browser
      // restart) copies its sessionStorage, so the new tab starts logged in
      // as whoever the original was — open a fresh tab (Ctrl+T) instead if
      // you want to log in as a different role there.
      storage: window.sessionStorage,
      // A per-tab storageKey is the actual fix for isolation, not just the
      // storage backend: Supabase's client always opens a BroadcastChannel
      // named after storageKey to sync auth state across every tab of the
      // origin, regardless of localStorage vs sessionStorage. With a shared
      // key, logging in on tab B fires tab A's onAuthStateChange too — with
      // tab B's session — and AuthContext.tsx's handler then tries to load
      // *that* user's profile using tab A's own JWT, which RLS correctly
      // rejects (managed user lookup is scoped to auth_user_id = auth.uid()),
      // and the existing "no profile found" fallback calls supabase.auth.signOut(),
      // signing tab A itself out. A unique storageKey per tab puts each tab on
      // its own BroadcastChannel, so tabs never see each other's auth events.
      storageKey: `sb-${getTabId()}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
} else {
  console.warn(
    '[SpaceKrafters] Supabase is not configured. Cross-device sync will not work.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.'
  )
}

export const supabase: SupabaseClient | null = _client
export const isSupabaseConfigured: boolean   = _client !== null
