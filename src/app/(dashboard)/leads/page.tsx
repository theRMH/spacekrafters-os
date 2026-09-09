import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, LeadStatus } from '@/types'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  const sp = await searchParams

  let query = supabase.from('leads').select('*, owner:users!owner_id(full_name)').order('created_at', { ascending: false })

  if (profile?.role === 'cold_call_leader') query = query.eq('owner_id', user!.id)
  if (sp.status) query = query.eq('status', sp.status)
  if (sp.q) query = query.ilike('client_name', `%${sp.q}%`)

  const { data: leads } = await query.limit(50)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <a href="/leads/new" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#1a2236' }}>
          + New Lead
        </a>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex gap-3">
          <form className="flex gap-3 flex-1">
            <input name="q" defaultValue={sp.q} placeholder="Search by name..." className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#1a2236' } as React.CSSProperties} />
            <select name="status" defaultValue={sp.status} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">All Statuses</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: '#1a2236' }}>Filter</button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Interest</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads?.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No leads found</td></tr>
              )}
              {leads?.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">{lead.client_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.product_interest || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{lead.source?.replace(/_/g, ' ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{(lead.owner as { full_name?: string })?.full_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${LEAD_STATUS_COLORS[lead.status as LeadStatus]}`}>
                      {LEAD_STATUS_LABELS[lead.status as LeadStatus] || lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
