import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function InstallationPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id,project_name,client_name,phone,current_stage,installation_status,promised_delivery_date,balance_amount')
    .in('current_stage', ['delivered', 'dispatch_ready'])
    .order('promised_delivery_date', { ascending: true })

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Installation</h1>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Project</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Install Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!projects?.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No projects ready for installation</td></tr>}
              {projects?.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><Link href={`/projects/${p.id}`} className="font-medium text-slate-800 hover:underline">{p.project_name}</Link></td>
                  <td className="px-4 py-3 text-slate-600">{p.client_name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{p.current_stage?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.installation_status === 'completed' ? 'bg-green-100 text-green-700' : p.installation_status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {p.installation_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-orange-600">₹{p.balance_amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
