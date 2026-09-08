import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllExpenseRequests, upsertExpenseRequest } from '../../services/expenseService'
import { getAllCompanyAccounts, addCompanyTransaction, addTransactionAllocations } from '../../services/companyAccountService'
import { addAuditLog } from '../../services/auditLogService'
import type { Project, ExpenseRequest, CompanyAccount, CompanyTransaction, TransactionAllocation, AuditLog } from '../../types'

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

function emptyRequest(createdBy: string, createdByName: string): ExpenseRequest {
  const now = new Date().toISOString()
  return {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: '',
    purpose: '',
    amount: 0,
    requestedBy: createdBy,
    requestedByName: createdByName,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function ExpenseRequestScreen() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<ExpenseRequest[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ExpenseRequest | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ExpenseRequest>(emptyRequest('', ''))
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [payAccountId, setPayAccountId] = useState('')
  const [payRef, setPayRef] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [r, p, a] = await Promise.all([getAllExpenseRequests(), getAllProjects(), getAllCompanyAccounts()])
      setRequests(r); setProjects(p); setAccounts(a)
      setIsLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (selected) {
      const fresh = requests.find(r => r.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [requests])

  function openCreate() {
    setForm(emptyRequest(user?.id ?? '', user?.name ?? ''))
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.category.trim() || !form.purpose.trim() || !form.amount) {
      setSnack({ open: true, msg: 'Category, purpose, and amount are required.', type: 'error' })
      return
    }
    const toSave: ExpenseRequest = { ...form, updatedAt: new Date().toISOString() }
    const result = await upsertExpenseRequest(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save expense request.', type: 'error' })
      return
    }
    setRequests(prev => {
      const exists = prev.some(r => r.id === toSave.id)
      return exists ? prev.map(r => (r.id === toSave.id ? toSave : r)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Expense request submitted.', type: 'success' })
  }

  // Approval ≠ Payment: this only moves the request to "approved" (a commitment).
  // No cashflow entry is created here — only handlePay() below writes a transaction.
  async function handleApprove() {
    if (!selected) return
    const toSave: ExpenseRequest = { ...selected, status: 'approved', approvedBy: user?.id, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const result = await upsertExpenseRequest(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to approve.', type: 'error' }); return }
    setRequests(prev => prev.map(r => (r.id === toSave.id ? toSave : r)))
    setSnack({ open: true, msg: 'Expense approved — committed, not yet paid.', type: 'success' })
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: toSave.projectId,
        action: 'expense_approved',
        description: `Expense request "${toSave.purpose}" (${fmtCurrency(toSave.amount)}) approved.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
  }

  async function handleReject() {
    if (!selected || !rejectReason.trim()) {
      setSnack({ open: true, msg: 'A rejection reason is required.', type: 'error' })
      return
    }
    const toSave: ExpenseRequest = { ...selected, status: 'rejected', rejectionReason: rejectReason, approvedBy: user?.id, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const result = await upsertExpenseRequest(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to reject.', type: 'error' }); return }
    setRequests(prev => prev.map(r => (r.id === toSave.id ? toSave : r)))
    setShowReject(false)
    setRejectReason('')
    setSnack({ open: true, msg: 'Expense request rejected.', type: 'success' })
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: toSave.projectId,
        action: 'expense_rejected',
        description: `Expense request "${toSave.purpose}" (${fmtCurrency(toSave.amount)}) rejected: ${toSave.rejectionReason}`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
  }

  // Only this action creates a cashflow entry (Finance Rule 4: Approval != Payment).
  async function handlePay() {
    if (!selected || !payAccountId) {
      setSnack({ open: true, msg: 'Select a payment account.', type: 'error' })
      return
    }
    const txn: CompanyTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      accountId: payAccountId,
      type: 'debit',
      amount: selected.amount,
      description: `Expense: ${selected.purpose}`,
      reference: payRef || undefined,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    const txnResult = await addCompanyTransaction(txn)
    if (!txnResult.ok) { setSnack({ open: true, msg: txnResult.error ?? 'Failed to record payment.', type: 'error' }); return }

    // One transaction row, allocated to the expense's project (Finance Rule 3).
    const allocation: TransactionAllocation = {
      id: `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      transactionId: txn.id,
      projectId: selected.projectId,
      amount: selected.amount,
      createdAt: new Date().toISOString(),
    }
    await addTransactionAllocations([allocation])

    const toSave: ExpenseRequest = {
      ...selected, status: 'paid', paidAmount: selected.amount, paidAt: new Date().toISOString(),
      paymentAccount: payAccountId, paymentRef: payRef || undefined, updatedAt: new Date().toISOString(),
    }
    const result = await upsertExpenseRequest(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Payment recorded but failed to update request.', type: 'error' }); return }
    setRequests(prev => prev.map(r => (r.id === toSave.id ? toSave : r)))
    setPayAccountId(''); setPayRef('')
    setSnack({ open: true, msg: 'Payment recorded — cashflow updated.', type: 'success' })
  }

  async function handleClose() {
    if (!selected) return
    const toSave: ExpenseRequest = { ...selected, status: 'closed', updatedAt: new Date().toISOString() }
    const result = await upsertExpenseRequest(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to close.', type: 'error' }); return }
    setRequests(prev => prev.map(r => (r.id === toSave.id ? toSave : r)))
    setSnack({ open: true, msg: 'Expense request closed.', type: 'success' })
  }

  const filtered = requests.filter(r => !search || r.purpose.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()))
  function projectName(id?: string) { return projects.find(p => p.id === id)?.name }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Expenses</h1>
          <PermissionGate permission="raise_expense_request">
            <button onClick={openCreate} aria-label="New expense request"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search expense requests…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(req => (
          <button key={req.id} onClick={() => setSelected(req)}
            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-bold text-sm text-slate-800">{req.purpose}</span>
              <StatusBadge status={req.status} />
            </div>
            <p className="text-xs text-slate-500">
              {req.category}{projectName(req.projectId) ? ` · ${projectName(req.projectId)}` : ''} · {req.requestedByName}
            </p>
            <p className="text-sm font-bold text-slate-800 mt-1">{fmtCurrency(req.amount)}</p>
          </button>
        ))}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No expense requests yet.</p>
        )}
      </div>

      {/* Create request */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Expense Request">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Project</label>
            <select className={inp} value={form.projectId ?? ''} onChange={e => setForm(f => ({ ...f, projectId: e.target.value || undefined }))}>
              <option value="">Company overhead (no project)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Category *</label>
            <input className={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Travel, Site Supplies, Office" />
          </div>
          <div>
            <label className={label}>Purpose *</label>
            <input className={inp} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount *</label>
              <input type="number" className={inp} value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={label}>Needed By</label>
              <input type="date" className={inp} value={form.neededBy?.slice(0, 10) ?? ''} onChange={e => setForm(f => ({ ...f, neededBy: e.target.value || undefined }))} />
            </div>
          </div>
          <div>
            <label className={label}>Vendor / Payee</label>
            <input className={inp} value={form.vendorPayee ?? ''} onChange={e => setForm(f => ({ ...f, vendorPayee: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Submit Request
          </button>
        </div>
      </BottomSheet>

      {/* Detail / lifecycle actions */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.purpose ?? ''}>
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge status={selected.status} /></div>
              <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="font-semibold text-slate-800">{selected.category}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Project</span><span className="font-semibold text-slate-800">{projectName(selected.projectId) ?? 'Company overhead'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-slate-800">{fmtCurrency(selected.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Requested By</span><span className="font-semibold text-slate-800">{selected.requestedByName}</span></div>
              {selected.vendorPayee && <div className="flex justify-between"><span className="text-slate-500">Payee</span><span className="font-semibold text-slate-800">{selected.vendorPayee}</span></div>}
              {selected.status === 'rejected' && selected.rejectionReason && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-red-600 text-xs font-semibold">Rejected: {selected.rejectionReason}</span>
                </div>
              )}
              {selected.status === 'paid' && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-semibold text-slate-800">{fmtDate(selected.paidAt)}</span></div>
                  {selected.paymentRef && <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-semibold text-slate-800">{selected.paymentRef}</span></div>}
                </>
              )}
            </div>

            {selected.status === 'requested' && (
              <div className="flex gap-2">
                <PermissionGate permission="approve_expense">
                  <button onClick={handleApprove} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:bg-emerald-700">
                    Approve
                  </button>
                </PermissionGate>
                <PermissionGate permission="approve_expense">
                  <button onClick={() => setShowReject(true)} className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold active:bg-red-50">
                    Reject
                  </button>
                </PermissionGate>
              </div>
            )}

            {selected.status === 'approved' && (
              <PermissionGate permission="record_payment">
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <label className={label}>Record Payment</label>
                  <select className={inp} value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
                    <option value="">Select payment account…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input className={inp} placeholder="Reference (optional)" value={payRef} onChange={e => setPayRef(e.target.value)} />
                  <button onClick={handlePay} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
                    Mark as Paid
                  </button>
                </div>
              </PermissionGate>
            )}

            {selected.status === 'paid' && (
              <PermissionGate permission="approve_expense">
                <button onClick={handleClose} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold active:bg-slate-100">
                  Close Request
                </button>
              </PermissionGate>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Reject reason */}
      <BottomSheet isOpen={showReject} onClose={() => setShowReject(false)} title="Reject Expense Request">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Reason *</label>
            <textarea className={inp} rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          </div>
          <button onClick={handleReject} className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-semibold active:bg-red-700">
            Confirm Rejection
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
