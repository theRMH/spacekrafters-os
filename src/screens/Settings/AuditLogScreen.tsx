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
  expense_paid: 'Expense Paid',
  expense_closed: 'Expense Closed',
  leave_approved: 'Leave Approved',
  leave_rejected: 'Leave Rejected',
  quotation_rejected: 'Quotation Rejected',
  quotation_deleted: 'Quotation Deleted',
  requirement_deleted: 'Requirement Deleted',
  appointment_deleted: 'Appointment Deleted',
  site_visit_deleted: 'Site Visit Deleted',
  project_created: 'Project Created',
  project_closed: 'Project Closed',
  project_deleted: 'Project Deleted',
  design_status_changed: 'Design Status Changed',
  design_package_edited: 'Design Package Edited',
  design_package_deleted: 'Design Package Deleted',
  expense_request_edited: 'Expense Request Edited',
  payable_edited: 'Payable Edited',
  purchase_request_edited: 'Purchase Request Edited',
  po_edited: 'Purchase Order Edited',
  diary_entry_edited: 'Diary Entry Edited',
  diary_entry_deleted: 'Diary Entry Deleted',
  task_edited: 'Task Edited',
  vendor_bill_edited: 'Vendor Bill Edited',
  payment_milestone_edited: 'Payment Milestone Edited',
  task_completed: 'Task Completed',
  task_completed_late: 'Task Completed Late',
  user_deleted: 'User Deleted',
  purchase_request_created: 'Purchase Request Created',
  purchase_request_approved: 'Purchase Request Approved',
  po_raised: 'Purchase Order Raised',
  goods_received: 'Goods Received',
  vendor_bill_entered: 'Vendor Bill Entered',
  vendor_created: 'Vendor Created',
  vendor_updated: 'Vendor Updated',
  vendor_deleted: 'Vendor Deleted',
  client_created: 'Client Created',
  client_updated: 'Client Updated',
  client_deleted: 'Client Deleted',
  company_account_created: 'Company Account Created',
  company_account_updated: 'Company Account Updated',
  company_account_deleted: 'Company Account Deleted',
  purchase_request_deleted: 'Purchase Request Deleted',
  payable_payment_recorded: 'Payable Payment Recorded',
  receipt_recorded: 'Receipt Recorded',
  statement_import_posted: 'Statement Import Posted',
  personal_account_deleted: 'Personal Account Deleted',
  personal_transaction_deleted: 'Personal Transaction Deleted',
  personal_category_deleted: 'Personal Category Deleted',
  personal_subcategory_deleted: 'Personal Subcategory Deleted',
  personal_commitment_deleted: 'Personal Commitment Deleted',
  personal_plan_deleted: 'Personal Plan Deleted',
  personal_investment_deleted: 'Personal Investment Deleted',
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
              <span className="text-[12px] text-slate-400 whitespace-nowrap">{fmtDateTime(log.createdAt)}</span>
            </div>
            <p className="text-sm text-slate-700">{log.description}</p>
            <p className="text-[12px] text-slate-400 mt-1">{log.createdBy} · {log.createdByRole}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
