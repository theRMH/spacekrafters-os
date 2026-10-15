import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllCompanyAccounts, addCompanyTransaction, addTransactionAllocations } from '../../services/companyAccountService'
import { getAllPaymentMilestones, upsertPaymentMilestone, getAllReceipts, addReceipt } from '../../services/financeService'
import { addAuditLog } from '../../services/auditLogService'
import type { Project, CompanyAccount, PaymentMilestone, Receipt, TransactionAllocation, AuditLog } from '../../types'

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

function effectiveStatus(m: PaymentMilestone): PaymentMilestone['status'] {
  if (m.status === 'received') return 'received'
  if (m.dueDate && daysOverdue(m.dueDate) > 0 && m.receivedAmount < m.amount) return 'overdue'
  return m.status
}

function emptyMilestone(projectId: string): PaymentMilestone {
  const now = new Date().toISOString()
  return {
    id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId, title: '', amount: 0, status: 'pending',
    receivedAmount: 0, receivedDates: [], createdAt: now, updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function ReceivablesScreen() {
  const { user } = useAuth()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PaymentMilestone | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PaymentMilestone>(emptyMilestone(''))
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptAccountId, setReceiptAccountId] = useState('')
  const [receiptRef, setReceiptRef] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function reload() {
    setIsLoading(true)
    const [p, a, m, r] = await Promise.all([getAllProjects(), getAllCompanyAccounts(), getAllPaymentMilestones(), getAllReceipts()])
    setProjects(p); setAccounts(a); setMilestones(m); setReceipts(r)
    setIsLoading(false)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    if (selected) {
      const fresh = milestones.find(m => m.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [milestones])

  useEffect(() => {
    const state = routerLocation.state as { projectId?: string } | null
    if (!state?.projectId || isLoading) return
    setForm(emptyMilestone(state.projectId))
    setShowForm(true)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading])

  function openCreate() {
    setForm(emptyMilestone(''))
    setShowForm(true)
  }

  // MD-only: edit an existing milestone in the same form. The amount locks once
  // a receipt has been recorded against it.
  const isEditing = milestones.some(m => m.id === form.id)
  function openEdit() {
    if (!selected) return
    setForm(selected)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.projectId || !form.title.trim() || !form.amount) {
      setSnack({ open: true, msg: 'Project, title, and amount are required.', type: 'error' })
      return
    }
    const toSave: PaymentMilestone = { ...form, updatedAt: new Date().toISOString() }
    const result = await upsertPaymentMilestone(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to save milestone.', type: 'error' }); return }
    setMilestones(prev => {
      const exists = prev.some(m => m.id === toSave.id)
      return exists ? prev.map(m => (m.id === toSave.id ? toSave : m)) : [toSave, ...prev]
    })
    if (isEditing) {
      setSelected(prev => (prev?.id === toSave.id ? toSave : prev))
      if (user) {
        addAuditLog({
          id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          projectId: toSave.projectId,
          action: 'payment_milestone_edited',
          description: `Payment milestone "${toSave.title}" (${fmtCurrency(toSave.amount)}) edited by MD.`,
          createdBy: user.name, createdByRole: user.role, createdAt: new Date().toISOString(),
        })
      }
    }
    setShowForm(false)
    setSnack({ open: true, msg: 'Payment milestone saved.', type: 'success' })
  }

  async function handleRecordReceipt() {
    if (!selected || !receiptAmount || !receiptAccountId) {
      setSnack({ open: true, msg: 'Amount and payment account are required.', type: 'error' })
      return
    }
    const amount = Number(receiptAmount)
    const remaining = selected.amount - selected.receivedAmount
    if (amount <= 0 || amount > remaining) {
      setSnack({ open: true, msg: `Amount must be between 1 and ${fmtCurrency(remaining)}.`, type: 'error' })
      return
    }

    const receipt: Receipt = {
      id: `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: selected.projectId,
      milestoneId: selected.id,
      amount,
      receivedDate: new Date().toISOString(),
      paymentAccount: receiptAccountId,
      reference: receiptRef || undefined,
      createdAt: new Date().toISOString(),
    }
    const receiptResult = await addReceipt(receipt)
    if (!receiptResult.ok) { setSnack({ open: true, msg: receiptResult.error ?? 'Failed to record receipt.', type: 'error' }); return }

    const newReceivedAmount = selected.receivedAmount + amount
    // Partial receipt keeps status at 'partial', not 'received', until fully paid.
    const newStatus: PaymentMilestone['status'] = newReceivedAmount >= selected.amount ? 'received' : 'partial'
    const toSave: PaymentMilestone = {
      ...selected,
      receivedAmount: newReceivedAmount,
      receivedDates: [...selected.receivedDates, receipt.receivedDate],
      status: newStatus,
      updatedAt: new Date().toISOString(),
    }
    const msResult = await upsertPaymentMilestone(toSave)
    if (!msResult.ok) { setSnack({ open: true, msg: msResult.error ?? 'Receipt recorded but failed to update milestone.', type: 'error' }); return }

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const txnResult = await addCompanyTransaction({
      id: txnId,
      accountId: receiptAccountId,
      type: 'credit',
      amount,
      description: `Receipt: ${selected.title}`,
      reference: receiptRef || undefined,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
    if (!txnResult.ok) { setSnack({ open: true, msg: txnResult.error ?? 'Receipt recorded on milestone but failed to post to Company Accounts.', type: 'error' }); return }

    // One transaction row, allocated to the milestone's project (Finance Rule 3).
    const allocation: TransactionAllocation = {
      id: `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      transactionId: txnId,
      projectId: selected.projectId,
      amount,
      createdAt: new Date().toISOString(),
    }
    const allocResult = await addTransactionAllocations([allocation])

    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: selected.projectId,
        action: 'receipt_recorded',
        description: `Receipt of ${fmtCurrency(amount)} recorded against milestone "${selected.title}".`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }

    setReceipts(prev => [receipt, ...prev])
    setMilestones(prev => prev.map(m => (m.id === toSave.id ? toSave : m)))
    setReceiptAmount(''); setReceiptAccountId(''); setReceiptRef('')
    if (!allocResult.ok) {
      setSnack({ open: true, msg: `Receipt recorded, but project allocation failed (${allocResult.error ?? 'unknown error'}). The transaction exists in Company Accounts — contact an admin to allocate it manually.`, type: 'error' })
    } else {
      setSnack({ open: true, msg: newStatus === 'received' ? 'Milestone fully received.' : 'Partial receipt recorded.', type: 'success' })
    }
  }

  const filtered = milestones.filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
  function projectName(id: string) { return projects.find(p => p.id === id)?.name ?? 'Unknown project' }
  const selReceipts = selected ? receipts.filter(r => r.milestoneId === selected.id).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Receivables</h1>
          <PermissionGate permission="view_receivables">
            <button onClick={openCreate} aria-label="Add milestone"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search milestones…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(m => {
          const status = effectiveStatus(m)
          const overdue = daysOverdue(m.dueDate)
          return (
            <button key={m.id} onClick={() => setSelected(m)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{m.title}</span>
                <StatusBadge status={status} />
              </div>
              <p className="text-xs text-slate-500">{projectName(m.projectId)}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold text-slate-800">{fmtCurrency(m.receivedAmount)} / {fmtCurrency(m.amount)}</span>
                {status === 'overdue' && <span className="text-xs font-semibold text-red-600">{overdue}d overdue</span>}
              </div>
            </button>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No payment milestones yet.</p>
        )}
      </div>

      {/* Create milestone */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? 'Edit Payment Milestone' : 'New Payment Milestone'}>
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Project *</label>
            <SearchableSelect
              value={form.projectId} onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select project…"
            />
          </div>
          <div>
            <label className={label}>Title *</label>
            <input className={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Advance, Milestone 2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount *</label>
              <input type="number" className={inp} value={form.amount || ''} disabled={form.receivedAmount > 0}
                onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              {form.receivedAmount > 0 && <p className="text-[11px] text-slate-400 mt-1">Locked — a receipt is already recorded.</p>}
            </div>
            <div>
              <label className={label}>Due Date</label>
              <DateField value={form.dueDate?.slice(0, 10) ?? ''} onChange={v => setForm(f => ({ ...f, dueDate: v || undefined }))} />
            </div>
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea className={inp} rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Milestone
          </button>
        </div>
      </BottomSheet>

      {/* Milestone detail: receipts */}
      <BottomSheet isOpen={!!selected && !showForm} onClose={() => setSelected(null)} title={selected?.title ?? ''} height="full">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge status={effectiveStatus(selected)} /></div>
              <div className="flex justify-between"><span className="text-slate-500">Project</span><span className="font-semibold text-slate-800">{projectName(selected.projectId)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className="font-semibold text-slate-800">{fmtDate(selected.dueDate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Received</span><span className="font-bold text-slate-800">{fmtCurrency(selected.receivedAmount)} / {fmtCurrency(selected.amount)}</span></div>
            </div>

            {user?.role === 'owner' && (
              <button onClick={openEdit} className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold active:bg-slate-50">
                Edit Milestone (MD)
              </button>
            )}

            {selected.status !== 'received' && (
              <PermissionGate permission="record_receipt">
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <label className={label}>Record Receipt (remaining {fmtCurrency(selected.amount - selected.receivedAmount)})</label>
                  {accounts.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-amber-700">No accounts available. Add one in Company Accounts before recording a receipt.</p>
                      <button onClick={() => navigate('/company-accounts')}
                        className="text-xs font-semibold text-indigo-600 active:opacity-70">
                        Go to Company Accounts →
                      </button>
                    </div>
                  ) : (
                    <>
                      <input type="number" className={inp} placeholder="Amount received" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} />
                      <SearchableSelect
                        value={receiptAccountId} onChange={setReceiptAccountId}
                        options={accounts.map(a => ({ value: a.id, label: a.name }))}
                        placeholder="Deposit into account…"
                      />
                      <input className={inp} placeholder="Reference (optional)" value={receiptRef} onChange={e => setReceiptRef(e.target.value)} />
                      <button onClick={handleRecordReceipt}
                        disabled={!receiptAmount || Number(receiptAmount) <= 0 || Number(receiptAmount) > (selected.amount - selected.receivedAmount) || !receiptAccountId}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none">
                        Record Receipt
                      </button>
                    </>
                  )}
                </div>
              </PermissionGate>
            )}

            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Receipt History</h3>
            <div className="space-y-2">
              {selReceipts.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No receipts recorded yet.</p>}
              {selReceipts.map(r => (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{fmtDate(r.receivedDate)}{r.reference ? ` · ${r.reference}` : ''}</span>
                  <span className="text-sm font-bold text-emerald-600">{fmtCurrency(r.amount)}</span>
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
