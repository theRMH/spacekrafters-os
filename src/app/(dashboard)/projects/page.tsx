import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { STAGE_LABELS, ProjectStage } from '@/types'
import CircularProgress from '@/components/ui/CircularProgress'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const supabase = await createClient()
  const sp = await searchParams

  let query = supabase.from('projects').select('*').order('created_at', { ascending: false })
  if (sp.q) query = query.ilike('client_name', `%${sp.q}%`)
  if (sp.stage) query = query.eq('current_stage', sp.stage)

  const { data: projects } = await query.limit(50)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 mb-5 p-4">
        <form className="flex gap-3">
          <input name="q" defaultValue={sp.q} placeholder="Search projects..." className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none" />
          <select name="stage" defaultValue={sp.stage} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">All Stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: '#1a2236' }}>Filter</button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.length === 0 && (
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">No projects found</div>
        )}
        {projects?.map(p => (
          <Link key={p.id} href={`/projects/${p.id}`}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition block">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 mr-3">
                <p className="font-semibold text-slate-900 truncate">{p.project_name}</p>
                <p className="text-sm text-slate-500">{p.client_name}</p>
              </div>
              <CircularProgress percent={p.progress_percent || 0} size={60} />
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Stage</span>
                <span className="font-medium text-slate-700">{STAGE_LABELS[p.current_stage as ProjectStage] || p.current_stage}</span>
              </div>
              {p.order_value > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Order Value</span>
                  <span className="font-medium text-slate-700">₹{p.order_value.toLocaleString()}</span>
                </div>
              )}
              {p.promised_delivery_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery</span>
                  <span className="font-medium text-slate-700">{new Date(p.promised_delivery_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <span className={`text-xs px-2 py-1 rounded-full ${p.payment_status === 'paid' ? 'bg-green-100 text-green-700' : p.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                {p.payment_status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
