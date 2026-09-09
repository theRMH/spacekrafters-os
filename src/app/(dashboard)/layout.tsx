import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/Sidebar'
import { UserRole } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  const role = (profile?.role || 'sales') as UserRole
  const fullName = profile?.full_name || ''

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} fullName={fullName} email={user.email || ''} />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: '#1a2236' }}>
              {(fullName || user.email || 'U')[0].toUpperCase()}
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-800">{fullName || user.email}</p>
              <p className="text-slate-500 text-xs capitalize">{role.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
