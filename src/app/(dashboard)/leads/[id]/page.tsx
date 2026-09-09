import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, LeadStatus } from '@/types'
import { updateLeadStatus, addLeadNote, convertLeadToProject } from '@/app/actions/leads'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: lead }, { data: activity }, { data: users }] = await Promise.all([
    supabase.from('leads').select('*, owner:users!owner_id(full_name,email)').eq('id', id).single(),
    supabase.from('activity_history').select('*, user:users!performed_by(full_name)').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('users').select('id,full_name,role').eq('is_active', true),
  ])

  if (!lead) notFound()

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/leads" className="text-sm text-slate-500 hover:underline">← Leads</a>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{lead.client_name}</h1>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${LEAD_STATUS_COLORS[lead.status as LeadStatus]}`}>
          {LEAD_STATUS_LABELS[lead.status as LeadStatus]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {/* Lead Info */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Lead Details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{lead.phone}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{lead.email || '—'}</dd></div>
            <div><dt className="text-slate-500">Source</dt><dd className="font-medium capitalize">{lead.source?.replace(/_/g, ' ') || '—'}</dd></div>
            <div><dt className="text-slate-500">Interest</dt><dd className="font-medium">{lead.product_interest || '—'}</dd></div>
            <div><dt className="text-slate-500">Address</dt><dd className="font-medium">{lead.address || '—'}</dd></div>
            <div><dt className="text-slate-500">Owner</dt><dd className="font-medium">{(lead.owner as { full_name?: string })?.full_name || '—'}</dd></div>
          </dl>
          {lead.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {/* Update Status */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3 text-sm">Update Status</h3>
            <form action={async (fd: FormData) => {
              'use server'
              await updateLeadStatus(id, fd.get('status') as string)
            }}>
              <select name="status" defaultValue={lead.status} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3">
                {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="submit" className="w-full py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#1a2236' }}>Update</button>
            </form>
          </div>

          {/* Add Note */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3 text-sm">Add Note</h3>
            <form action={async (fd: FormData) => {
              'use server'
              await addLeadNote(id, fd.get('note') as string)
            }}>
              <textarea name="note" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 resize-none" placeholder="Add a note..." required />
              <button type="submit" className="w-full py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#1a2236' }}>Add Note</button>
            </form>
          </div>

          {/* Convert to Project */}
          {lead.status !== 'converted' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-medium text-slate-800 mb-3 text-sm">Convert to Project</h3>
              <form action={async (fd: FormData) => {
                'use server'
                await convertLeadToProject(id, fd)
              }}>
                <input name="project_name" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2" placeholder="Project name" required />
                <input name="product_type" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3" placeholder="Product type" />
                <button type="submit" className="w-full py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700">Convert</button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Activity</h2>
        {activity?.length === 0 && <p className="text-slate-500 text-sm">No activity yet</p>}
        <div className="space-y-3">
          {activity?.map(a => (
            <div key={a.id} className="flex gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-slate-800">{a.description}</p>
                <p className="text-slate-400 text-xs">{(a.user as { full_name?: string })?.full_name} · {new Date(a.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
