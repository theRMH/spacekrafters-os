import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllCompanyAccounts, addCompanyTransaction, addTransactionAllocations } from '../../services/companyAccountService'
import { getAllPersonalAccounts, addPersonalTransaction } from '../../services/personalFinanceService'
import type { CompanyAccount, CompanyTransaction, CompanyTransactionType, TransactionAllocation, PersonalAccount, PersonalTransaction } from '../../types'

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

interface ParsedRow {
  key: string
  date: string
  description: string
  amount: number
  type: CompanyTransactionType
  category: string
  include: boolean
}

const CLASSIFY_RULES: { keyword: string; category: string }[] = [
  { keyword: 'salary', category: 'Salary' },
  { keyword: 'rent', category: 'Rent' },
  { keyword: 'vendor', category: 'Vendor Payment' },
  { keyword: 'gst', category: 'Tax' },
  { keyword: 'tax', category: 'Tax' },
  { keyword: 'interest', category: 'Interest' },
  { keyword: 'refund', category: 'Refund' },
  { keyword: 'transfer', category: 'Transfer' },
  { keyword: 'upi', category: 'UPI Payment' },
  { keyword: 'fee', category: 'Bank Charges' },
  { keyword: 'charge', category: 'Bank Charges' },
]

function classify(description: string): string {
  const lower = description.toLowerCase()
  const match = CLASSIFY_RULES.find(r => lower.includes(r.keyword))
  return match?.category ?? 'Uncategorized'
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const dateIdx = header.findIndex(h => h.includes('date'))
  const descIdx = header.findIndex(h => h.includes('desc') || h.includes('narration') || h.includes('particular'))
  const debitIdx = header.findIndex(h => h.includes('debit') || h.includes('withdrawal'))
  const creditIdx = header.findIndex(h => h.includes('credit') || h.includes('deposit'))
  const amountIdx = header.findIndex(h => h === 'amount')

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    if (cols.length < 2) continue

    const date = dateIdx >= 0 ? cols[dateIdx] : ''
    const description = descIdx >= 0 ? cols[descIdx] : cols.join(' ')

    let amount = 0
    let type: CompanyTransactionType = 'debit'
    if (debitIdx >= 0 && cols[debitIdx]) {
      amount = Number(cols[debitIdx].replace(/[^0-9.-]/g, ''))
      type = 'debit'
    } else if (creditIdx >= 0 && cols[creditIdx]) {
      amount = Number(cols[creditIdx].replace(/[^0-9.-]/g, ''))
      type = 'credit'
    } else if (amountIdx >= 0 && cols[amountIdx]) {
      const raw = Number(cols[amountIdx].replace(/[^0-9.-]/g, ''))
      amount = Math.abs(raw)
      type = raw < 0 ? 'debit' : 'credit'
    }

    if (!amount || isNaN(amount)) continue

    rows.push({
      key: `row_${i}_${Date.now()}`,
      date: date || new Date().toISOString().slice(0, 10),
      description: description || 'Imported transaction',
      amount,
      type,
      category: classify(description),
      include: true,
    })
  }
  return rows
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

type ImportScope = 'company' | 'personal'

