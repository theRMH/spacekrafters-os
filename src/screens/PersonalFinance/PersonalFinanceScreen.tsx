import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import {
  getAllPersonalAccounts, upsertPersonalAccount, deletePersonalAccount,
  getAllPersonalTransactions, addPersonalTransaction, deletePersonalTransaction, updatePersonalTransactionStatus,
  getAllPersonalCategories, getAllPersonalSubcategories,
} from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type {
  PersonalAccount, PersonalAccountType, PersonalTransaction, PersonalTransactionType, PersonalTransactionStatus,
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

const STATUS_OPTIONS: { value: PersonalTransactionStatus; label: string }[] = [
  { value: 'pending',    label: 'Pending' },
  { value: 'cleared',    label: 'Cleared' },
  { value: 'reconciled', label: 'Reconciled' },
]
const STATUS_LABEL: Record<PersonalTransactionStatus, string> = { pending: 'Pending', cleared: 'Cleared', reconciled: 'Reconciled' }
const STATUS_TONE: Record<PersonalTransactionStatus, string> = {
  pending: 'text-amber-600 bg-amber-50', cleared: 'text-slate-500 bg-slate-100', reconciled: 'text-emerald-600 bg-emerald-50',
}

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
    status: 'pending',
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
  const { user } = useAuth()
  const [tab, setTab] = useState<'transactions' | 'accounts'>('transactions')
  const [accounts, setAccounts] = useState<PersonalAccount[]>([])
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([])
  const [categories, setCategories] = useState<PersonalCategory[]>([])
  const [subcategories, setSubcategories] = useState<PersonalSubcategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [filterAccountId, setFilterAccountId] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showAccountForm, setShowAccountForm] = useState(false)
  const [accountForm, setAccountForm] = useState<PersonalAccount>(emptyAccount())
  const [selectedAccount, setSelectedAccount] = useState<PersonalAccount | null>(null)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)

  const [showTxnForm, setShowTxnForm] = useState(false)
  const [txnForm, setTxnForm] = useState<PersonalTransaction>(emptyTransaction(''))
  const [selectedTxn, setSelectedTxn] = useState<PersonalTransaction | null>(null)
  const [showDeleteTxnDialog, setShowDeleteTxnDialog] = useState(false)
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

  async function confirmDeleteAccount() {
    if (!selectedAccount) return
    const result = await deletePersonalAccount(selectedAccount.id)
    setShowDeleteAccountDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete account.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_account_deleted',
        description: `Personal account "${selectedAccount.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setAccounts(prev => prev.filter(a => a.id !== selectedAccount.id))
    setSelectedAccount(null)
    setSnack({ open: true, msg: 'Account deleted.', type: 'success' })
  }

  async function confirmDeleteTxn() {
    if (!selectedTxn) return
    const result = await deletePersonalTransaction(selectedTxn.id)
    setShowDeleteTxnDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete transaction.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_transaction_deleted',
        description: `Personal transaction "${selectedTxn.narration || selectedTxn.payeePayer || TXN_TYPE_LABEL[selectedTxn.type]}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setTransactions(prev => prev.filter(t => t.id !== selectedTxn.id))
    setSelectedTxn(null)
    setSnack({ open: true, msg: 'Transaction deleted.', type: 'success' })
  }

  async function handleSetStatus(status: PersonalTransactionStatus) {
    if (!selectedTxn) return
    const result = await updatePersonalTransactionStatus(selectedTxn, status)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update status.', type: 'error' }); return }
    const updated = { ...selectedTxn, status }
    setTransactions(prev => prev.map(t => (t.id === updated.id ? updated : t)))
    setSelectedTxn(updated)
    setSnack({ open: true, msg: `Marked ${STATUS_LABEL[status]}.`, type: 'success' })
  }

  const totalBalance = accounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0)
  const subcategoriesForCategory = subcategories.filter(s => s.categoryId === txnForm.categoryId)

  const filteredTransactions = transactions
    .filter(t => !filterAccountId || t.accountId === filterAccountId)
    .filter(t => !filterType || t.type === filterType)
    .filter(t => !filterStatus || t.status === filterStatus)
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
            <div className="flex-1">
              <SearchableSelect
                value={filterAccountId} onChange={setFilterAccountId}
                options={accounts.map(a => ({ value: a.id, label: a.name }))}
                placeholder="All accounts"
              />
            </div>
            <div className="flex-1">
              <SearchableSelect
                value={filterType} onChange={setFilterType}
                options={TXN_TYPE_OPTIONS}
                placeholder="All types"
              />
            </div>
          </div>
          <div className="px-4 pt-2">
            <SearchableSelect
              value={filterStatus} onChange={setFilterStatus}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
            />
          </div>

          <div className="px-4 pt-4 space-y-2.5">
            {!isLoading && filteredTransactions.map(t => (
              <button key={t.id} onClick={() => setSelectedTxn(t)}
                className="w-full text-left bg-white rounded-xl p-3.5 border border-slate-100 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.narration || t.payeePayer || TXN_TYPE_LABEL[t.type]}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(t.date)} · {accounts.find(a => a.id === t.accountId)?.name ?? '—'}</p>
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${INFLOW_TYPES.has(t.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {INFLOW_TYPES.has(t.type) ? '+' : '−'}{fmtCurrency(t.amount)}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {TXN_TYPE_LABEL[t.type]}
                  </span>
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_TONE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
              </button>
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
            <SearchableSelect
              value={accountForm.type} onChange={v => setAccountForm(f => ({ ...f, type: v as PersonalAccountType }))}
              options={ACCOUNT_TYPE_OPTIONS}
            />
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
                <button key={t.id} onClick={() => setSelectedTxn(t)}
                  className="w-full text-left bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between active:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.narration || t.payeePayer || TXN_TYPE_LABEL[t.type]}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(t.date)}{t.reference ? ` · ${t.reference}` : ''}</p>
                  </div>
                  <span className={`text-sm font-bold ${INFLOW_TYPES.has(t.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                    {INFLOW_TYPES.has(t.type) ? '+' : '−'}{fmtCurrency(t.amount)}
                  </span>
                </button>
              ))}
            </div>
            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteAccountDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Account
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Add transaction */}
      <BottomSheet isOpen={showTxnForm} onClose={() => setShowTxnForm(false)} title="New Transaction" height="full">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Account *</label>
            <SearchableSelect
              value={txnForm.accountId} onChange={v => setTxnForm(f => ({ ...f, accountId: v }))}
              options={accounts.map(a => ({ value: a.id, label: a.name }))}
              placeholder="Select account"
            />
          </div>
          <div>
            <label className={label}>Type</label>
            <SearchableSelect
              value={txnForm.type} onChange={v => setTxnForm(f => ({ ...f, type: v as PersonalTransactionType }))}
              options={TXN_TYPE_OPTIONS}
            />
          </div>
          <div>
            <label className={label}>Date *</label>
            <DateField value={txnForm.date} onChange={v => setTxnForm(f => ({ ...f, date: v }))} />
          </div>
          <div>
            <label className={label}>Amount *</label>
            <input type="number" className={inp} value={txnForm.amount || ''} onChange={e => setTxnForm(f => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={label}>Category</label>
            <SearchableSelect
              value={txnForm.categoryId ?? ''} onChange={v => setTxnForm(f => ({ ...f, categoryId: v || undefined, subcategoryId: undefined }))}
              options={categories.map(c => ({ value: c.id, label: `${c.groupName} · ${c.name}` }))}
              placeholder="Select category"
            />
          </div>
          {txnForm.categoryId && subcategoriesForCategory.length > 0 && (
            <div>
              <label className={label}>Subcategory</label>
              <SearchableSelect
                value={txnForm.subcategoryId ?? ''} onChange={v => setTxnForm(f => ({ ...f, subcategoryId: v || undefined }))}
                options={subcategoriesForCategory.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Select subcategory"
              />
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

      {/* Transaction detail */}
      <BottomSheet isOpen={!!selectedTxn} onClose={() => setSelectedTxn(null)} title="Transaction">
        {selectedTxn && (
          <div className="space-y-4 pb-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="font-semibold text-slate-800">{fmtDate(selectedTxn.date)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Account</span><span className="font-semibold text-slate-800">{accounts.find(a => a.id === selectedTxn.accountId)?.name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-semibold text-slate-800">{TXN_TYPE_LABEL[selectedTxn.type]}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-800">{fmtCurrency(selectedTxn.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Payee/Payer</span><span className="font-semibold text-slate-800">{selectedTxn.payeePayer || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Narration</span><span className="font-semibold text-slate-800 text-right">{selectedTxn.narration || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-semibold text-slate-800">{selectedTxn.reference || '—'}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">Status</span><span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_TONE[selectedTxn.status]}`}>{STATUS_LABEL[selectedTxn.status]}</span></div>
            </div>
            {selectedTxn.status === 'pending' && (
              <button onClick={() => handleSetStatus('cleared')}
                className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold active:bg-slate-200">
                Mark Cleared
              </button>
            )}
            {selectedTxn.status === 'cleared' && (
              <button onClick={() => handleSetStatus('reconciled')}
                className="w-full py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold active:bg-emerald-100">
                Mark Reconciled
              </button>
            )}
            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteTxnDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Transaction
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <Dialog
        isOpen={showDeleteAccountDialog}
        onClose={() => setShowDeleteAccountDialog(false)}
        title="Delete Account"
        message="Are you sure you want to delete this account? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteAccount}
        variant="danger"
      />

      <Dialog
        isOpen={showDeleteTxnDialog}
        onClose={() => setShowDeleteTxnDialog(false)}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteTxn}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
