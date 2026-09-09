import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { approveQuotation, rejectQuotation, submitQuotationForApproval } from '@/app/actions/quotations'

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: q }, { data: { user } }] = await Promise.all([
    supabase.from('quotations').select('*, project:projects(project_name, client_name, id)').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!q) notFound()

  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  const isOwner = profile?.role === 'owner'
  const project = q.project as { project_name?: string; client_name?: string; id?: string }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/quotations" className="text-sm text-slate-500 hover:underline">← Quotations</a>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{project?.project_name} — Quotation v{q.version}</h1>
            <p className="text-slate-500">{project?.client_name}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            q.status === 'approved' ? 'bg-green-100 text-green-700' :
            q.status === 'rejected' ? 'bg-red-100 text-red-700' :
            q.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
          }`}>{q.status}</span>
        </div>

        {/* Line Items */}
        <table className="w-full text-sm mb-4">
          <thead className="bg-slate-50"><tr>
            <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Unit</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Rate</th>
            <th className="text-right px-3 py-2 font-medium text-slate-600">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(q.line_items || []).map((item: { description: string; qty: number; unit: string; rate: number; amount: number }, i: number) => (
              <tr key={i}>
                <td className="px-3 py-2">{item.description}</td>
                <td className="px-3 py-2 text-right">{item.qty}</td>
                <td className="px-3 py-2 text-right">{item.unit}</td>
                <td className="px-3 py-2 text-right">₹{item.rate?.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium">₹{item.amount?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{q.subtotal?.toLocaleString()}</span></div>
          {q.discount_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount ({q.discount_percent}%)</span><span className="text-red-600">-₹{q.discount_amount?.toLocaleString()}</span></div>}
          {q.tax_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax ({q.tax_percent}%)</span><span>₹{q.tax_amount?.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200"><span>Total</span><span>₹{q.total_amount?.toLocaleString()}</span></div>
        </div>

        {q.rejection_reason && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Rejected: {q.rejection_reason}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {q.status === 'draft' && (
          <form action={async () => { 'use server'; await submitQuotationForApproval(id) }}>
            <button type="submit" className="px-5 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: '#1a2236' }}>
              Submit for Approval
            </button>
          </form>
        )}
        {q.status === 'sent' && isOwner && (
          <>
            <form action={async () => { 'use server'; await approveQuotation(id) }}>
              <button type="submit" className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700">Approve</button>
            </form>
            <form action={async (fd: FormData) => { 'use server'; await rejectQuotation(id, fd.get('reason') as string) }} className="flex gap-2">
              <input name="reason" placeholder="Rejection reason" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
              <button type="submit" className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700">Reject</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
