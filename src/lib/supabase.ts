import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

let _client: SupabaseClient | null = null

// The session itself always lives under this one fixed sessionStorage key —
// sessionStorage is already correctly tab-isolated by the browser, so a
// normal refresh (same tab) finds it again with no extra bookkeeping needed.
const SESSION_STORAGE_KEY = 'sks-session'
const tabScopedStorage = {
  getItem:    (_k: string) => window.sessionStorage.getItem(SESSION_STORAGE_KEY),
  setItem:    (_k: string, v: string) => window.sessionStorage.setItem(SESSION_STORAGE_KEY, v),
  removeItem: (_k: string) => window.sessionStorage.removeItem(SESSION_STORAGE_KEY),
}

if (url && key) {
  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      // sessionStorage (not localStorage): each browser TAB gets its own
      // independent login, which is required for QA to run multiple roles
      // side by side in one browser. A normal page refresh (F5) does NOT log
      // the tab out — sessionStorage survives reloads and persists for the
      // life of that tab; it only clears when the tab itself is closed.
      // Session data always lives under the same fixed key (tabScopedStorage
      // above), so refresh persistence doesn't depend on storageKey below.
      storage: tabScopedStorage,
      // storageKey is regenerated fresh on every single page load (never
      // cached anywhere) purely so each load gets its own Supabase
      // BroadcastChannel — Supabase's client always opens one named after
      // storageKey to sync auth state across every tab/page of the origin,
      // regardless of localStorage vs sessionStorage. With a shared name, a
      // login on tab B fires tab A's onAuthStateChange too — with tab B's
      // session — and AuthContext.tsx's handler then tries to load *that*
      // user's profile using tab A's own JWT, which RLS correctly rejects
      // (managed-user lookup is scoped to auth_user_id = auth.uid()); the
      // existing "no profile found" fallback then calls
      // supabase.auth.signOut(), signing tab A itself out.
      //   An earlier version of this fix cached the id in sessionStorage so
      // it would survive refreshes — but *duplicating* a tab copies its
      // whole sessionStorage too, so a duplicated tab inherited its source
      // tab's id and the two silently shared a channel again the moment you
      // logged into a different role in the duplicate. Generating fresh on
      // every load closes that gap regardless of how a tab was opened: a
      // duplicate still starts logged in as its source (sessionStorage
      // content really is copied — unavoidable, and fine), but it no longer
      // shares a live broadcast channel with that source, so logging into a
      // different role there can't sign the original tab out anymore.
      storageKey: `sb-${crypto.randomUUID()}-auth-token`,
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
