const LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified',
  site_visit_scheduled: 'Site Visit', site_visit_done: 'Site Visit Done',
  requirements_captured: 'Requirements', quotation_drafted: 'Quotation Drafted',
  internally_approved: 'Internally Approved', design_in_progress: 'Design In Progress',
  design_approved: 'Design Approved', sent_to_client: 'Sent To Client',
  negotiating: 'Negotiating', client_approved: 'Client Approved',
  won: 'Won', lost: 'Lost',
  advance_payment: 'Advance Payment', designing: 'Designing', execution: 'Execution', procurement: 'Procurement',
  handover_prep: 'Handover Prep', final_payment: 'Final Payment', reconciliation: 'Reconciliation',
  closed: 'Closed', active: 'Active', on_hold: 'On Hold',
  scheduled: 'Scheduled', completed: 'Completed', rescheduled: 'Rescheduled', cancelled: 'Cancelled',
  pending: 'Pending', done: 'Done', overdue: 'Overdue',
  approved: 'Approved', rejected: 'Rejected',
  awaiting_material: 'Awaiting Material',
  in_progress: 'In Progress', client_review: 'Client Review', revision_requested: 'Revision Requested',
}

const COLORS: Record<string, { bg: string; text: string }> = {
  new:                    { bg: 'bg-sky-50',      text: 'text-sky-700'     },
  contacted:              { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  qualified:              { bg: 'bg-indigo-50',   text: 'text-indigo-700'  },
  site_visit_scheduled:   { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  site_visit_done:        { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  requirements_captured:  { bg: 'bg-teal-50',     text: 'text-teal-700'    },
  quotation_drafted:      { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  internally_approved:    { bg: 'bg-indigo-50',   text: 'text-indigo-700'  },
  design_in_progress:     { bg: 'bg-purple-50',   text: 'text-purple-700'  },
  design_approved:        { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  sent_to_client:         { bg: 'bg-sky-50',      text: 'text-sky-700'     },
  negotiating:            { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  client_approved:        { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  won:                    { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  lost:                   { bg: 'bg-red-50',      text: 'text-red-700'     },
  advance_payment:        { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  designing:               { bg: 'bg-purple-50',   text: 'text-purple-700'  },
  execution:               { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  procurement:             { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  handover_prep:           { bg: 'bg-teal-50',     text: 'text-teal-700'    },
  final_payment:           { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  reconciliation:          { bg: 'bg-indigo-50',   text: 'text-indigo-700'  },
  closed:                  { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  active:                  { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  on_hold:                 { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  scheduled:              { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  completed:              { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rescheduled:            { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  cancelled:              { bg: 'bg-red-50',      text: 'text-red-700'     },
  pending:                { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  done:                   { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  overdue:                { bg: 'bg-red-50',      text: 'text-red-700'     },
  approved:               { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rejected:               { bg: 'bg-red-50',      text: 'text-red-700'     },
  awaiting_material:      { bg: 'bg-amber-50',    text: 'text-amber-700'   },
  in_progress:            { bg: 'bg-blue-50',     text: 'text-blue-700'    },
  client_review:          { bg: 'bg-violet-50',   text: 'text-violet-700'  },
  revision_requested:     { bg: 'bg-amber-50',    text: 'text-amber-700'   },
}

interface Props {
  status: string
  size?: 'xs' | 'sm' | 'md'
  // Overrides the looked-up label for this one badge without touching the
  // shared LABELS map above — needed where the same status string means
  // something with different wording in different contexts (e.g. Quotations
  // wanting "MD Approved" while Leads keep "Internally Approved" for the
  // same underlying 'internally_approved' value).
  label?: string
}

export function StatusBadge({ status, size = 'sm', label: labelOverride }: Props) {
  const colors = COLORS[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  const label  = labelOverride ?? LABELS[status] ?? status.replace(/_/g, ' ')

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
