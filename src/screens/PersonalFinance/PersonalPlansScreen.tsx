import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllPersonalPlans, upsertPersonalPlan } from '../../services/personalFinanceService'
import type { PersonalPlan, PersonalPlanType } from '../../types'

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
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
  const now = new Date()
  const [plans, setPlans] = useState<PersonalPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [year, setYear] = useState(now.getFullYear())

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PersonalPlan>(emptyPlan(now.getFullYear(), now.getMonth() + 1))
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setPlans(await getAllPersonalPlans())
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyPlan(year, now.getMonth() + 1))
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
          const total = rows.reduce((sum, r) => sum + r.projectedAmount, 0)
          return (
            <div key={month} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm text-slate-800">{MONTH_LABEL[month - 1]}</p>
                <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(total)}</p>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-slate-300">No projections</p>
              ) : (
                <div className="space-y-1">
                  {rows.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{PLAN_TYPE_LABEL[r.planType]}</span>
                      <span className="font-semibold text-slate-700">{fmtCurrency(r.projectedAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Plan Projection">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Month</label>
            <select className={inp} value={form.month} onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}>
              {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Year</label>
            <input type="number" className={inp} value={form.financialYear} onChange={e => setForm(f => ({ ...f, financialYear: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={label}>Plan Type</label>
            <select className={inp} value={form.planType} onChange={e => setForm(f => ({ ...f, planType: e.target.value as PersonalPlanType }))}>
              {PLAN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Projected Amount *</label>
            <input type="number" className={inp} value={form.projectedAmount || ''} onChange={e => setForm(f => ({ ...f, projectedAmount: Number(e.target.value) }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Projection
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
