import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, UserPlus, FolderKanban, IndianRupee, CircleCheckBig } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { DateField } from '../../components/forms/DateField'
import { useCRM } from '../../context/CRMContext'
import { getAllProjects } from '../../services/projectService'
import { getManagedUsersDirectory } from '../../services/userService'
import { LEAD_STATUS_LABEL } from '../Leads/LeadStatusSheet'
import { getAllPaymentMilestones, getAllReceipts } from '../../services/financeService'
import { PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import { FILTERS, type FilterKey, dateKey, resolveRange, startOfDay, inRange as inRangeOf, rangeCaption as rangeCaptionFor } from './dashboardDateUtils'
import { buildSalesPerformance, ACTIVE_STATUSES, NEGOTIATION_STATUSES } from './salesPerformance'
import type { Lead, PaymentMilestone, Project, Receipt } from '../../types'

function fmtCurrency(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function fmtCompact(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

export default function DashboardScreen() {
  const navigate = useNavigate()
  const { leads } = useCRM()
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [salesTeamNames, setSalesTeamNames] = useState<string[]>([])

  const [filter, setFilter] = useState<FilterKey>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [detailCard, setDetailCard] = useState<'leads' | 'projects' | 'collection' | 'completion' | null>(null)

  useEffect(() => {
    (async () => {
      setIsLoading(true)
      const [p, m, r] = await Promise.all([
        getAllProjects(), getAllPaymentMilestones(), getAllReceipts(),
      ])
      setProjects(p); setMilestones(m); setReceipts(r)
      // Every User Management member gets a card, even before owning any lead.
      const team = await getManagedUsersDirectory()
      setSalesTeamNames(team.map(u => u.fullName))
      setIsLoading(false)
    })()
  }, [])

  const now = useMemo(() => new Date(), [])

  // ─── Revenue Overview date range (driven by the filter chips) ────────────
  const range = useMemo(() => resolveRange(filter, now, customFrom, customTo), [filter, now, customFrom, customTo])
  const rangeCaption = useMemo(() => rangeCaptionFor(filter, range, now, customFrom, customTo), [filter, range, now, customFrom, customTo])
  const inRange = (iso: string) => inRangeOf(iso, range)

  const revenueSeries = useMemo(() => {
    const filtered = receipts.filter(r => inRange(r.receivedDate))
    const byDay = new Map<string, number>()
    for (const r of filtered) byDay.set(dateKey(r.receivedDate), (byDay.get(dateKey(r.receivedDate)) ?? 0) + r.amount)
    const days = [...byDay.keys()].sort()
    const total = filtered.reduce((s, r) => s + r.amount, 0)
    return { points: days.map(d => ({ date: d, amount: byDay.get(d)! })), total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, filter, customFrom, customTo])

  // Chart points: every day in the window (at least the last 3 days up to the
  // range end), zero-filled, so the chart draws even when a period is empty.
  // The header total above stays the in-range figure from revenueSeries.
  const chartSeries = useMemo(() => {
    const end = range ? range.end : startOfDay(now)
    let start = range ? range.start : (() => {
      const first = receipts.reduce<string | null>((m, r) => (m === null || r.receivedDate < m ? r.receivedDate : m), null)
      return first ? startOfDay(new Date(first)) : end
    })()
    const minStart = new Date(end); minStart.setDate(minStart.getDate() - 2)
    if (start > minStart) start = minStart
    const byDay = new Map<string, number>()
    for (const r of receipts) byDay.set(dateKey(r.receivedDate), (byDay.get(dateKey(r.receivedDate)) ?? 0) + r.amount)
    const points: { date: string; amount: number }[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d)
      points.push({ date: key, amount: byDay.get(key) ?? 0 })
    }
    return points
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, range, now])

  // Trend vs the immediately-preceding period of the same length — real
  // period-over-period comparison, not a fabricated target.
  const revenueTrend = useMemo(() => {
    if (!range) return null
    const days = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1
    const prevEnd = new Date(range.start); prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1))
    const prevTotal = receipts.filter(r => inRangeOf(r.receivedDate, { start: prevStart, end: prevEnd })).reduce((s, r) => s + r.amount, 0)
    if (prevTotal === 0 && revenueSeries.total === 0) return null
    if (prevTotal === 0) return { pct: 100, up: true }
    const pct = ((revenueSeries.total - prevTotal) / prevTotal) * 100
    return { pct: Math.round(Math.abs(pct)), up: pct >= 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, range, revenueSeries.total])

  // ─── Summary cards — follow the filter chips (same "period" as Revenue Overview) ───
  const PERIOD_LABEL: Record<FilterKey, string> = {
    all: 'All', today: "Today's", yesterday: "Yesterday's", week: "This Week's", month: "This Month's", custom: 'Selected Period',
  }
  const periodLabel = PERIOD_LABEL[filter]


  // Product Sale shells (type: 'product_sale') have their own dedicated
  // Product Sales screens — excluded from every Interior Projects KPI/report
  // below so they don't inflate Interior counts. Receipts/receivables stay
  // unfiltered on purpose: Accounts still needs one combined revenue view.
  const interiorProjects = useMemo(() => projects.filter(p => p.type !== 'product_sale'), [projects])
  const activeProjects = useMemo(() => interiorProjects.filter(p => p.status === 'active'), [interiorProjects])
  const periodNewProjects = useMemo(() => interiorProjects.filter(p => inRange(p.createdAt)), [interiorProjects, range])
  // Completed = reached the Closed stage; the date is when the status history
  // recorded that move (no separate completion-date field exists).
  const closedAtOf = (p: Project) => [...(p.statusHistory ?? [])].reverse().find(h => h.stage === 'closed')?.updatedAt
  const periodCompletedProjects = useMemo(
    () => interiorProjects.filter(p => { const at = p.stage === 'closed' ? closedAtOf(p) : undefined; return !!at && inRange(at) }),
    [interiorProjects, range])

  const periodReceipts = useMemo(() => receipts.filter(r => inRange(r.receivedDate)), [receipts, range])
  const periodCollected = periodReceipts.reduce((s, r) => s + r.amount, 0)
  const allTimeCollected = useMemo(() => receipts.reduce((s, r) => s + r.amount, 0), [receipts])
  // Leads that entered the pipeline in the period and are still between Lead and
  // Negotiate — won (converted) and lost leads are not counted.
  const pipelineStatuses = [...ACTIVE_STATUSES, ...NEGOTIATION_STATUSES]
  const periodLeads = useMemo(() => (leads as Lead[]).filter(l => pipelineStatuses.includes(l.status) && inRange(l.createdAt)), [leads, range])
  const pipelineLeadCount = useMemo(() => (leads as Lead[]).filter(l => pipelineStatuses.includes(l.status)).length, [leads])

  // ─── Sales Team Performance — shared with SalesPersonDetailScreen's drill-down ──
  const salesPerformance = useMemo(() => buildSalesPerformance(leads as Lead[], interiorProjects, salesTeamNames), [leads, interiorProjects, salesTeamNames])

  // ─── Outstanding Payment — grouped by due month, project-wise detail ──────
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const outstandingByMonth = useMemo(() => {
    const groups = new Map<string, { label: string; sortKey: string; total: number; items: { milestone: PaymentMilestone; project?: Project; outstanding: number }[] }>()
    for (const m of milestones) {
      if (m.projectId && projectById.get(m.projectId)?.type === 'product_sale') continue
      const outstanding = m.amount - m.receivedAmount
      if (outstanding <= 0) continue
      if (!m.dueDate) continue
      const d = new Date(m.dueDate)
      if (isNaN(d.getTime())) continue
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      if (!groups.has(sortKey)) groups.set(sortKey, { label, sortKey, total: 0, items: [] })
      const g = groups.get(sortKey)!
      g.total += outstanding
      g.items.push({ milestone: m, project: m.projectId ? projectById.get(m.projectId) : undefined, outstanding })
    }
    // The four most recent calendar months (current one included), oldest first —
    // months with nothing outstanding still show, as ₹0.
    return [3, 2, 1, 0].map(back => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return groups.get(sortKey) ?? { label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), sortKey, total: 0, items: [] }
    })
  }, [milestones, projectById, now])

  // ─── Detail sheet behind each summary card — what actually makes up its count ──
  const leadById = useMemo(() => new Map((leads as Lead[]).map(l => [l.id, l])), [leads])
  const fmtDT = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  interface DetailItem { key: string; title: string; subtitle: string; badge?: string; badgeTint?: string; value?: string }
  function detailContent(): { title: string; items: DetailItem[] } {
    switch (detailCard) {
      case 'projects':
        return {
          title: `${periodLabel} Projects`,
          items: periodNewProjects.map(p => ({
            key: p.id, title: p.name, subtitle: p.clientName,
            badge: PROJECT_STAGE_LABEL[p.stage], badgeTint: 'bg-amber-50 text-amber-700',
            value: p.contractValue ? fmtCurrency(p.contractValue) : undefined,
          })),
        }
      case 'leads':
        return {
          title: `${periodLabel} Leads`,
          items: periodLeads.map(l => ({
            key: l.id, title: l.name, subtitle: l.ownerName,
            badge: LEAD_STATUS_LABEL[l.status], badgeTint: 'bg-indigo-50 text-indigo-700',
          })),
        }
      case 'completion':
        return {
          title: `${periodLabel} Completion`,
          items: periodCompletedProjects.map(p => ({
            key: p.id, title: p.name, subtitle: p.clientName,
            badge: 'Closed', badgeTint: 'bg-emerald-50 text-emerald-700',
            value: p.contractValue ? fmtCurrency(p.contractValue) : undefined,
          })),
        }
      case 'collection':
        return {
          title: `${periodLabel} Collection`,
          items: periodReceipts.map(r => ({
            key: r.id, title: (r.projectId && projectById.get(r.projectId)?.name) ?? 'Unknown Project',
            subtitle: `${fmtDT(r.receivedDate)}${r.reference ? ` · Ref: ${r.reference}` : ''}`,
            value: fmtCurrency(r.amount),
          })),
        }
      case null:
        return { title: '', items: [] }
    }
  }

  // ─── Tiny hand-rolled area+line chart — no charting library in this app yet ──
  function RevenueChart() {
    const points = chartSeries
    const w = 800, h = 160, pad = 8
    const max = Math.max(...points.map(p => p.amount), 1)
    const xFor = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
    const yFor = (v: number) => h - pad - (v / max) * (h - pad * 2)
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.amount)}`).join(' ')
    const area = `${line} L ${xFor(points.length - 1)} ${h - pad} L ${xFor(0)} ${h - pad} Z`
    const gridYs = [h * 0.25, h * 0.5, h * 0.75]
    const midIdx = Math.floor((points.length - 1) / 2)
    const labelIdxs = [0, midIdx, points.length - 1].filter((v, i, arr) => arr.indexOf(v) === i)
    const fmtAxisDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return (
      <div className="mt-3">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
          {gridYs.map(gy => <line key={gy} x1={0} x2={w} y1={gy} y2={gy} stroke="#F1F5F9" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="#059669" opacity={0.1} />
          <path d={line} fill="none" stroke="#059669" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          {points.length <= 31 && points.map((p, i) => <circle key={p.date} cx={xFor(i)} cy={yFor(p.amount)} r={3} fill="#059669"><title>{`${fmtAxisDate(p.date)} — ${fmtCurrency(p.amount)}`}</title></circle>)}
        </svg>
        <div className="relative h-4 mt-1 text-[12px] text-slate-400">
          {labelIdxs.map(i => {
            const pctLeft = (xFor(i) / w) * 100
            const align = i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center'
            const style = align === 'left' ? { left: 0 } : align === 'right' ? { right: 0 } : { left: `${pctLeft}%`, transform: 'translateX(-50%)' }
            return <span key={i} className="absolute" style={style}>{fmtAxisDate(points[i].date)}</span>
          })}
        </div>
      </div>
    )
  }

  function SummaryCard({ tint, bg, icon: Icon, label, big, sub, pct, fraction, onClick }: {
    tint: string; bg: string; icon: typeof UserPlus; label: string; big: string; sub: string; pct: number; fraction: string; onClick: () => void
  }) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)))
    return (
      <button onClick={onClick} className={`text-left rounded-2xl border border-white shadow-card p-4 active:opacity-90 ${bg}`}>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0 ${tint}`}>
            <Icon size={22} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-600 truncate">{label}</p>
            <p className={`text-xl font-extrabold leading-tight truncate ${tint}`}>{big}</p>
          </div>
        </div>
        <p className="text-[12px] text-slate-500 truncate mt-3">{fraction} {sub}</p>
        <div className="h-1 rounded-full bg-white/80 mt-1.5 overflow-hidden">
          <div className={`h-full rounded-full bg-current ${tint}`} style={{ width: `${clamped}%` }} />
        </div>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 lg:px-6 pt-3 pb-3 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-xl font-extrabold text-slate-800">Dashboard</h1>
      </div>

      <div className="px-4 lg:px-6 pt-4 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f.key ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
              style={filter === f.key ? { background: '#2563EB' } : {}}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-slate-400 -mt-2">{rangeCaption}</p>
        {filter === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <DateField value={customFrom} onChange={setCustomFrom} />
            <span className="text-slate-400 text-xs">to</span>
            <DateField value={customTo} onChange={setCustomTo} />
          </div>
        )}

        {/* Summary cards — labels and data follow the filter chips above */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SummaryCard tint="text-indigo-600" bg="bg-indigo-50" icon={UserPlus} label={`${periodLabel} Lead`}
            big={`${periodLeads.length} New`}
            fraction={`${periodLeads.length} / ${pipelineLeadCount}`} sub="in pipeline"
            pct={pipelineLeadCount ? (periodLeads.length / pipelineLeadCount) * 100 : 0}
            onClick={() => setDetailCard('leads')} />
          <SummaryCard tint="text-amber-600" bg="bg-amber-50" icon={FolderKanban} label={`${periodLabel} Project`}
            big={`${periodNewProjects.length} New`}
            fraction={`${periodNewProjects.length} / ${activeProjects.length}`} sub="active projects"
            pct={activeProjects.length ? (periodNewProjects.length / activeProjects.length) * 100 : 0}
            onClick={() => setDetailCard('projects')} />
          <SummaryCard tint="text-emerald-600" bg="bg-emerald-50" icon={IndianRupee} label={`${periodLabel} Collection`}
            big={fmtCompact(periodCollected)}
            fraction={`${fmtCompact(periodCollected)} / ${fmtCompact(allTimeCollected)}`} sub="all time"
            pct={allTimeCollected ? (periodCollected / allTimeCollected) * 100 : 0}
            onClick={() => setDetailCard('collection')} />
          <SummaryCard tint="text-orange-600" bg="bg-orange-50" icon={CircleCheckBig} label={`${periodLabel} Completion`}
            big={`${periodCompletedProjects.length} Done`}
            fraction={`${periodCompletedProjects.length} / ${interiorProjects.length}`} sub="projects"
            pct={interiorProjects.length ? (periodCompletedProjects.length / interiorProjects.length) * 100 : 0}
            onClick={() => setDetailCard('completion')} />
        </div>

        {/* Revenue Overview + Outstanding Payment side by side on desktop */}
        <div className="grid lg:grid-cols-3 gap-3 items-start">
          <div className="lg:col-span-2">
        {/* Revenue Overview */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-base font-bold text-slate-800">Revenue Overview</h2>
              <p className="text-[13px] text-slate-400 mt-0.5">{filter === 'all' ? 'All time' : `Last ${chartSeries.length} days`} · collected revenue</p>
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-base font-extrabold" style={{ color: '#059669' }}>{fmtCurrency(revenueSeries.total)}</p>
              {revenueTrend && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${revenueTrend.up ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                  {revenueTrend.up ? '↑' : '↓'}{revenueTrend.pct}%
                </span>
              )}
            </div>
          </div>
          <RevenueChart />
        </div>

          </div>
        {/* Outstanding Payment */}
        <div>
          <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-wide mb-2">Outstanding Payment</h2>
          <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden divide-y divide-slate-100">
            {outstandingByMonth.map(group => {
              const open = openMonth === group.sortKey
              return (
                <div key={group.sortKey}>
                  <button onClick={() => group.items.length > 0 && setOpenMonth(open ? null : group.sortKey)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="text-sm font-bold text-slate-700">{group.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold" style={{ color: '#C9772E' }}>{fmtCurrency(group.total)}</span>
                      <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-100 pt-2.5">
                      {group.items.map(item => (
                        <button key={item.milestone.id} disabled={!item.project}
                          onClick={() => item.project && navigate(`/dashboard/outstanding/${item.project.id}`)}
                          className="w-full text-left bg-slate-50 rounded-lg p-2.5 active:bg-slate-100 disabled:active:bg-slate-50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-slate-800 truncate">{item.project?.name ?? 'Unknown Project'} — {item.milestone.title}</p>
                              <p className="text-[11px] text-slate-400 truncate">{item.project?.clientName ?? ''} · {item.project?.coordinatorName ?? '—'}</p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                Value: {fmtCurrency(item.milestone.amount)}  Paid: {fmtCurrency(item.milestone.receivedAmount)}
                                {item.milestone.dueDate && `  Due: ${item.milestone.dueDate.slice(0, 10)}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs font-extrabold" style={{ color: '#C9772E' }}>{fmtCurrency(item.outstanding)}</span>
                              {item.project && <ChevronRight size={13} className="text-slate-300" />}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Sales Team Performance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Sales Team Performance</h2>
            <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-600" />Active</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-600" />Negotiation</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Production</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />Done</span>
            </div>
          </div>
          {!isLoading && salesPerformance.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8 bg-white rounded-2xl border border-slate-100">No leads yet.</p>
          )}
          <div className="grid lg:grid-cols-2 gap-3">
            {salesPerformance.map(person => {
              const totalLeads = person.active.count + person.negotiation.count + person.production.count + person.done.count
              const stages = [
                { key: 'active', label: 'Active', unit: 'Leads', color: '#2563EB', data: person.active },
                { key: 'negotiation', label: 'Negotiation', unit: 'Leads', color: '#7C3AED', data: person.negotiation },
                { key: 'production', label: 'Production', unit: 'Projects', color: '#D97706', data: person.production },
                { key: 'done', label: 'Done', unit: 'Projects', color: '#059669', data: person.done },
              ] as const
              const maxValue = Math.max(...stages.map(s => s.data.value), 0)
              const BAR_TRACK = 26
              return (
                <button key={person.name} onClick={() => navigate(`/dashboard/sales/${encodeURIComponent(person.name)}`)}
                  className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[12px] font-extrabold" style={{ background: '#0F2A4A' }}>
                        {person.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{person.name}</p>
                        <p className="text-[11px] text-slate-400">{totalLeads} total leads</p>
                      </div>
                    </div>
                    <ChevronDown size={14} className="text-slate-300 shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
                    {stages.map(s => {
                      const barHeight = s.data.value > 0 ? Math.max(8, Math.round((s.data.value / maxValue) * BAR_TRACK)) : 2
                      return (
                      <div key={s.key}>
                        <p className="text-[12px] font-bold text-center" style={{ color: s.color }}>{fmtCurrency(s.data.value)}</p>
                        <div className="flex items-end mt-1 mb-1" style={{ height: BAR_TRACK }}>
                          <div className="w-full rounded-md" style={{ height: barHeight, background: s.color }} />
                        </div>
                        <p className="text-[11px] text-slate-400 text-center">{s.label} <span className="whitespace-nowrap">({s.data.count} {s.unit})</span></p>
                      </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      <BottomSheet isOpen={!!detailCard} onClose={() => setDetailCard(null)} title={detailContent().title} height="half">
        {detailContent().items.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Nothing here yet.</p>
        )}
        <div className="space-y-2">
          {detailContent().items.map(item => (
            <div key={item.key} className="bg-slate-50 rounded-xl p-3.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>}
                {item.badge && <span className={`inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${item.badgeTint ?? 'bg-slate-100 text-slate-600'}`}>{item.badge}</span>}
              </div>
              {item.value && <span className="text-sm font-extrabold text-slate-800 shrink-0">{item.value}</span>}
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
