import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rescheduled: 'bg-yellow-100 text-yellow-700',
}

export default async function SiteVisitsPage() {
  const supabase = await createClient()
  const { data: visits } = await supabase
    .from('site_visits')
    .select('*, project:projects(project_name, client_name), engineer:users!assigned_engineer_id(full_name)')
    .order('scheduled_date', { ascending: false })
    .limit(50)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Site Visits</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Project</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Engineer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Scheduled</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!visits?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No site visits yet</td></tr>}
              {visits?.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{(v.project as { project_name?: string })?.project_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{(v.project as { client_name?: string })?.client_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{(v.engineer as { full_name?: string })?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(v.scheduled_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || ''}`}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
