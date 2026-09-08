import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import {
  getAllCompanyAccounts, upsertCompanyAccount, getAllCompanyTransactions,
} from '../../services/companyAccountService'
import type { CompanyAccount, CompanyAccountType, CompanyTransaction } from '../../types'

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

const TYPE_OPTIONS: { value: CompanyAccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi',  label: 'UPI' },
]

const TYPE_LABEL: Record<CompanyAccountType, string> = { bank: 'Bank', cash: 'Cash', upi: 'UPI' }

function emptyAccount(): CompanyAccount {
  const now = new Date().toISOString()
  return { id: `acct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', type: 'bank', openingBalance: 0, createdAt: now, updatedAt: now }
}

function accountBalance(account: CompanyAccount, transactions: CompanyTransaction[]): number {
  return transactions
    .filter(t => t.accountId === account.id)
    .reduce((bal, t) => bal + (t.type === 'credit' ? t.amount : -t.amount), account.openingBalance)
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function CompanyAccountsScreen() {
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [transactions, setTransactions] = useState<CompanyTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selected, setSelected] = useState<CompanyAccount | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CompanyAccount>(emptyAccount())
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [a, t] = await Promise.all([getAllCompanyAccounts(), getAllCompanyTransactions()])
      setAccounts(a); setTransactions(t)
      setIsLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (selected) {
      const fresh = accounts.find(a => a.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [accounts])

  function openCreate() {
    setForm(emptyAccount())
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSnack({ open: true, msg: 'Account name is required.', type: 'error' })
      return
    }
    const toSave: CompanyAccount = { ...form, updatedAt: new Date().toISOString() }
    const result = await upsertCompanyAccount(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save account.', type: 'error' })
      return
    }
    setAccounts(prev => {
      const exists = prev.some(a => a.id === toSave.id)
      return exists ? prev.map(a => (a.id === toSave.id ? toSave : a)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Account saved.', type: 'success' })
  }

  const totalBalance = accounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0)
  const selTransactions = selected ? transactions.filter(t => t.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date)) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Company Accounts</h1>
          <PermissionGate permission="manage_company_accounts">
            <button onClick={openCreate} aria-label="Add account"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <p className="text-xs text-slate-400">Total balance: <span className="font-bold text-slate-700">{fmtCurrency(totalBalance)}</span></p>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && accounts.map(account => (
          <button key={account.id} onClick={() => setSelected(account)}
            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-bold text-sm text-slate-800">{account.name}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{TYPE_LABEL[account.type]}</span>
            </div>
            <p className="text-lg font-extrabold text-slate-800">{fmtCurrency(accountBalance(account, transactions))}</p>
          </button>
        ))}

        {!isLoading && accounts.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No company accounts yet.</p>
        )}
      </div>

      {/* Create account */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Company Account">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Account Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Current A/c, Petty Cash" />
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CompanyAccountType }))}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Opening Balance</label>
            <input type="number" className={inp} value={form.openingBalance || ''} onChange={e => setForm(f => ({ ...f, openingBalance: Number(e.target.value) }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Account
          </button>
        </div>
      </BottomSheet>

      {/* Account detail: transaction history */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Current Balance</p>
              <p className="text-2xl font-extrabold text-slate-800">{fmtCurrency(accountBalance(selected, transactions))}</p>
              <p className="text-[11px] text-slate-400 mt-1">Opening: {fmtCurrency(selected.openingBalance)}</p>
            </div>

            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Transaction History</h3>
            <div className="space-y-2">
              {selTransactions.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No transactions yet.</p>}
              {selTransactions.map(t => (
                <div key={t.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.description}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(t.date)}{t.reference ? ` · ${t.reference}` : ''}</p>
                  </div>
                  <span className={`text-sm font-bold ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '−'}{fmtCurrency(t.amount)}
                  </span>
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
