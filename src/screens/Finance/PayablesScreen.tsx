import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllVendors } from '../../services/vendorService'
import { getAllCompanyAccounts, addCompanyTransaction } from '../../services/companyAccountService'
import { getAllPayables, upsertPayable, getAllPayments, addPayment } from '../../services/financeService'
import type { Vendor, CompanyAccount, Payable, Payment } from '../../types'

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysOverdue(dueDate?: string): number {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  const now = new Date()
  const diff = Math.floor((now.getTime() - due.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

function effectiveStatus(p: Payable): string {
  if (p.status === 'paid') return 'paid'
  if (p.dueDate && daysOverdue(p.dueDate) > 0) return 'overdue'
  return p.status
}

function emptyPayable(): Payable {
  const now = new Date().toISOString()
  return {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    description: '', amount: 0, paidAmount: 0, status: 'pending', createdAt: now, updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PayablesScreen() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Payable | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Payable>(emptyPayable())
  const [isVendorPayable, setIsVendorPayable] = useState(true)
  const [payAmount, setPayAmount] = useState('')
  const [payAccountId, setPayAccountId] = useState('')
  const [payRef, setPayRef] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function reload() {
    setIsLoading(true)
    const [v, a, p, pay] = await Promise.all([getAllVendors(), getAllCompanyAccounts(), getAllPayables(), getAllPayments()])
    setVendors(v); setAccounts(a); setPayables(p); setPayments(pay)
    setIsLoading(false)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    if (selected) {
      const fresh = payables.find(p => p.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [payables])

  function openCreate() {
    setForm(emptyPayable())
    setIsVendorPayable(true)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.description.trim() || !form.amount) {
      setSnack({ open: true, msg: 'Description and amount are required.', type: 'error' })
      return
    }
    if (isVendorPayable && !form.vendorId) {
      setSnack({ open: true, msg: 'Select a vendor, or switch to "Other payee".', type: 'error' })
      return
    }
    const toSave: Payable = {
      ...form,
      vendorId: isVendorPayable ? form.vendorId : undefined,
      payeeName: isVendorPayable ? undefined : form.payeeName,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertPayable(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to save payable.', type: 'error' }); return }
    setPayables(prev => {
      const exists = prev.some(p => p.id === toSave.id)
      return exists ? prev.map(p => (p.id === toSave.id ? toSave : p)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Payable saved.', type: 'success' })
  }

  async function handleRecordPayment() {
    if (!selected || !payAmount || !payAccountId) {
      setSnack({ open: true, msg: 'Amount and payment account are required.', type: 'error' })
      return
    }
    const amount = Number(payAmount)
    const remaining = selected.amount - selected.paidAmount
    if (amount <= 0 || amount > remaining) {
      setSnack({ open: true, msg: `Amount must be between 1 and ${fmtCurrency(remaining)}.`, type: 'error' })
      return
    }

    const payment: Payment = {
      id: `pmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      payableId: selected.id,
      amount,
      paidDate: new Date().toISOString(),
      paymentAccount: payAccountId,
      reference: payRef || undefined,
      createdAt: new Date().toISOString(),
    }
    const paymentResult = await addPayment(payment)
    if (!paymentResult.ok) { setSnack({ open: true, msg: paymentResult.error ?? 'Failed to record payment.', type: 'error' }); return }

    const newPaidAmount = selected.paidAmount + amount
    const newStatus: Payable['status'] = newPaidAmount >= selected.amount ? 'paid' : 'partial'
    const toSave: Payable = { ...selected, paidAmount: newPaidAmount, status: newStatus, updatedAt: new Date().toISOString() }
    const payableResult = await upsertPayable(toSave)
    if (!payableResult.ok) { setSnack({ open: true, msg: payableResult.error ?? 'Payment recorded but failed to update payable.', type: 'error' }); return }

    await addCompanyTransaction({
      id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      accountId: payAccountId,
      type: 'debit',
      amount,
      description: `Payment: ${selected.description}`,
      reference: payRef || undefined,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    setPayments(prev => [payment, ...prev])
    setPayables(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    setPayAmount(''); setPayAccountId(''); setPayRef('')
    setSnack({ open: true, msg: newStatus === 'paid' ? 'Payable fully paid.' : 'Partial payment recorded.', type: 'success' })
  }

  const filtered = payables.filter(p => !search || p.description.toLowerCase().includes(search.toLowerCase()))
  function vendorName(id?: string) { return id ? vendors.find(v => v.id === id)?.name ?? 'Unknown vendor' : undefined }
  const selPayments = selected ? payments.filter(p => p.payableId === selected.id).sort((a, b) => b.paidDate.localeCompare(a.paidDate)) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Payables</h1>
          <PermissionGate permission="view_payables">
            <button onClick={openCreate} aria-label="Add payable"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search payables…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(p => {
          const status = effectiveStatus(p)
          const overdue = daysOverdue(p.dueDate)
          return (
            <button key={p.id} onClick={() => setSelected(p)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{p.description}</span>
                <StatusBadge status={status} />
              </div>
              <p className="text-xs text-slate-500">{vendorName(p.vendorId) ?? p.payeeName ?? 'Unknown payee'}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold text-slate-800">{fmtCurrency(p.paidAmount)} / {fmtCurrency(p.amount)}</span>
                {status === 'overdue' && <span className="text-xs font-semibold text-red-600">{overdue}d overdue</span>}
              </div>
            </button>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No payables yet.</p>
        )}
      </div>

      {/* Create payable */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Payable">
        <div className="space-y-4 pb-4">
          <div className="flex gap-2">
            <button onClick={() => setIsVendorPayable(true)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${isVendorPayable ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              Vendor
            </button>
            <button onClick={() => setIsVendorPayable(false)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${!isVendorPayable ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              Other payee
            </button>
          </div>
          {isVendorPayable ? (
            <div>
              <label className={label}>Vendor *</label>
              <select className={inp} value={form.vendorId ?? ''} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className={label}>Payee Name *</label>
              <input className={inp} value={form.payeeName ?? ''} onChange={e => setForm(f => ({ ...f, payeeName: e.target.value }))} placeholder="e.g. Employee name" />
            </div>
          )}
          <div>
            <label className={label}>Description *</label>
            <input className={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount *</label>
              <input type="number" className={inp} value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={label}>Due Date</label>
              <input type="date" className={inp} value={form.dueDate?.slice(0, 10) ?? ''} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value || undefined }))} />
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Payable
          </button>
        </div>
      </BottomSheet>

      {/* Payable detail: payments */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.description ?? ''} height="full">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge status={effectiveStatus(selected)} /></div>
              <div className="flex justify-between"><span className="text-slate-500">Payee</span><span className="font-semibold text-slate-800">{vendorName(selected.vendorId) ?? selected.payeeName ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className="font-semibold text-slate-800">{fmtDate(selected.dueDate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-bold text-slate-800">{fmtCurrency(selected.paidAmount)} / {fmtCurrency(selected.amount)}</span></div>
            </div>

            {selected.status !== 'paid' && (
              <PermissionGate permission="reconcile">
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <label className={label}>Record Payment (remaining {fmtCurrency(selected.amount - selected.paidAmount)})</label>
                  <input type="number" className={inp} placeholder="Amount paid" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  <select className={inp} value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
                    <option value="">Pay from account…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input className={inp} placeholder="Reference (optional)" value={payRef} onChange={e => setPayRef(e.target.value)} />
                  <button onClick={handleRecordPayment} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:bg-indigo-700">
                    Record Payment
                  </button>
                </div>
              </PermissionGate>
            )}

            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Payment History</h3>
            <div className="space-y-2">
              {selPayments.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No payments recorded yet.</p>}
              {selPayments.map(p => (
                <div key={p.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{fmtDate(p.paidDate)}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span className="text-sm font-bold text-red-600">{fmtCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
