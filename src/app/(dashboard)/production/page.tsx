import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { STAGE_LABELS, ProjectStage } from '@/types'

const PRODUCTION_STAGES: ProjectStage[] = ['order_confirmed', 'production_released', 'production_started', 'packing_completed', 'dispatch_ready']

export default async function ProductionPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id,project_name,client_name,current_stage,progress_percent,promised_delivery_date,product_type')
    .in('current_stage', PRODUCTION_STAGES)
    .order('promised_delivery_date', { ascending: true })

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Production</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {PRODUCTION_STAGES.map(stage => (
          <div key={stage} className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 rounded-t-xl" style={{ backgroundColor: '#f0f4ff' }}>
              <p className="font-medium text-sm" style={{ color: '#1a2236' }}>{STAGE_LABELS[stage]}</p>
              <p className="text-xs text-slate-500">{projects?.filter(p => p.current_stage === stage).length || 0} projects</p>
            </div>
            <div className="p-3 space-y-2">
              {projects?.filter(p => p.current_stage === stage).map(p => (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className="block p-3 rounded-lg border border-slate-100 hover:border-slate-300 transition">
                  <p className="font-medium text-sm text-slate-800 truncate">{p.project_name}</p>
                  <p className="text-xs text-slate-500">{p.client_name}</p>
                  {p.promised_delivery_date && (
                    <p className="text-xs text-slate-400 mt-1">📅 {new Date(p.promised_delivery_date).toLocaleDateString()}</p>
                  )}
                </Link>
              ))}
              {projects?.filter(p => p.current_stage === stage).length === 0 && (
                <p className="text-xs text-slate-400 py-2 text-center">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
