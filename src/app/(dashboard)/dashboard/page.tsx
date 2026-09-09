import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ count: totalLeads }, { count: totalProjects }, { count: activeProjects }, { data: recentProjects }] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }).neq('current_stage', 'installation_completed'),
    supabase.from('projects').select('id,project_name,client_name,current_stage,progress_percent,order_value').order('created_at', { ascending: false }).limit(5),
  ])

  const stats = [
    { label: 'Total Leads', value: totalLeads ?? 0, icon: '🎯', color: '#1a2236' },
    { label: 'Total Projects', value: totalProjects ?? 0, icon: '📁', color: '#1a2236' },
    { label: 'Active Projects', value: activeProjects ?? 0, icon: '⚙️', color: '#1a2236' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: '#f0f4ff' }}>
              {s.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Recent Projects</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {recentProjects?.length === 0 && (
            <p className="px-5 py-8 text-center text-slate-500">No projects yet</p>
          )}
          {recentProjects?.map(p => (
            <div key={p.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{p.project_name}</p>
                <p className="text-sm text-slate-500">{p.client_name}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600">{p.progress_percent}%</span>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
                  {p.current_stage?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
