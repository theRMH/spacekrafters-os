import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import {
  getAllPersonalAccounts, upsertPersonalAccount,
  getAllPersonalTransactions, addPersonalTransaction,
  getAllPersonalCategories, getAllPersonalSubcategories,
} from '../../services/personalFinanceService'
import type {
  PersonalAccount, PersonalAccountType, PersonalTransaction, PersonalTransactionType,
  PersonalCategory, PersonalSubcategory,
} from '../../types'

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

const ACCOUNT_TYPE_OPTIONS: { value: PersonalAccountType; label: string }[] = [
  { value: 'bank',        label: 'Bank' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'upi_wallet',  label: 'UPI Wallet' },
  { value: 'cash',        label: 'Cash' },
  { value: 'loan',        label: 'Loan' },
]
const ACCOUNT_TYPE_LABEL: Record<PersonalAccountType, string> = {
  bank: 'Bank', credit_card: 'Credit Card', upi_wallet: 'UPI Wallet', cash: 'Cash', loan: 'Loan',
}

const TXN_TYPE_OPTIONS: { value: PersonalTransactionType; label: string }[] = [
  { value: 'income',           label: 'Income' },
  { value: 'expense',          label: 'Expense' },
  { value: 'transfer',         label: 'Transfer' },
  { value: 'investment',       label: 'Investment' },
  { value: 'advance_received', label: 'Advance Received' },
  { value: 'advance_paid',     label: 'Advance Paid' },
  { value: 'loan_received',    label: 'Loan Received' },
  { value: 'loan_paid',        label: 'Loan Paid' },
]
const TXN_TYPE_LABEL: Record<PersonalTransactionType, string> = Object.fromEntries(
  TXN_TYPE_OPTIONS.map(o => [o.value, o.label])
) as Record<PersonalTransactionType, string>

// Real cash inflow to the account, vs. an outflow — used for balance math and
// the amount sign on Transactions (kept separate from Income/Expense so
// advances/loans/transfers/investments don't distort those, same split as
// the source tracker's isInflow()).
const INFLOW_TYPES = new Set<PersonalTransactionType>(['income', 'advance_received', 'loan_received'])

function emptyAccount(): PersonalAccount {
  return { id: `pacct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', type: 'bank', openingBalance: 0, active: true, createdAt: new Date().toISOString() }
}

function emptyTransaction(accountId: string): PersonalTransaction {
  return {
    id: `ptxn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accountId,
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    type: 'expense',
    source: 'manual',
    createdAt: new Date().toISOString(),
  }
}

