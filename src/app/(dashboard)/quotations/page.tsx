import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  superseded: 'bg-gray-100 text-gray-500',
}

export default async function QuotationsPage() {
  const supabase = await createClient()
  const { data: quotations } = await supabase
    .from('quotations')
    .select('*, project:projects(project_name, client_name), creator:users!created_by(full_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
      </div>
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Project</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Ver.</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Created By</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!quotations?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No quotations yet</td></tr>}
              {quotations?.map(q => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/quotations/${q.id}`} className="font-medium text-slate-800 hover:underline">
                      {(q.project as { project_name?: string })?.project_name || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{(q.project as { client_name?: string })?.client_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">v{q.version}</td>
                  <td className="px-4 py-3 font-medium">₹{q.total_amount?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[q.status] || ''}`}>{q.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{(q.creator as { full_name?: string })?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(q.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
