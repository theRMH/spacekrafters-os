import { DatabaseZap } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'

export function DbBanner() {
  if (isSupabaseConfigured) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[499] bg-red-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 py-1.5 px-4">
      <DatabaseZap size={11} />
      Database not connected. Add Supabase credentials to .env.local to enable sync.
    </div>
  )
}
