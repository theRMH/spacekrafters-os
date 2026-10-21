import { useMemo, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { DateField } from '../../components/forms/DateField'
import { ApprovalSection } from '../MDTasks/ApprovalSection'
import { FILTERS, type FilterKey, resolveRange } from '../Dashboard/dashboardDateUtils'

// MD-only Approval tab — the single place every Quotation/Designing/MRF/
// Rescheduled Appointment decision happens, as one flat pending queue (no
// per-type tab switcher, matching the FENSTER reference). Pending items
// only — no decision history on this page. (Route is gated by
// `view_md_tasks`, which only the owner/MD has.)
export default function ApprovalScreen() {
  const [pendingCount, setPendingCount] = useState(0)

  const [dateFilter, setDateFilter] = useState<FilterKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => resolveRange(dateFilter, new Date(), customFrom, customTo), [dateFilter, customFrom, customTo])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Approvals</h1>
        <p className="text-xs text-slate-400 mt-0.5">{pendingCount} waiting for your review</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setDateFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${dateFilter === f.key ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
              style={dateFilter === f.key ? { background: '#4F46E5' } : {}}>
              {f.label}
            </button>
          ))}
        </div>
        {dateFilter === 'custom' && (
          <div className="flex items-end gap-2 flex-wrap mt-2">
            <div className="w-36">
              <label className="text-[11px] font-semibold text-slate-400 mb-1 block">From</label>
              <DateField value={customFrom} onChange={setCustomFrom} />
            </div>
            <span className="text-slate-400 text-xs pb-2.5">→</span>
            <div className="w-36">
              <label className="text-[11px] font-semibold text-slate-400 mb-1 block">To</label>
              <DateField value={customTo} onChange={setCustomTo} />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-6">
        <ApprovalSection range={range} onPendingCount={setPendingCount} />
      </div>
    </div>
  )
}
