import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, XCircle } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { getAllQuotations } from '../../services/quotationService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllAppointments } from '../../services/appointmentService'
import { getAllProjects } from '../../services/projectService'
import { getAllAuditLogs } from '../../services/auditLogService'
import { isMdDecisionLabel, isApprovedBeforeHistory, rescheduleDecisions } from '../../utils/approvalHistory'

export type ApprovalType = 'Quotation' | 'Designing' | 'Rescheduled Appointment'

interface HistoryRow {
  key: string
  type: ApprovalType
  name: string
  // Item-specific facts shown when the row is expanded (version, amount, package…).
  fields: [label: string, value: string][]
  accepted: boolean
  by: string
  // The approver wasn't recorded (item approved before history existed) — show "MD" only.
  byUnknown?: boolean
  at: string
  reason?: string
}

const LEGACY_NOTE = 'Approved before approval history was recorded'

const INITIAL_COUNT = 20

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Permanent record of every MD Accept / Reject across the approval types.
// Nothing here is stored separately: it is read from the records' own append-only
// histories, so completed decisions are never removed and survive refresh / re-login.
// Rows are compact (title + status badge); clicking one expands its full details.
export function ApprovalHistory({ refreshKey, types, title = 'Approval History' }: {
  refreshKey: number
  types: ApprovalType[]
  title?: string
}) {
  const { leads } = useCRM()
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [quotations, packages, versions, appointments, projects, auditLogs] = await Promise.all([
        getAllQuotations(), getAllDesignPackages(), getAllDesignVersions(), getAllAppointments(), getAllProjects(), getAllAuditLogs(),
      ])
      if (cancelled) return
      const leadFor = (id?: string) => (id ? leads.find(l => l.id === id) : undefined)
      const leadName = (id?: string, fallback?: string) => leadFor(id)?.name ?? fallback ?? id ?? '—'
      const out: HistoryRow[] = []

      for (const q of types.includes('Quotation') ? quotations : []) {
        (q.statusHistory ?? []).forEach((h, i) => {
          if (!isMdDecisionLabel(h.label)) return
          out.push({
            key: `q-${q.id}-${i}`, type: 'Quotation', name: leadName(q.leadId),
            fields: [
              ['Lead ID', leadFor(q.leadId)?.leadNumber ?? '—'],
              ['Version', String(q.version)],
              ['Amount', `₹${q.netAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ],
            accepted: h.label === 'MD approved', by: h.by, at: h.at, reason: h.note,
          })
        })
        // Approved before approval history existed: still an approved record.
        if (isApprovedBeforeHistory(q)) {
          out.push({
            key: `q-legacy-${q.id}`, type: 'Quotation', name: leadName(q.leadId),
            fields: [
              ['Lead ID', leadFor(q.leadId)?.leadNumber ?? '—'],
              ['Version', String(q.version)],
              ['Amount', `₹${q.netAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
              ['Note', `${LEGACY_NOTE} — approver and time weren't recorded; last update shown`],
            ],
            accepted: true, by: 'MD', byUnknown: true, at: q.approvedAt ?? q.updatedAt,
          })
        }
      }

      const designAudit = auditLogs
        .filter(a => a.action === 'design_status_changed')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      for (const p of types.includes('Designing') ? packages : []) {
        const link = p.projectId
          ? projects.find(pr => pr.id === p.projectId)?.name ?? p.projectId
          : leadName(p.leadId, 'Unassigned')
        ;(p.statusHistory ?? []).forEach((h, i) => {
          if (!isMdDecisionLabel(h.label)) return
          // The version that was under review = the latest one uploaded by the time of the decision.
          const reviewed = versions.filter(v => v.designPackageId === p.id && v.createdAt <= h.at).map(v => v.versionNumber)
          const fields: [string, string][] = [['Package', p.name]]
          if (reviewed.length > 0) fields.push(['Version', String(Math.max(...reviewed))])
          out.push({
            key: `d-${p.id}-${i}`, type: 'Designing', name: link, fields,
            accepted: h.label === 'MD approved', by: h.by, at: h.at, reason: h.note,
          })
        })
        if (isApprovedBeforeHistory(p)) {
          // The activity log recorded who moved this design to its approved
          // status, and when — use the MD-approval step if present, otherwise the
          // earliest approved status.
          const approvedStatuses = ['internally_approved', 'sent_to_client', 'client_approved', 'revision_requested']
          const mine = designAudit.filter(a => approvedStatuses.some(s => a.description === `Design package "${p.name}" status changed to "${s}".`))
          const entry = mine.find(a => a.description.includes('"internally_approved"')) ?? mine[0]
          const fields: [string, string][] = [['Package', p.name]]
          const reviewed = versions.filter(v => v.designPackageId === p.id).map(v => v.versionNumber)
          if (reviewed.length > 0) fields.push(['Version', String(Math.max(...reviewed))])
          fields.push(['Note', entry ? `${LEGACY_NOTE} — approver and time taken from the activity log` : `${LEGACY_NOTE} — approver and time weren't recorded; last update shown`])
          out.push({
            key: `d-legacy-${p.id}`, type: 'Designing', name: link, fields,
            accepted: true, by: entry?.createdBy ?? 'MD', byUnknown: !entry, at: entry?.createdAt ?? p.updatedAt,
          })
        }
      }

      for (const a of types.includes('Rescheduled Appointment') ? appointments : []) {
        const name = leadName(a.leadId, a.clientName)
        rescheduleDecisions(a).forEach((d, i) => {
          out.push({
            key: `a-${a.id}-${i}`, type: 'Rescheduled Appointment', name,
            fields: d.reason ? [['Reschedule reason', d.reason]] : [],
            accepted: d.decision === 'accepted', by: d.by, at: d.at, reason: d.note,
          })
        })
      }

      out.sort((a, b) => b.at.localeCompare(a.at))
      setRows(out)
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
    // leads is only used for display names; refetching on every leads refresh isn't needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, leads.length, types.join('|')])

  // Switching category starts from the short, collapsed list again.
  useEffect(() => { setShowAll(false); setExpanded(new Set()) }, [types.join('|')])

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const visible = showAll ? rows : rows.slice(0, INITIAL_COUNT)

  return (
    <section className="space-y-3">
      <h2 className="text-base font-extrabold text-slate-800">{title}</h2>

      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">No approvals or rejections recorded yet.</p>
      )}

      <div className="space-y-2">
        {visible.map(r => {
          const open = expanded.has(r.key)
          const isReschedule = r.type === 'Rescheduled Appointment'
          const statusLabel = r.accepted ? (isReschedule ? 'Accepted' : 'Approved') : 'Rejected'
          const verb = r.accepted ? (isReschedule ? 'Accepted by' : 'Approved by') : 'Rejected by'
          const line = 'text-xs text-slate-600'
          return (
            <div key={r.key} className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
              <button type="button" onClick={() => toggle(r.key)} aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-slate-50">
                <span className="text-sm font-bold text-slate-800 min-w-0 truncate">{r.type} – {r.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    r.accepted ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {r.accepted ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {statusLabel}
                  </span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 pt-1 space-y-1 border-t border-slate-100">
                  {r.fields.map(([label, value]) => (
                    <p key={label} className={`${line} ${label === 'Lead ID' ? 'mt-2' : ''}`}>{label}: <span className="font-semibold">{value}</span></p>
                  ))}
                  <p className={line}>{verb}: <span className="font-semibold">{r.byUnknown ? 'MD' : `${r.by} (MD)`}</span></p>
                  <p className={line}>Date &amp; Time: <span className="font-semibold">{fmtDateTime(r.at)}</span></p>
                  <p className={line}>Status: <span className={`font-semibold ${r.accepted ? 'text-emerald-700' : 'text-red-700'}`}>{statusLabel}</span></p>
                  {r.reason && <p className={line}>{r.accepted ? 'MD notes' : 'Reason'}: <span className="font-semibold">{r.reason}</span></p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!showAll && rows.length > INITIAL_COUNT && (
        <button onClick={() => setShowAll(true)}
          className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
          Show all ({rows.length})
        </button>
      )}
    </section>
  )
}
