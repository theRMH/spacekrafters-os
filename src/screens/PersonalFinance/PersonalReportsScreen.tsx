import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import {
  getAllPersonalTransactions, getAllPersonalCategories,
  getAllPersonalCommitments, getAllPersonalInvestments, getAllPersonalPlans,
} from '../../services/personalFinanceService'
import type {
  PersonalTransaction, PersonalCategory, PersonalCommitment, PersonalInvestment,
  PersonalPlan, PersonalPlanType, PersonalInvestmentType, PersonalCommitmentStatus,
} from '../../types'

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${fmtCurrency(n)}`
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-extrabold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">{title}</h3>
      {children}
    </div>
  )
}

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PLAN_TYPE_OPTIONS: { value: PersonalPlanType; label: string }[] = [
  { value: 'personal_income', label: 'Personal Income' },
  { value: 'business_income', label: 'Business Income' },
  { value: 'home_expense',    label: 'Home Expense' },
  { value: 'office_expense',  label: 'Office Expense' },
  { value: 'investment',      label: 'Investment' },
]
const PLAN_TYPE_LABEL: Record<PersonalPlanType, string> = Object.fromEntries(PLAN_TYPE_OPTIONS.map(o => [o.value, o.label])) as Record<PersonalPlanType, string>
// Same bucketing as PersonalPlansScreen.tsx — PersonalTransaction can't distinguish personal/business or home/office.
const PLAN_TYPE_BUCKET: Record<PersonalPlanType, 'income' | 'expense' | 'investment'> = {
  personal_income: 'income',
  business_income: 'income',
  home_expense:    'expense',
  office_expense:  'expense',
  investment:      'investment',
}

const INVESTMENT_TYPE_LABEL: Record<PersonalInvestmentType, string> = {
  mutual_fund: 'Mutual Fund', stock: 'Stock', fd: 'Fixed Deposit', ppf: 'PPF',
  real_estate: 'Real Estate', gold: 'Gold', other: 'Other',
}

const COMMITMENT_STATUS_TONE: Record<PersonalCommitmentStatus, string> = {
  upcoming: 'text-slate-500 bg-slate-100', due: 'text-amber-600 bg-amber-50', overdue: 'text-red-600 bg-red-50',
  paid: 'text-emerald-600 bg-emerald-50', paused: 'text-slate-500 bg-slate-100', cancelled: 'text-slate-400 bg-slate-100', expired: 'text-slate-400 bg-slate-100',
}

const TABS = ['Summary', 'Expenses', 'Income', 'Commitments', 'Investments', 'Plan Variance'] as const
type Tab = typeof TABS[number]

export default function PersonalReportsScreen() {
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([])
  const [categories, setCategories] = useState<PersonalCategory[]>([])
  const [commitments, setCommitments] = useState<PersonalCommitment[]>([])
  const [investments, setInvestments] = useState<PersonalInvestment[]>([])
  const [plans, setPlans] = useState<PersonalPlan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Summary')

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [t, c, cm, inv, pl] = await Promise.all([
        getAllPersonalTransactions(), getAllPersonalCategories(),
        getAllPersonalCommitments(), getAllPersonalInvestments(), getAllPersonalPlans(),
      ])
      setTransactions(t); setCategories(c); setCommitments(cm); setInvestments(inv); setPlans(pl)
      setIsLoading(false)
    }
    load()
  }, [])

  const monthTxns = useMemo(() => transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() + 1 === month && d.getFullYear() === year
  }), [transactions, month, year])

  const income = useMemo(() => monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [monthTxns])
  const expense = useMemo(() => monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [monthTxns])
  const net = income - expense

  function categoryBreakdownFor(type: 'income' | 'expense') {
    const map = new Map<string, number>()
    for (const t of monthTxns) {
      if (t.type !== type) continue
      const key = t.categoryId ?? '__uncategorized__'
      map.set(key, (map.get(key) ?? 0) + t.amount)
    }
    return Array.from(map.entries())
      .map(([categoryId, total]) => ({
        categoryId,
        name: categoryId === '__uncategorized__' ? 'Uncategorized' : (categories.find(c => c.id === categoryId)?.name ?? 'Unknown'),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }
  const expenseBreakdown = useMemo(() => categoryBreakdownFor('expense'), [monthTxns, categories])
  const incomeBreakdown = useMemo(() => categoryBreakdownFor('income'), [monthTxns, categories])
  const maxExpenseTotal = expenseBreakdown[0]?.total ?? 0
  const maxIncomeTotal = incomeBreakdown[0]?.total ?? 0

  const commitmentCounts = useMemo(() => {
    const counts = { due: 0, overdue: 0, upcoming: 0, paid: 0 }
    let dueAmount = 0, overdueAmount = 0
    for (const c of commitments) {
      if (c.status === 'due') { counts.due++; dueAmount += c.expectedAmount ?? 0 }
      else if (c.status === 'overdue') { counts.overdue++; overdueAmount += c.expectedAmount ?? 0 }
      else if (c.status === 'upcoming') counts.upcoming++
      else if (c.status === 'paid') counts.paid++
    }
    return { ...counts, dueAmount, overdueAmount }
  }, [commitments])

  const investmentTotals = useMemo(() => {
    const totalInvested = investments.reduce((s, i) => s + i.investedAmount, 0)
    const totalCurrent = investments.reduce((s, i) => s + (i.currentValue ?? i.investedAmount), 0)
    return { totalInvested, totalCurrent, totalGain: totalCurrent - totalInvested }
  }, [investments])

  const investmentsByType = useMemo(() => {
    const map = new Map<PersonalInvestmentType, { invested: number; current: number }>()
    for (const i of investments) {
      const entry = map.get(i.investmentType) ?? { invested: 0, current: 0 }
      entry.invested += i.investedAmount
      entry.current += i.currentValue ?? i.investedAmount
      map.set(i.investmentType, entry)
    }
    return Array.from(map.entries()).map(([investmentType, v]) => ({ investmentType, ...v, gain: v.current - v.invested }))
      .sort((a, b) => b.invested - a.invested)
  }, [investments])

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

  const yearPlans = useMemo(() => plans.filter(p => p.financialYear === year).sort((a, b) => a.month - b.month), [plans, year])
  const planVarianceTotals = useMemo(() => {
    let totalProjected = 0, totalActual = 0
    const seenByMonth = new Map<number, Set<'income' | 'expense' | 'investment'>>()
    for (const p of yearPlans) {
      totalProjected += p.projectedAmount
      const set = seenByMonth.get(p.month) ?? new Set()
      set.add(PLAN_TYPE_BUCKET[p.planType])
      seenByMonth.set(p.month, set)
    }
    for (const [m, buckets] of seenByMonth) {
      for (const b of buckets) totalActual += actualsByMonth.get(`${m}:${b}`) ?? 0
    }
    return { totalProjected, totalActual, variance: totalActual - totalProjected }
  }, [yearPlans, actualsByMonth])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-3 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-2">Personal Reports</h1>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-28">
            <SearchableSelect
              value={String(month)} onChange={v => setMonth(Number(v))}
              options={MONTH_LABEL.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div className="w-28">
            <SearchableSelect
              value={String(year)} onChange={v => setYear(Number(v))}
              options={[year - 1, year, year + 1].map(y => ({ value: String(y), label: String(y) }))}
            />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full ${tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {!isLoading && tab === 'Summary' && (
          <>
            <Section title="Summary">
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Income" value={fmtCurrency(income)} tone="good" />
                <StatCard label="Expense" value={fmtCurrency(expense)} tone="bad" />
                <StatCard label="Net" value={fmtCurrency(net)} tone={net >= 0 ? 'good' : 'bad'} />
              </div>
            </Section>
            <Section title="Expense by Category">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                {expenseBreakdown.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No expenses this month.</p>}
                {expenseBreakdown.slice(0, 5).map(c => (
                  <div key={c.categoryId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{c.name}</span>
                      <span className="text-xs font-bold text-slate-800">{fmtCurrency(c.total)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${maxExpenseTotal ? (c.total / maxExpenseTotal) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {!isLoading && tab === 'Expenses' && (
          <Section title="Expense by Category">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              {expenseBreakdown.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No expenses this month.</p>}
              {expenseBreakdown.map(c => (
                <div key={c.categoryId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600">{c.name}</span>
                    <span className="text-xs font-bold text-slate-800">{fmtCurrency(c.total)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${maxExpenseTotal ? (c.total / maxExpenseTotal) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {!isLoading && tab === 'Income' && (
          <Section title="Income by Category">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              {incomeBreakdown.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No income this month.</p>}
              {incomeBreakdown.map(c => (
                <div key={c.categoryId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600">{c.name}</span>
                    <span className="text-xs font-bold text-slate-800">{fmtCurrency(c.total)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${maxIncomeTotal ? (c.total / maxIncomeTotal) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {!isLoading && tab === 'Commitments' && (
          <>
            <Section title="Overview">
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Due" value={String(commitmentCounts.due)} sub={fmtCurrency(commitmentCounts.dueAmount)} />
                <StatCard label="Overdue" value={String(commitmentCounts.overdue)} sub={fmtCurrency(commitmentCounts.overdueAmount)} tone={commitmentCounts.overdue > 0 ? 'bad' : undefined} />
                <StatCard label="Upcoming" value={String(commitmentCounts.upcoming)} />
                <StatCard label="Paid" value={String(commitmentCounts.paid)} tone="good" />
              </div>
            </Section>
            <Section title="Due &amp; Overdue">
              <div className="space-y-2">
                {commitments.filter(c => c.status === 'due' || c.status === 'overdue').length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">Nothing due or overdue.</p>
                )}
                {commitments.filter(c => c.status === 'due' || c.status === 'overdue').map(c => (
                  <div key={c.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-[11px] text-slate-400">Due {fmtDate(c.dueDate)}{c.expectedAmount != null ? ` · ${fmtCurrency(c.expectedAmount)}` : ''}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${COMMITMENT_STATUS_TONE[c.status]}`}>{c.status}</span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {!isLoading && tab === 'Investments' && (
          <>
            <Section title="Overview">
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Invested" value={fmtCurrency(investmentTotals.totalInvested)} />
                <StatCard label="Current Value" value={fmtCurrency(investmentTotals.totalCurrent)} />
                <StatCard label="Gain / Loss" value={fmtSigned(investmentTotals.totalGain)} tone={investmentTotals.totalGain >= 0 ? 'good' : 'bad'} />
              </div>
            </Section>
            <Section title="By Type">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                {investmentsByType.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No investments recorded.</p>}
                {investmentsByType.map(i => (
                  <div key={i.investmentType} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">{INVESTMENT_TYPE_LABEL[i.investmentType]}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">{fmtCurrency(i.current)}</span>
                      <span className={`font-semibold ${i.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtSigned(i.gain)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {!isLoading && tab === 'Plan Variance' && (
          <>
            <Section title={`${year} Overview`}>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Projected" value={fmtCurrency(planVarianceTotals.totalProjected)} />
                <StatCard label="Actual" value={fmtCurrency(planVarianceTotals.totalActual)} />
                <StatCard label="Variance" value={fmtSigned(planVarianceTotals.variance)} tone={planVarianceTotals.variance >= 0 ? 'good' : 'bad'} />
              </div>
            </Section>
            <Section title="By Month">
              <div className="space-y-2">
                {yearPlans.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No plan projections for {year}.</p>}
                {Array.from(new Set(yearPlans.map(p => p.month))).map(m => {
                  const rows = yearPlans.filter(p => p.month === m)
                  const projected = rows.reduce((s, r) => s + r.projectedAmount, 0)
                  const buckets = new Set(rows.map(r => PLAN_TYPE_BUCKET[r.planType]))
                  const actual = [...buckets].reduce((s, b) => s + (actualsByMonth.get(`${m}:${b}`) ?? 0), 0)
                  const variance = actual - projected
                  return (
                    <div key={m} className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-bold text-slate-800">{MONTH_LABEL[m - 1]}</p>
                        <span className={`text-xs font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtSigned(variance)}</span>
                      </div>
                      {rows.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="text-slate-500">{PLAN_TYPE_LABEL[r.planType]}</span>
                          <span className="text-slate-700 font-semibold">{fmtCurrency(r.projectedAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
