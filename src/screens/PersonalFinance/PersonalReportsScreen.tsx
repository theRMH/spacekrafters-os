import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { getAllPersonalTransactions, getAllPersonalCategories } from '../../services/personalFinanceService'
import type { PersonalTransaction, PersonalCategory } from '../../types'

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
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

export default function PersonalReportsScreen() {
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([])
  const [categories, setCategories] = useState<PersonalCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [t, c] = await Promise.all([getAllPersonalTransactions(), getAllPersonalCategories()])
      setTransactions(t); setCategories(c)
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

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of monthTxns) {
      if (t.type !== 'expense') continue
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
  }, [monthTxns, categories])

  const maxCategoryTotal = categoryBreakdown[0]?.total ?? 0

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-2">Personal Reports</h1>
        <div className="flex items-center gap-2">
          <select className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-1.5" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-1.5" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="px-4 pt-4">
        {!isLoading && (
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
                {categoryBreakdown.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No expenses this month.</p>
                )}
                {categoryBreakdown.map(c => (
                  <div key={c.categoryId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{c.name}</span>
                      <span className="text-xs font-bold text-slate-800">{fmtCurrency(c.total)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${maxCategoryTotal ? (c.total / maxCategoryTotal) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
