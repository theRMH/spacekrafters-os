import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { getAllPersonalInvestments, upsertPersonalInvestment, deletePersonalInvestment, getAllPersonalAccounts } from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type { PersonalInvestment, PersonalInvestmentType, PersonalAccount } from '../../types'

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

const TYPE_OPTIONS: { value: PersonalInvestmentType; label: string }[] = [
  { value: 'mutual_fund', label: 'Mutual Fund' },
  { value: 'stock',       label: 'Stock' },
  { value: 'fd',          label: 'Fixed Deposit' },
  { value: 'ppf',         label: 'PPF' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'gold',        label: 'Gold' },
  { value: 'other',       label: 'Other' },
]
const TYPE_LABEL: Record<PersonalInvestmentType, string> = Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o.label])) as Record<PersonalInvestmentType, string>

function emptyInvestment(): PersonalInvestment {
  return {
    id: `pinv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    investmentType: 'mutual_fund',
    name: '',
    investedAmount: 0,
    purchaseDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PersonalInvestmentsScreen() {
  const { user } = useAuth()
  const [investments, setInvestments] = useState<PersonalInvestment[]>([])
  const [accounts, setAccounts] = useState<PersonalAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PersonalInvestment>(emptyInvestment())
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [i, a] = await Promise.all([getAllPersonalInvestments(), getAllPersonalAccounts()])
      setInvestments(i); setAccounts(a)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyInvestment())
    setIsEditing(false)
    setShowForm(true)
  }

  function openEdit(investment: PersonalInvestment) {
    setForm(investment)
    setIsEditing(true)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSnack({ open: true, msg: 'Name is required.', type: 'error' })
      return
    }
    const result = await upsertPersonalInvestment(form)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save investment.', type: 'error' })
      return
    }
    setInvestments(prev => {
      const exists = prev.some(i => i.id === form.id)
      return exists ? prev.map(i => (i.id === form.id ? form : i)) : [form, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Investment saved.', type: 'success' })
  }

  async function confirmDelete() {
    const result = await deletePersonalInvestment(form.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete investment.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_investment_deleted',
        description: `Personal investment "${form.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setInvestments(prev => prev.filter(i => i.id !== form.id))
    setShowForm(false)
    setSnack({ open: true, msg: 'Investment deleted.', type: 'success' })
  }

  const sorted = [...investments].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
  const totalInvested = investments.reduce((sum, i) => sum + i.investedAmount, 0)
  const totalCurrent = investments.reduce((sum, i) => sum + (i.currentValue ?? i.investedAmount), 0)
  const totalGain = totalCurrent - totalInvested

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Personal Investments</h1>
          <button onClick={openCreate} aria-label="Add investment"
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            <Plus size={19} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-xs text-slate-400">Mutual funds, stocks, deposits, PPF, real estate, gold, and more.</p>
      </div>

      {!isLoading && investments.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex justify-between">
            <div>
              <p className="text-[11px] text-slate-400">Invested</p>
              <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(totalInvested)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Current Value</p>
              <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(totalCurrent)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Gain / Loss</p>
              <p className={`text-sm font-extrabold ${totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {totalGain >= 0 ? '+' : ''}{fmtCurrency(totalGain)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && sorted.map(i => {
          const current = i.currentValue ?? i.investedAmount
          const gain = current - i.investedAmount
          return (
            <button key={i.id} onClick={() => openEdit(i)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="font-bold text-sm text-slate-800">{i.name}</p>
                  <p className="text-[11px] text-slate-400">{TYPE_LABEL[i.investmentType]} · {fmtDate(i.purchaseDate)}</p>
                </div>
                {i.currentValue != null && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${gain >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                    {gain >= 0 ? '+' : ''}{fmtCurrency(gain)}
                  </span>
                )}
              </div>
              <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(current)}</p>
            </button>
          )
        })}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No investments yet.</p>
        )}
      </div>

      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? 'Edit Investment' : 'New Investment'} height="full">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Type</label>
            <select className={inp} value={form.investmentType} onChange={e => setForm(f => ({ ...f, investmentType: e.target.value as PersonalInvestmentType }))}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Flexicap, Apple Inc." />
          </div>
          <div>
            <label className={label}>Invested Amount *</label>
            <input type="number" className={inp} value={form.investedAmount || ''} onChange={e => setForm(f => ({ ...f, investedAmount: e.target.value ? Number(e.target.value) : 0 }))} />
          </div>
          <div>
            <label className={label}>Current Value</label>
            <input type="number" className={inp} value={form.currentValue ?? ''} onChange={e => setForm(f => ({ ...f, currentValue: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label className={label}>Units / Quantity</label>
            <input type="number" className={inp} value={form.units ?? ''} onChange={e => setForm(f => ({ ...f, units: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label className={label}>Purchase Date *</label>
            <input type="date" className={inp} value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Linked Account</label>
            <select className={inp} value={form.linkedAccountId ?? ''} onChange={e => setForm(f => ({ ...f, linkedAccountId: e.target.value || undefined }))}>
              <option value="">None</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Notes</label>
            <input className={inp} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Investment
          </button>
          {isEditing && user?.role === 'owner' && (
            <button onClick={() => setShowDeleteDialog(true)}
              className="w-full text-center text-xs font-semibold text-red-500 py-2">
              Delete Investment
            </button>
          )}
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Investment"
        message="Are you sure you want to delete this investment? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
