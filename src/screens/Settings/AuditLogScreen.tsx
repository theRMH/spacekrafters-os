import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { getAllAuditLogs } from '../../services/auditLogService'
import type { AuditLog } from '../../types'

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const ACTION_LABEL: Record<string, string> = {
  expense_approved: 'Expense Approved',
  expense_rejected: 'Expense Rejected',
  leave_approved: 'Leave Approved',
  leave_rejected: 'Leave Rejected',
  quotation_rejected: 'Quotation Rejected',
}

export default function AuditLogScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getAllAuditLogs().then(l => { setLogs(l); setIsLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Audit Log</h1>
        <p className="text-xs text-slate-400">Approvals, rejections, and other tracked actions.</p>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && logs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No audit log entries yet.</p>
        )}
        {logs.map(log => (
          <div key={log.id} className="bg-white rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {ACTION_LABEL[log.action] ?? log.action}
              </span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtDateTime(log.createdAt)}</span>
            </div>
            <p className="text-sm text-slate-700">{log.description}</p>
            <p className="text-[11px] text-slate-400 mt-1">{log.createdBy} · {log.createdByRole}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
