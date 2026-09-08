const LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified',
  site_visit_scheduled: 'Site Visit', requirements_captured: 'Requirements', won: 'Won', lost: 'Lost',
  scheduled: 'Scheduled', completed: 'Completed', rescheduled: 'Rescheduled', cancelled: 'Cancelled',
  pending: 'Pending', done: 'Done', overdue: 'Overdue',
  approved: 'Approved', rejected: 'Rejected',
}

const COLORS: Record<string, { bg: string; text: string }> = {
  new:                    { bg: 'bg-sky-50',      text: 'text-sky-700'     },
  contacted:              { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  qualified:              { bg: 'bg-indigo-50',   text: 'text-indigo-700'  },
  site_visit_scheduled:   { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  requirements_captured:  { bg: 'bg-teal-50',     text: 'text-teal-700'    },
  won:                    { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  lost:                   { bg: 'bg-red-50',      text: 'text-red-700'     },
  scheduled:              { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  completed:              { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rescheduled:            { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  cancelled:              { bg: 'bg-red-50',      text: 'text-red-700'     },
  pending:                { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  done:                   { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  overdue:                { bg: 'bg-red-50',      text: 'text-red-700'     },
  approved:               { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rejected:               { bg: 'bg-red-50',      text: 'text-red-700'     },
}

interface Props {
  status: string
  size?: 'xs' | 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const colors = COLORS[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  const label  = LABELS[status] ?? status.replace(/_/g, ' ')

  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : size === 'md'
    ? 'text-xs px-3 py-1'
    : 'text-[11px] px-2 py-0.5'

  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-full capitalize ${colors.bg} ${colors.text} ${sizeClass}`}>
      {label}
    </span>
  )
}
