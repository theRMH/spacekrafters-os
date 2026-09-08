import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { getAllPersonalCommitments } from '../../services/personalFinanceService'
import type { PersonalCommitment, PersonalCommitmentStatus } from '../../types'

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const STATUS_TONE: Record<PersonalCommitmentStatus, string> = {
  upcoming: 'text-slate-500 bg-slate-100', due: 'text-amber-600 bg-amber-50', overdue: 'text-red-600 bg-red-50',
  paid: 'text-emerald-600 bg-emerald-50', paused: 'text-slate-500 bg-slate-100', cancelled: 'text-slate-400 bg-slate-100', expired: 'text-slate-400 bg-slate-100',
}

export default function PersonalCalendarScreen() {
  const now = new Date()
  const [commitments, setCommitments] = useState<PersonalCommitment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setCommitments(await getAllPersonalCommitments())
      setIsLoading(false)
    }
    load()
  }, [])

  const monthCommitments = useMemo(() => {
    return commitments
      .filter(c => {
        const d = new Date(c.dueDate)
        return d.getMonth() + 1 === month && d.getFullYear() === year
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [commitments, month, year])

  const byDay = useMemo(() => {
    const map = new Map<number, PersonalCommitment[]>()
    for (const c of monthCommitments) {
      const day = new Date(c.dueDate).getDate()
      const arr = map.get(day) ?? []
      arr.push(c)
      map.set(day, arr)
    }
    return map
  }, [monthCommitments])

  function shiftMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y -= 1 }
    if (m > 12) { m = 1; y += 1 }
    setMonth(m); setYear(y)
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-2">Personal Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="text-xs font-semibold text-slate-500 px-2 py-1 rounded-lg bg-slate-100">‹</button>
          <p className="text-sm font-bold text-slate-700">{MONTH_LABEL[month - 1]} {year}</p>
          <button onClick={() => shiftMonth(1)} className="text-xs font-semibold text-slate-500 px-2 py-1 rounded-lg bg-slate-100">›</button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && Array.from(byDay.keys()).sort((a, b) => a - b).map(day => (
          <div key={day} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-400 mb-2">{MONTH_LABEL[month - 1]} {day}</p>
            <div className="space-y-2">
              {byDay.get(day)!.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    {c.expectedAmount != null && <p className="text-xs text-slate-400">{fmtCurrency(c.expectedAmount)}</p>}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_TONE[c.status]}`}>{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && byDay.size === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No commitments due this month.</p>
        )}
      </div>
    </div>
  )
}
