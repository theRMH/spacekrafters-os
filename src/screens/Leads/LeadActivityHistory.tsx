import type { LeadActivityItem } from '../../types'

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Shared with LeadDetailScreen.tsx's Activity tab — one rendering of
// Lead.activity, not two. Every status change across the whole Lead
// workflow already lands in this array (via updateLead's activityNote
// param), so this is the single Activity History surface for both places.
export function LeadActivityHistory({ activity }: { activity: LeadActivityItem[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">No activity yet.</p>
  }
  return (
    <div className="space-y-3 divide-y divide-slate-100">
      {[...activity].reverse().map((entry, i) => (
        <div key={entry.id} className={i > 0 ? 'pt-3' : ''}>
          <div className="flex gap-2.5">
            <div className="flex flex-col items-center pt-1 flex-shrink-0">
              <div className="w-2 h-2 rounded-full" style={{ background: '#0F2A4A' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase mb-0.5" style={{ color: '#0F2A4A' }}>{entry.label}</p>
              {entry.note && <p className="text-xs text-slate-700 leading-relaxed">{entry.note}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{entry.updatedBy} · {fmtDateTime(entry.updatedAt)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
