import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllCompanyAccounts, addCompanyTransaction, addTransactionAllocations } from '../../services/companyAccountService'
import { getAllPersonalAccounts, addPersonalTransaction, getAllPersonalCategories, getAllPersonalSubcategories } from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type { CompanyAccount, CompanyTransaction, CompanyTransactionType, CompanyTransactionCategory, TransactionAllocation, PersonalAccount, PersonalTransaction, PersonalTransactionType, PersonalCategory, PersonalSubcategory, AuditLog } from '../../types'

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
  companyCategory?: CompanyTransactionCategory
  personalType: PersonalTransactionType
  personalCategoryId?: string
  personalSubcategoryId?: string
  include: boolean
}

const PERSONAL_TYPE_OPTIONS: { value: PersonalTransactionType; label: string }[] = [
  { value: 'income',           label: 'Income' },
  { value: 'expense',          label: 'Expense' },
  { value: 'transfer',         label: 'Transfer' },
  { value: 'investment',       label: 'Investment' },
  { value: 'advance_received', label: 'Advance Received' },
  { value: 'advance_paid',     label: 'Advance Paid' },
  { value: 'loan_received',    label: 'Loan Received' },
  { value: 'loan_paid',        label: 'Loan Paid' },
]

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
      personalType: type === 'credit' ? 'income' : 'expense',
      include: true,
    })
  }
  return rows
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

type ImportScope = 'company' | 'personal'

export default function StatementImportScreen() {
  const { user } = useAuth()
  const [scope, setScope] = useState<ImportScope>('company')
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [personalAccounts, setPersonalAccounts] = useState<PersonalAccount[]>([])
  const [personalCategories, setPersonalCategories] = useState<PersonalCategory[]>([])
  const [personalSubcategories, setPersonalSubcategories] = useState<PersonalSubcategory[]>([])
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    getAllCompanyAccounts().then(setAccounts)
    getAllPersonalAccounts().then(setPersonalAccounts)
    getAllPersonalCategories().then(setPersonalCategories)
    getAllPersonalSubcategories().then(setPersonalSubcategories)
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
    let allocationWarnings = 0
    for (const row of includedRows) {
      if (scope === 'personal') {
        const txn: PersonalTransaction = {
          id: `ptxn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          accountId,
          date: new Date(row.date).toISOString() || new Date().toISOString(),
          amount: row.amount,
          type: row.personalType,
          categoryId: row.personalCategoryId,
          subcategoryId: row.personalSubcategoryId,
          narration: `${row.category}: ${row.description}`,
          source: 'imported',
          status: 'cleared',
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
        category: row.companyCategory,
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
      const allocResult = await addTransactionAllocations([allocation])
      if (!allocResult.ok) allocationWarnings++
    }
    setIsPosting(false)
    const destination = scope === 'personal' ? 'Personal Finance' : 'Company Accounts'
    const postedCount = includedRows.length - failed
    if (user && postedCount > 0) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'statement_import_posted',
        description: `Imported statement "${fileName}": ${postedCount} transaction${postedCount > 1 ? 's' : ''} posted to ${destination}.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    if (failed > 0) {
      setSnack({ open: true, msg: `${includedRows.length - failed} of ${includedRows.length} rows posted. ${failed} failed.`, type: 'error' })
    } else if (allocationWarnings > 0) {
      setSnack({ open: true, msg: `${includedRows.length} transactions posted to ${destination}, but ${allocationWarnings} allocation${allocationWarnings > 1 ? 's' : ''} failed — contact an admin to allocate manually.`, type: 'error' })
      setRows([])
      setFileName('')
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
            <SearchableSelect
              value={accountId} onChange={setAccountId}
              options={(scope === 'company' ? accounts : personalAccounts).map(a => ({ value: a.id, label: a.name }))}
              placeholder="Select account…"
            />
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
                        <div className="flex gap-1.5">
                          <input className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                            value={row.category} onChange={e => updateRow(row.key, { category: e.target.value })} placeholder="Category" />
                          {scope === 'company' && (
                            <div className="flex-1 min-w-0">
                              <SearchableSelect
                                value={row.companyCategory ?? ''}
                                onChange={v => updateRow(row.key, { companyCategory: (v || undefined) as CompanyTransactionCategory | undefined })}
                                options={[{ value: 'transfer', label: 'Transfer' }, { value: 'owner_funding', label: 'Owner Funding' }]}
                                placeholder="Income/Expense"
                              />
                            </div>
                          )}
                        </div>
                        {scope === 'personal' && (
                          <div className="flex gap-1.5 mt-1.5">
                            <div className="flex-1 min-w-0">
                              <SearchableSelect
                                value={row.personalType}
                                onChange={v => updateRow(row.key, { personalType: v as PersonalTransactionType })}
                                options={PERSONAL_TYPE_OPTIONS}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <SearchableSelect
                                value={row.personalCategoryId ?? ''}
                                onChange={v => updateRow(row.key, { personalCategoryId: v || undefined, personalSubcategoryId: undefined })}
                                options={personalCategories.map(c => ({ value: c.id, label: c.name }))}
                                placeholder="No category"
                              />
                            </div>
                            {row.personalCategoryId && personalSubcategories.some(s => s.categoryId === row.personalCategoryId) && (
                              <div className="flex-1 min-w-0">
                                <SearchableSelect
                                  value={row.personalSubcategoryId ?? ''}
                                  onChange={v => updateRow(row.key, { personalSubcategoryId: v || undefined })}
                                  options={personalSubcategories.filter(s => s.categoryId === row.personalCategoryId).map(s => ({ value: s.id, label: s.name }))}
                                  placeholder="No subcategory"
                                />
                              </div>
                            )}
                          </div>
                        )}
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
