// One-time migration: clears all stale localStorage data from pre-Supabase builds.
// Bump APP_VERSION any time a breaking storage change is made.
const APP_VERSION = 'v2'
const VERSION_KEY = 'fenster_app_version'

const LEGACY_KEYS = [
  'fenster_auth_user',
  'fenster_tasks',
  'fenster_leads',
  'fenster_projects',
  'fenster_payments',
  'fenster_mistakes',
  'fenster_production',
  'fenster_users',
  'fenster_quotations',
  'fenster_activity',
]

export function runMigrations(): void {
  try {
    const stored = localStorage.getItem(VERSION_KEY)
    if (stored === APP_VERSION) return

    // Wipe all legacy keys
    LEGACY_KEYS.forEach(key => localStorage.removeItem(key))

    // Also clear any other fenster_* keys not listed above
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('fenster_') && key !== VERSION_KEY) {
        toRemove.push(key)
      }
    }
    toRemove.forEach(key => localStorage.removeItem(key))

    // Clear old session from localStorage (now stored in sessionStorage)
    localStorage.removeItem('fenster_session')

    localStorage.setItem(VERSION_KEY, APP_VERSION)
    console.info('[Fenster] Migration complete — localStorage cleared for v2')
  } catch {
    // localStorage blocked (private mode etc.) — safe to ignore
  }
}
