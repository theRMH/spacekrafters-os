import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { getAllPersonalPlans, upsertPersonalPlan, deletePersonalPlan, getAllPersonalTransactions } from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type { PersonalPlan, PersonalPlanType, PersonalTransaction } from '../../types'

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${fmtCurrency(n)}`
}

// Actuals are bucketed to what PersonalTransaction can actually distinguish —
// there's no personal/business or home/office split at the transaction level,
// so personal_income+business_income share the 'income' bucket and
// home_expense+office_expense share the 'expense' bucket.
const PLAN_TYPE_BUCKET: Record<PersonalPlanType, 'income' | 'expense' | 'investment'> = {
  personal_income: 'income',
  business_income: 'income',
  home_expense:    'expense',
  office_expense:  'expense',
  investment:      'investment',
}

const PLAN_TYPE_OPTIONS: { value: PersonalPlanType; label: string }[] = [
  { value: 'personal_income', label: 'Personal Income' },
  { value: 'business_income', label: 'Business Income' },
  { value: 'home_expense',    label: 'Home Expense' },
  { value: 'office_expense',  label: 'Office Expense' },
  { value: 'investment',      label: 'Investment' },
]
const PLAN_TYPE_LABEL: Record<PersonalPlanType, string> = Object.fromEntries(PLAN_TYPE_OPTIONS.map(o => [o.value, o.label])) as Record<PersonalPlanType, string>

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function emptyPlan(financialYear: number, month: number): PersonalPlan {
  return {
    id: `pplan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    financialYear,
    month,
    planType: 'personal_income',
    projectedAmount: 0,
    createdAt: new Date().toISOString(),
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PersonalPlansScreen() {
  const { user } = useAuth()
  const now = new Date()
  const [plans, setPlans] = useState<PersonalPlan[]>([])
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [year, setYear] = useState(now.getFullYear())

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PersonalPlan>(emptyPlan(now.getFullYear(), now.getMonth() + 1))
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [p, t] = await Promise.all([getAllPersonalPlans(), getAllPersonalTransactions()])
      setPlans(p); setTransactions(t)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyPlan(year, now.getMonth() + 1))
    setIsEditing(false)
    setShowForm(true)
  }

  function openEdit(plan: PersonalPlan) {
    setForm(plan)
    setIsEditing(true)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.projectedAmount || form.projectedAmount <= 0) {
      setSnack({ open: true, msg: 'Enter a projected amount.', type: 'error' })
      return
    }
    const result = await upsertPersonalPlan(form)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save plan.', type: 'error' })
      return
    }
    setPlans(prev => {
      const exists = prev.some(p => p.id === form.id)
      return exists ? prev.map(p => (p.id === form.id ? form : p)) : [form, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Plan saved.', type: 'success' })
  }

  async function confirmDelete() {
    const result = await deletePersonalPlan(form.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete plan.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_plan_deleted',
        description: `Personal plan projection "${PLAN_TYPE_LABEL[form.planType]} — ${MONTH_LABEL[form.month - 1]} ${form.financialYear}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setPlans(prev => prev.filter(p => p.id !== form.id))
    setShowForm(false)
    setSnack({ open: true, msg: 'Plan deleted.', type: 'success' })
  }

  const yearPlans = useMemo(() => plans.filter(p => p.financialYear === year), [plans, year])

  const byMonth = useMemo(() => {
    const map = new Map<number, PersonalPlan[]>()
    for (const p of yearPlans) {
      const arr = map.get(p.month) ?? []
      arr.push(p)
      map.set(p.month, arr)
    }
    return map
  }, [yearPlans])

  // Actuals per (year, month, bucket) — bucket = income | expense | investment.
  const actualsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      const d = new Date(t.date)
      if (isNaN(d.getTime()) || d.getFullYear() !== year) continue
      const bucket = t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : t.type === 'investment' ? 'investment' : null
      if (!bucket) continue
      const key = `${d.getMonth() + 1}:${bucket}`
      map.set(key, (map.get(key) ?? 0) + t.amount)
    }
    return map
  }, [transactions, year])

  function actualFor(month: number, planType: PersonalPlanType): number {
    return actualsByMonth.get(`${month}:${PLAN_TYPE_BUCKET[planType]}`) ?? 0
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Personal Plans</h1>
          <button onClick={openCreate} aria-label="Add plan"
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            <Plus size={19} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => setYear(y => y - 1)} className="text-xs font-semibold text-slate-500 px-2 py-1 rounded-lg bg-slate-100">−</button>
          <p className="text-sm font-bold text-slate-700">{year}</p>
          <button onClick={() => setYear(y => y + 1)} className="text-xs font-semibold text-slate-500 px-2 py-1 rounded-lg bg-slate-100">+</button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {!isLoading && Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
          const rows = byMonth.get(month) ?? []
          const totalProjected = rows.reduce((sum, r) => sum + r.projectedAmount, 0)
          const seenBuckets = new Set(rows.map(r => PLAN_TYPE_BUCKET[r.planType]))
          const totalActual = [...seenBuckets].reduce((sum, b) => sum + (actualsByMonth.get(`${month}:${b}`) ?? 0), 0)
          const totalVariance = totalActual - totalProjected
          return (
            <div key={month} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm text-slate-800">{MONTH_LABEL[month - 1]}</p>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(totalProjected)}</p>
                  {rows.length > 0 && (
                    <p className={`text-[11px] font-semibold ${totalVariance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtSigned(totalVariance)} vs actual</p>
                  )}
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-slate-300">No projections</p>
              ) : (
                <div className="space-y-1.5">
                  {rows.map(r => {
                    const actual = actualFor(r.month, r.planType)
                    const variance = actual - r.projectedAmount
                    return (
                      <button key={r.id} onClick={() => openEdit(r)} className="w-full flex items-center justify-between text-xs active:opacity-70">
                        <span className="text-slate-500">{PLAN_TYPE_LABEL[r.planType]}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-400">{fmtCurrency(actual)} actual</span>
                          <span className="font-semibold text-slate-700">{fmtCurrency(r.projectedAmount)}</span>
                          <span className={`font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtSigned(variance)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? 'Edit Plan Projection' : 'New Plan Projection'}>
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Month</label>
            <SearchableSelect
              value={String(form.month)} onChange={v => setForm(f => ({ ...f, month: Number(v) }))}
              options={MONTH_LABEL.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div>
            <label className={label}>Year</label>
            <input type="number" className={inp} value={form.financialYear} onChange={e => setForm(f => ({ ...f, financialYear: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={label}>Plan Type</label>
            <SearchableSelect
              value={form.planType} onChange={v => setForm(f => ({ ...f, planType: v as PersonalPlanType }))}
              options={PLAN_TYPE_OPTIONS}
            />
          </div>
          <div>
            <label className={label}>Projected Amount *</label>
            <input type="number" className={inp} value={form.projectedAmount || ''} onChange={e => setForm(f => ({ ...f, projectedAmount: Number(e.target.value) }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Projection
          </button>
          {isEditing && user?.role === 'owner' && (
            <button onClick={() => setShowDeleteDialog(true)}
              className="w-full text-center text-xs font-semibold text-red-500 py-2">
              Delete Projection
            </button>
          )}
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Plan Projection"
        message="Are you sure you want to delete this plan projection? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
