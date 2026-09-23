import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { useCRM } from '../../context/CRMContext'
import { getAllProjects } from '../../services/projectService'
import { FILTERS, type FilterKey, resolveRange, inRange } from './dashboardDateUtils'
import { buildSalesPerformance } from './salesPerformance'
import type { Lead, Project } from '../../types'

// One consistent accent for whichever tab is selected (matches the reference
// UI) — the per-stage color (blue/violet/amber/emerald) is reserved for the
// summary amount below, not the tab itself.
const TAB_ACTIVE_COLOR = '#4F46E5'

const STAGES = [
  { key: 'active',      label: 'Active',      color: '#2563EB' },
  { key: 'negotiation', label: 'Negotiation', color: '#7C3AED' },
  { key: 'production',  label: 'Production',  color: '#D97706' },
  { key: 'done',        label: 'Done',        color: '#059669' },
] as const
type StageKey = typeof STAGES[number]['key']

function fmtCurrency(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function SalesPersonDetailScreen() {
  const { personName } = useParams<{ personName: string }>()
  const navigate = useNavigate()
  const { leads } = useCRM()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [stage, setStage] = useState<StageKey>('active')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    getAllProjects().then(p => { setProjects(p); setIsLoading(false) })
  }, [])

  const salesPerformance = useMemo(() => buildSalesPerformance(leads as Lead[], projects), [leads, projects])
  const person = useMemo(
    () => salesPerformance.find(p => p.name === decodeURIComponent(personName ?? '')),
    [salesPerformance, personName],
  )

  const now = useMemo(() => new Date(), [])
  const range = useMemo(() => resolveRange(filter, now, customFrom, customTo), [filter, now, customFrom, customTo])

  const bucket = person?.[stage]
  const records = useMemo(() => (bucket?.records ?? []).filter(r => inRange(r.updatedAt, range)), [bucket, range])
  const filteredValue = records.reduce((s, r) => s + r.amount, 0)
  const stageMeta = STAGES.find(s => s.key === stage)!

  if (!isLoading && !person) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">No performance data found for this person.</p>
      </div>
    )
  }

  const totalLeads = person ? person.active.count + person.negotiation.count + person.production.count + person.done.count : 0

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Sales Team Performance</p>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-extrabold" style={{ background: '#0F2A4A' }}>
                {(person?.name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-slate-800 truncate">{person?.name ?? '—'}</h1>
                <p className="text-xs text-slate-400">{totalLeads} total leads/projects</p>
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/dashboard')} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 active:bg-slate-200">
            <X size={17} className="text-slate-500" />
          </button>
        </div>

        {/* Stage tabs */}
        <div className="flex items-center gap-2">
          {STAGES.map(s => {
            const active = stage === s.key
            return (
              <button key={s.key} onClick={() => setStage(s.key)}
                className={`flex-1 px-3 py-2.5 rounded-full text-sm font-bold whitespace-nowrap text-center ${active ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
                style={active ? { background: TAB_ACTIVE_COLOR } : {}}>
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Date filters */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f.key ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
              style={filter === f.key ? { background: '#2563EB' } : {}}>
              {f.label}
            </button>
          ))}
        </div>
        {filter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        )}

        {/* Performance summary */}
        <div className="rounded-2xl p-4" style={{ background: '#F8FAFC' }}>
          <p className="text-2xl font-extrabold" style={{ color: stageMeta.color }}>{fmtCurrency(filteredValue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{records.length} {records.length === 1 ? (stage === 'production' || stage === 'done' ? 'project' : 'lead') : (stage === 'production' || stage === 'done' ? 'projects' : 'leads')} · {stageMeta.label}</p>
        </div>

        {/* Record list */}
        {records.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No {stageMeta.label.toLowerCase()} records in this range.</p>
        ) : (
          <div className="space-y-2">
            {records.map(r => (
              <button key={r.key} onClick={() => navigate(r.linkTo)}
                className="w-full text-left bg-white rounded-xl border border-slate-100 p-3.5 flex items-center justify-between gap-3 active:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 truncate">{r.stageLabel} · Updated {fmtDateTime(r.updatedAt)}</p>
                  <p className="text-[11px] text-slate-400">{r.assignedTo}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.amount > 0 && <span className="text-sm font-extrabold text-slate-800">{fmtCurrency(r.amount)}</span>}
                  <ChevronRight size={15} className="text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
