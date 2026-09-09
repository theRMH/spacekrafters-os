import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { inviteUser } from '@/app/actions/auth'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'owner') redirect('/dashboard')

  const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">User Management</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Invite User */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Invite User</h2>
          <form action={inviteUser as (fd: FormData) => void} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Full Name</label>
              <input name="full_name" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input name="email" type="email" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Role</label>
              <select name="role" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="sales">Sales</option>
                <option value="site_engineer">Site Engineer</option>
                <option value="cold_call_leader">Cold Call Leader</option>
                <option value="production_admin">Production Admin</option>
                <option value="production_manager">Production Manager</option>
              </select>
            </div>
            <button type="submit" className="w-full py-2 rounded-lg text-white font-medium" style={{ backgroundColor: '#1a2236' }}>Send Invite</button>
          </form>
        </div>

        {/* Users List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">All Users ({users?.length || 0})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {users?.map(u => (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{u.full_name || '—'}</p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">{u.role?.replace(/_/g, ' ')}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
