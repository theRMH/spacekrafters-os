import { createClient } from '@/lib/supabase/server'
import { recordPayment } from '@/app/actions/payments'

export default async function PaymentsPage() {
  const supabase = await createClient()
  const [{ data: payments }, { data: projects }] = await Promise.all([
    supabase.from('payments').select('*, project:projects(project_name, client_name)').order('payment_date', { ascending: false }).limit(50),
    supabase.from('projects').select('id,project_name,client_name,balance_amount').neq('payment_status', 'paid').order('project_name'),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Payments</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Record Payment */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Record Payment</h2>
          <form action={recordPayment as (fd: FormData) => void} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Project</label>
              <select name="project_id" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required>
                <option value="">Select project...</option>
                {projects?.map(p => <option key={p.id} value={p.id}>{p.project_name} ({p.client_name}) — ₹{p.balance_amount?.toLocaleString()} due</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount (₹)</label>
              <input name="amount" type="number" step="0.01" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Payment Mode</label>
              <select name="payment_mode" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Reference / UTR</label>
              <input name="reference" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date</label>
              <input name="payment_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <button type="submit" className="w-full py-2 rounded-lg text-white font-medium" style={{ backgroundColor: '#1a2236' }}>Record Payment</button>
          </form>
        </div>

        {/* Recent Payments */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Payment History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Project</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Mode</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Reference</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {!payments?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No payments recorded</td></tr>}
                {payments?.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{(p.project as { project_name?: string })?.project_name}</p>
                      <p className="text-xs text-slate-500">{(p.project as { client_name?: string })?.client_name}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-green-700">₹{p.amount?.toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{p.payment_mode}</td>
                    <td className="px-4 py-3 text-slate-500">{p.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
