import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { STAGE_LABELS, STAGE_PROGRESS, ProjectStage } from '@/types'
import CircularProgress from '@/components/ui/CircularProgress'
import { confirmOrder, updateProjectStage } from '@/app/actions/projects'

const ALL_STAGES: ProjectStage[] = ['lead_created','requirement_collected','site_visit_assigned','site_visit_completed','quotation_created','quotation_approved','order_confirmed','production_released','production_started','packing_completed','dispatch_ready','delivered','installation_completed']

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { data: activity }, { data: payments }, { data: { user } }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('activity_history').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('payments').select('*').eq('project_id', id).order('payment_date', { ascending: false }),
    supabase.auth.getUser(),
  ])

  if (!project) notFound()

  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  const isOwner = profile?.role === 'owner'
  const currentStageIndex = ALL_STAGES.indexOf(project.current_stage)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/projects" className="text-sm text-slate-500 hover:underline">← Projects</a>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">{project.project_name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Main Info */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{project.project_name}</h2>
              <p className="text-slate-500">{project.client_name} · {project.phone}</p>
            </div>
            <CircularProgress percent={project.progress_percent || 0} size={72} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Product</dt><dd className="font-medium">{project.product_type || '—'}</dd></div>
            <div><dt className="text-slate-500">Brand</dt><dd className="font-medium">{project.profile_brand || '—'}</dd></div>
            <div><dt className="text-slate-500">Order Value</dt><dd className="font-medium">₹{(project.order_value || 0).toLocaleString()}</dd></div>
            <div><dt className="text-slate-500">Balance</dt><dd className="font-medium text-orange-600">₹{(project.balance_amount || 0).toLocaleString()}</dd></div>
            <div><dt className="text-slate-500">Advance Paid</dt><dd className="font-medium">₹{(project.advance_paid || 0).toLocaleString()}</dd></div>
            <div><dt className="text-slate-500">Total Sqft</dt><dd className="font-medium">{project.total_sqft || '—'}</dd></div>
            <div><dt className="text-slate-500">Delivery Date</dt><dd className="font-medium">{project.promised_delivery_date ? new Date(project.promised_delivery_date).toLocaleDateString() : '—'}</dd></div>
            <div><dt className="text-slate-500">Payment</dt>
              <dd><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${project.payment_status === 'paid' ? 'bg-green-100 text-green-700' : project.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>{project.payment_status}</span></dd>
            </div>
          </dl>
        </div>

        {/* Stage Timeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-medium text-slate-800 mb-3 text-sm">Progress Timeline</h3>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {ALL_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2 text-xs">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${i < currentStageIndex ? 'bg-green-500' : i === currentStageIndex ? 'text-white' : 'bg-slate-200'}`}
                  style={i === currentStageIndex ? { backgroundColor: '#1a2236' } : {}}>
                  {i < currentStageIndex ? '✓' : <span className="text-slate-500 text-xs">{i + 1}</span>}
                </div>
                <span className={i <= currentStageIndex ? 'font-medium text-slate-800' : 'text-slate-400'}>{STAGE_LABELS[stage]}</span>
                <span className="text-slate-400 ml-auto">{STAGE_PROGRESS[stage]}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm Order (if at quotation_approved) */}
      {project.current_stage === 'quotation_approved' && isOwner && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
          <h2 className="font-semibold text-slate-800 mb-4">Confirm Order</h2>
          <form action={async (fd: FormData) => {
            'use server'
            await confirmOrder(id, fd)
          }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Order Value (₹)</label>
                <input name="order_value" type="number" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Advance Paid (₹)</label>
                <input name="advance_paid" type="number" defaultValue="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Delivery Date</label>
                <input name="promised_delivery_date" type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Product Type</label>
                <input name="product_type" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="e.g. UPVC Door" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Brand</label>
                <input name="profile_brand" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Total Sqft</label>
                <input name="total_sqft" type="number" step="0.01" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            </div>
            <button type="submit" className="mt-4 px-6 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: '#1a2236' }}>Confirm Order</button>
          </form>
        </div>
      )}

      {/* Update Stage */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
          <h2 className="font-semibold text-slate-800 mb-3">Update Stage</h2>
          <form action={async (fd: FormData) => {
            'use server'
            await updateProjectStage(id, fd.get('stage') as ProjectStage)
          }} className="flex gap-3">
            <select name="stage" defaultValue={project.current_stage} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              {ALL_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#1a2236' }}>Update</button>
          </form>
        </div>
      )}

      {/* Payments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="font-semibold text-slate-800 mb-4">Payments</h2>
        {payments?.length === 0 ? <p className="text-slate-500 text-sm">No payments recorded</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Amount</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Mode</th>
              <th className="text-left px-3 py-2 font-medium text-slate-600">Reference</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments?.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td className="px-3 py-2 font-medium">₹{p.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 capitalize">{p.payment_mode}</td>
                  <td className="px-3 py-2 text-slate-500">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Activity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Activity</h2>
        <div className="space-y-2">
          {activity?.map(a => (
            <div key={a.id} className="flex gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-slate-800">{a.description}</p>
                <p className="text-slate-400 text-xs">{new Date(a.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
