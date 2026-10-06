import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { getAllLeads } from '../../services/leadService'
import { getAllProjects } from '../../services/projectService'
import { getAllTasks } from '../../services/taskService'
import { getAllCompanyTransactions } from '../../services/companyAccountService'
import { getAllPurchaseRequests, getAllPurchaseOrders, getAllVendorBills } from '../../services/procurementService'
import type { Lead, Project, Task, CompanyTransaction, PurchaseRequest, PurchaseOrder, VendorBill } from '../../types'

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
      <p className="text-[12px] text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-extrabold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[12px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">{title}</h3>
      {children}
    </div>
  )
}

export default function ReportsScreen() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [transactions, setTransactions] = useState<CompanyTransaction[]>([])
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [l, p, t, tx, pr, po, vb] = await Promise.all([
        getAllLeads(), getAllProjects(), getAllTasks(), getAllCompanyTransactions(),
        getAllPurchaseRequests(), getAllPurchaseOrders(), getAllVendorBills(),
      ])
      setLeads(l); setProjects(p); setTasks(t); setTransactions(tx)
      setPurchaseRequests(pr); setPurchaseOrders(po); setVendorBills(vb)
      setIsLoading(false)
    }
    load()
  }, [])

  // Lead conversion
  const wonLeads = leads.filter(l => l.status === 'won')
  const lostLeads = leads.filter(l => l.status === 'lost')
  const closedLeads = wonLeads.length + lostLeads.length
  const conversionRate = closedLeads > 0 ? (wonLeads.length / closedLeads) * 100 : 0

  // Project margin (across active/closed projects with a contract value)
  const projectsWithValue = projects.filter(p => p.contractValue != null)
  const totalContractValue = projectsWithValue.reduce((sum, p) => sum + (p.contractValue ?? 0), 0)
  const totalInternalBudget = projectsWithValue.reduce((sum, p) => sum + (p.internalBudget ?? 0), 0)
  const totalMargin = totalContractValue - totalInternalBudget
  const marginPct = totalContractValue > 0 ? (totalMargin / totalContractValue) * 100 : 0

  // Cashflow — reconciles directly against Company Accounts transactions
  const totalCredits = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0)
  const totalDebits = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0)
  const netCashflow = totalCredits - totalDebits

  // Procurement
  const openPurchaseRequests = purchaseRequests.filter(pr => pr.status !== 'paid').length
  const totalPOValue = purchaseOrders.reduce((sum, po) => sum + po.amount, 0)
  const unpaidBillsValue = vendorBills.reduce((sum, vb) => sum + (vb.amount - vb.paidAmount), 0)

  // Team accountability — task completion by assignee
  const byAssignee = new Map<string, { total: number; completed: number; late: number }>()
  for (const t of tasks) {
    const name = t.assigneeName ?? 'Unassigned'
    const entry = byAssignee.get(name) ?? { total: 0, completed: 0, late: 0 }
    entry.total += 1
    if (t.status === 'completed') entry.completed += 1
    if (t.lateReason) entry.late += 1
    byAssignee.set(name, entry)
  }
  const teamRows = Array.from(byAssignee.entries())
    .map(([name, s]) => ({ name, ...s, onTimeRate: s.completed > 0 ? ((s.completed - s.late) / s.completed) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Reports</h1>
        <p className="text-xs text-slate-400">Lead conversion, project margin, cashflow, procurement, team accountability.</p>
      </div>

      {!isLoading && (
        <div className="px-4 space-y-1">
          <Section title="Lead Conversion">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Conversion Rate" value={`${conversionRate.toFixed(0)}%`} sub={`${wonLeads.length} won of ${closedLeads} closed`} />
              <StatCard label="Open Leads" value={String(leads.length - closedLeads)} sub={`${leads.length} total leads`} />
            </div>
          </Section>

          <Section title="Project Margin">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Contract Value" value={fmtCurrency(totalContractValue)} sub={`${projectsWithValue.length} projects`} />
              <StatCard label="Internal Budget" value={fmtCurrency(totalInternalBudget)} />
              <StatCard label="Total Margin" value={fmtCurrency(totalMargin)} sub={`${marginPct.toFixed(1)}%`} tone={totalMargin >= 0 ? 'good' : 'bad'} />
            </div>
          </Section>

          <Section title="Cashflow">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Total Credits" value={fmtCurrency(totalCredits)} tone="good" />
              <StatCard label="Total Debits" value={fmtCurrency(totalDebits)} tone="bad" />
              <StatCard label="Net Cashflow" value={fmtCurrency(netCashflow)} tone={netCashflow >= 0 ? 'good' : 'bad'} sub="= sum of Company Accounts transactions" />
            </div>
          </Section>

          <Section title="Procurement">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Open Purchase Requests" value={String(openPurchaseRequests)} />
              <StatCard label="Total PO Value" value={fmtCurrency(totalPOValue)} sub={`${purchaseOrders.length} orders`} />
              <StatCard label="Unpaid Vendor Bills" value={fmtCurrency(unpaidBillsValue)} />
            </div>
          </Section>

          <Section title="Team Accountability">
            <div className="space-y-2">
              {teamRows.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No tasks yet.</p>}
              {teamRows.map(row => (
                <div key={row.name} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{row.name}</p>
                    <p className="text-[12px] text-slate-400">{row.completed} of {row.total} tasks completed</p>
                  </div>
                  <span className={`text-sm font-bold ${row.onTimeRate >= 80 ? 'text-emerald-600' : row.onTimeRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {row.completed > 0 ? `${row.onTimeRate.toFixed(0)}% on time` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
