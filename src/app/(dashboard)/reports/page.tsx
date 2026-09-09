import { createClient } from '@/lib/supabase/server'

export default async function ReportsPage() {
  const supabase = await createClient()

  const [
    { count: totalProjects },
    { count: completedProjects },
    { data: paymentData },
    { count: activeProjects },
  ] = await Promise.all([
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('current_stage', 'installation_completed'),
    supabase.from('projects').select('order_value,balance_amount,advance_paid'),
    supabase.from('projects').select('*', { count: 'exact', head: true }).neq('current_stage', 'installation_completed'),
  ])

  const totalRevenue = paymentData?.reduce((s, p) => s + (p.advance_paid || 0), 0) || 0
  const totalOutstanding = paymentData?.reduce((s, p) => s + (p.balance_amount || 0), 0) || 0
  const totalOrderValue = paymentData?.reduce((s, p) => s + (p.order_value || 0), 0) || 0

  const stats = [
    { label: 'Total Projects', value: totalProjects ?? 0, icon: '📁' },
    { label: 'Active Projects', value: activeProjects ?? 0, icon: '⚙️' },
    { label: 'Completed Projects', value: completedProjects ?? 0, icon: '✅' },
    { label: 'Total Order Value', value: `₹${totalOrderValue.toLocaleString()}`, icon: '💼' },
    { label: 'Revenue Collected', value: `₹${totalRevenue.toLocaleString()}`, icon: '💰' },
    { label: 'Outstanding Balance', value: `₹${totalOutstanding.toLocaleString()}`, icon: '⚖️' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: '#f0f4ff' }}>
              {s.icon}
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