function accountBalance(account: PersonalAccount, transactions: PersonalTransaction[]): number {
  return transactions
    .filter(t => t.accountId === account.id)
    .reduce((bal, t) => bal + (INFLOW_TYPES.has(t.type) || t.type === 'income' ? t.amount : -t.amount), account.openingBalance)
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PersonalFinanceScreen() {
  const [tab, setTab] = useState<'transactions' | 'accounts'>('transactions')
  const [accounts, setAccounts] = useState<PersonalAccount[]>([])
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([])
  const [categories, setCategories] = useState<PersonalCategory[]>([])
  const [subcategories, setSubcategories] = useState<PersonalSubcategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [filterAccountId, setFilterAccountId] = useState('')
  const [filterType, setFilterType] = useState('')

  const [showAccountForm, setShowAccountForm] = useState(false)
  const [accountForm, setAccountForm] = useState<PersonalAccount>(emptyAccount())
  const [selectedAccount, setSelectedAccount] = useState<PersonalAccount | null>(null)

  const [showTxnForm, setShowTxnForm] = useState(false)
  const [txnForm, setTxnForm] = useState<PersonalTransaction>(emptyTransaction(''))
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [a, t, c, s] = await Promise.all([
        getAllPersonalAccounts(), getAllPersonalTransactions(), getAllPersonalCategories(), getAllPersonalSubcategories(),
      ])
      setAccounts(a); setTransactions(t); setCategories(c); setSubcategories(s)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreateAccount() {
    setAccountForm(emptyAccount())
    setShowAccountForm(true)
  }

  async function handleSaveAccount() {
    if (!accountForm.name.trim()) {
      setSnack({ open: true, msg: 'Account name is required.', type: 'error' })
      return
    }
    const result = await upsertPersonalAccount(accountForm)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save account.', type: 'error' })
      return
    }
    setAccounts(prev => {
      const exists = prev.some(a => a.id === accountForm.id)
      return exists ? prev.map(a => (a.id === accountForm.id ? accountForm : a)) : [accountForm, ...prev]
    })
    setShowAccountForm(false)
    setSnack({ open: true, msg: 'Account saved.', type: 'success' })
  }

  function openAddTransaction() {
    setTxnForm(emptyTransaction(accounts[0]?.id ?? ''))
    setShowTxnForm(true)
  }

  async function handleSaveTransaction() {
    if (!txnForm.accountId) {
      setSnack({ open: true, msg: 'Select an account.', type: 'error' })
      return
    }
    if (!txnForm.amount || txnForm.amount <= 0) {
      setSnack({ open: true, msg: 'Enter a valid amount.', type: 'error' })
      return
    }
    const result = await addPersonalTransaction(txnForm)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save transaction.', type: 'error' })
      return
    }
    setTransactions(prev => [txnForm, ...prev])
    setShowTxnForm(false)
    setSnack({ open: true, msg: 'Transaction added.', type: 'success' })
  }

  const totalBalance = accounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0)
  const subcategoriesForCategory = subcategories.filter(s => s.categoryId === txnForm.categoryId)

  const filteredTransactions = transactions
    .filter(t => !filterAccountId || t.accountId === filterAccountId)
    .filter(t => !filterType || t.type === filterType)
    .sort((a, b) => b.date.localeCompare(a.date))

  const selAccountTransactions = selectedAccount
    ? transactions.filter(t => t.accountId === selectedAccount.id).sort((a, b) => b.date.localeCompare(a.date))
    : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Personal Finance</h1>
          <button
            onClick={tab === 'accounts' ? openCreateAccount : openAddTransaction}
            aria-label={tab === 'accounts' ? 'Add account' : 'Add transaction'}
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
            style={{ background: '#0F2A4A' }}
          >
            <Plus size={19} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-xs text-slate-400">Total balance: <span className="font-bold text-slate-700">{fmtCurrency(totalBalance)}</span></p>

        <div className="flex gap-2 mt-3">
          <button onClick={() => setTab('transactions')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${tab === 'transactions' ? 'bg-[#0F2A4A] text-white' : 'bg-slate-100 text-slate-500'}`}>
            Transactions
          </button>
          <button onClick={() => setTab('accounts')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${tab === 'accounts' ? 'bg-[#0F2A4A] text-white' : 'bg-slate-100 text-slate-500'}`}>
            Accounts
          </button>
        </div>
      </div>

      {tab === 'transactions' && (
        <>
          <div className="px-4 pt-4 flex gap-2">
            <select className={`${inp} flex-1`} value={filterAccountId} onChange={e => setFilterAccountId(e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className={`${inp} flex-1`} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {TXN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="px-4 pt-4 space-y-2.5">
            {!isLoading && filteredTransactions.map(t => (
              <div key={t.id} className="bg-white rounded-xl p-3.5 border border-slate-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.narration || t.payeePayer || TXN_TYPE_LABEL[t.type]}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(t.date)} · {accounts.find(a => a.id === t.accountId)?.name ?? '—'}</p>
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${INFLOW_TYPES.has(t.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {INFLOW_TYPES.has(t.type) ? '+' : '−'}{fmtCurrency(t.amount)}
                  </span>
                </div>
                <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {TXN_TYPE_LABEL[t.type]}
                </span>
              </div>
            ))}
            {!isLoading && filteredTransactions.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-16">No transactions yet.</p>
            )}
          </div>
        </>
      )}

      {tab === 'accounts' && (
        <div className="px-4 pt-4 space-y-2.5">
          {!isLoading && accounts.map(account => (
            <button key={account.id} onClick={() => setSelectedAccount(account)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{account.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{ACCOUNT_TYPE_LABEL[account.type]}</span>
              </div>
              <p className="text-lg font-extrabold text-slate-800">{fmtCurrency(accountBalance(account, transactions))}</p>
            </button>
          ))}
          {!isLoading && accounts.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-16">No personal accounts yet.</p>
          )}
        </div>
      )}

      {/* Create account */}
      <BottomSheet isOpen={showAccountForm} onClose={() => setShowAccountForm(false)} title="New Personal Account">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Account Name *</label>
            <input className={inp} value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Personal Savings, Wallet" />
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={inp} value={accountForm.type} onChange={e => setAccountForm(f => ({ ...f, type: e.target.value as PersonalAccountType }))}>
              {ACCOUNT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Opening Balance</label>
            <input type="number" className={inp} value={accountForm.openingBalance || ''} onChange={e => setAccountForm(f => ({ ...f, openingBalance: Number(e.target.value) }))} />
          </div>
          <button onClick={handleSaveAccount} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Account
          </button>
        </div>
      </BottomSheet>

      {/* Account detail */}
      <BottomSheet isOpen={!!selectedAccount} onClose={() => setSelectedAccount(null)} title={selectedAccount?.name ?? ''} height="full">
        {selectedAccount && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Current Balance</p>
              <p className="text-2xl font-extrabold text-slate-800">{fmtCurrency(accountBalance(selectedAccount, transactions))}</p>
              <p className="text-[11px] text-slate-400 mt-1">Opening: {fmtCurrency(selectedAccount.openingBalance)}</p>
            </div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Transaction History</h3>
            <div className="space-y-2">
              {selAccountTransactions.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No transactions yet.</p>}
              {selAccountTransactions.map(t => (
                <div key={t.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.narration || t.payeePayer || TXN_TYPE_LABEL[t.type]}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(t.date)}{t.reference ? ` · ${t.reference}` : ''}</p>
                  </div>
                  <span className={`text-sm font-bold ${INFLOW_TYPES.has(t.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {INFLOW_TYPES.has(t.type) ? '+' : '−'}{fmtCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Add transaction */}
      <BottomSheet isOpen={showTxnForm} onClose={() => setShowTxnForm(false)} title="New Transaction" height="full">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Account *</label>
            <select className={inp} value={txnForm.accountId} onChange={e => setTxnForm(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">Select account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={inp} value={txnForm.type} onChange={e => setTxnForm(f => ({ ...f, type: e.target.value as PersonalTransactionType }))}>
              {TXN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Date *</label>
            <input type="date" className={inp} value={txnForm.date} onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Amount *</label>
            <input type="number" className={inp} value={txnForm.amount || ''} onChange={e => setTxnForm(f => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={label}>Category</label>
            <select className={inp} value={txnForm.categoryId ?? ''} onChange={e => setTxnForm(f => ({ ...f, categoryId: e.target.value || undefined, subcategoryId: undefined }))}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.groupName} · {c.name}</option>)}
            </select>
          </div>
          {txnForm.categoryId && subcategoriesForCategory.length > 0 && (
            <div>
              <label className={label}>Subcategory</label>
              <select className={inp} value={txnForm.subcategoryId ?? ''} onChange={e => setTxnForm(f => ({ ...f, subcategoryId: e.target.value || undefined }))}>
                <option value="">Select subcategory</option>
                {subcategoriesForCategory.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Payee / Payer</label>
            <input className={inp} value={txnForm.payeePayer ?? ''} onChange={e => setTxnForm(f => ({ ...f, payeePayer: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Narration</label>
            <input className={inp} value={txnForm.narration ?? ''} onChange={e => setTxnForm(f => ({ ...f, narration: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Reference</label>
            <input className={inp} value={txnForm.reference ?? ''} onChange={e => setTxnForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <button onClick={handleSaveTransaction} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Transaction
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