export default function StatementImportScreen() {
  const [scope, setScope] = useState<ImportScope>('company')
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [personalAccounts, setPersonalAccounts] = useState<PersonalAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    getAllCompanyAccounts().then(setAccounts)
    getAllPersonalAccounts().then(setPersonalAccounts)
  }, [])

  function handleScopeChange(next: ImportScope) {
    setScope(next)
    setAccountId('')
    setRows([])
    setFileName('')
  }

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        setSnack({ open: true, msg: 'No transaction rows found. Check the CSV has Date/Description/Debit/Credit (or Amount) columns.', type: 'error' })
      }
      setRows(parsed)
    }
    reader.readAsText(file)
  }

  function updateRow(key: string, patch: Partial<ParsedRow>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  const includedRows = rows.filter(r => r.include)
  const netDelta = includedRows.reduce((sum, r) => sum + (r.type === 'credit' ? r.amount : -r.amount), 0)

  async function handleConfirm() {
    if (!accountId) {
      setSnack({ open: true, msg: 'Select the account this statement belongs to.', type: 'error' })
      return
    }
    if (includedRows.length === 0) {
      setSnack({ open: true, msg: 'No rows selected to import.', type: 'error' })
      return
    }
    setIsPosting(true)
    let failed = 0
    for (const row of includedRows) {
      if (scope === 'personal') {
        const txn: PersonalTransaction = {
          id: `ptxn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          accountId,
          date: new Date(row.date).toISOString() || new Date().toISOString(),
          amount: row.amount,
          type: row.type === 'credit' ? 'income' : 'expense',
          narration: `${row.category}: ${row.description}`,
          source: 'imported',
          createdAt: new Date().toISOString(),
        }
        const result = await addPersonalTransaction(txn)
        if (!result.ok) failed++
        continue
      }
      const txn: CompanyTransaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        accountId,
        type: row.type,
        amount: row.amount,
        description: `${row.category}: ${row.description}`,
        date: new Date(row.date).toISOString() || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      const result = await addCompanyTransaction(txn)
      if (!result.ok) {
        failed++
        continue
      }
      // One transaction row, allocated as company overhead (statement rows have no project link) (Finance Rule 3).
      const allocation: TransactionAllocation = {
        id: `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        transactionId: txn.id,
        amount: row.amount,
        createdAt: new Date().toISOString(),
      }
      await addTransactionAllocations([allocation])
    }
    setIsPosting(false)
    const destination = scope === 'personal' ? 'Personal Finance' : 'Company Accounts'
    if (failed > 0) {
      setSnack({ open: true, msg: `${includedRows.length - failed} of ${includedRows.length} rows posted. ${failed} failed.`, type: 'error' })
    } else {
      setSnack({ open: true, msg: `${includedRows.length} transactions posted to ${destination}.`, type: 'success' })
      setRows([])
      setFileName('')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Statement Import</h1>
        <p className="text-xs text-slate-400">Upload a CSV bank statement, review, and post to Company or Personal Finance.</p>
      </div>

      <PermissionGate permission="manage_company_accounts" fallback={
        <p className="text-sm text-slate-400 text-center py-16">You don't have permission to import statements.</p>
      }>
        <div className="px-4 pt-4 space-y-4">
          <div>
            <label className={label}>Import Into</label>
            <div className="flex gap-2">
              <button onClick={() => handleScopeChange('company')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${scope === 'company' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                Company
              </button>
              <button onClick={() => handleScopeChange('personal')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${scope === 'personal' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                Personal
              </button>
            </div>
          </div>

          <div>
            <label className={label}>Deposit Account *</label>
            <select className={inp} value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {(scope === 'company' ? accounts : personalAccounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <label className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-semibold cursor-pointer active:bg-slate-100">
            <Upload size={16} />
            {fileName || 'Upload CSV statement'}
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>

          {rows.length > 0 && (
            <>
              <div className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">{includedRows.length} of {rows.length} rows selected</span>
                <span className={`text-sm font-bold ${netDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Net {netDelta >= 0 ? '+' : ''}{fmtCurrency(netDelta)}
                </span>
              </div>

              <div className="space-y-2">
                {rows.map(row => (
                  <div key={row.key} className={`bg-white rounded-xl p-3 border ${row.include ? 'border-slate-100' : 'border-slate-100 opacity-50'}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={row.include} onChange={e => updateRow(row.key, { include: e.target.checked })} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">{row.description}</p>
                          <span className={`text-sm font-bold whitespace-nowrap ${row.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {row.type === 'credit' ? '+' : '−'}{fmtCurrency(row.amount)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mb-2">{row.date}</p>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                          value={row.category} onChange={e => updateRow(row.key, { category: e.target.value })} placeholder="Category" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={handleConfirm} disabled={isPosting}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
                {isPosting ? 'Posting…' : `Confirm & Post ${includedRows.length} Transactions`}
              </button>
            </>
          )}
        </div>
      </PermissionGate>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
