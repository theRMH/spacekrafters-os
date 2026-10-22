import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Download, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_DIVISION_LABEL, BUSINESS_CATEGORY_LABEL, BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllProjects, upsertProject, deleteProject } from '../../services/projectService'
import { getAllQuotations, upsertQuotation } from '../../services/quotationService'
import { getAllPaymentMilestones, upsertPaymentMilestone, getAllPayables, addReceipt } from '../../services/financeService'
import { getAllVendorBills, getAllPurchaseOrders } from '../../services/procurementService'
import { getAllDesignPackages, upsertDesignPackage } from '../../services/designService'
import { getAllExpenseRequests } from '../../services/expenseService'
import { addAuditLog } from '../../services/auditLogService'
import { getAllClients, upsertClient } from '../../services/clientService'
import { ROLE_LABELS } from '../../data/permissions'
import { ProjectStatusSheet, ROLE_FOR_PROJECT_STAGE, PROJECT_STAGE_LABEL, PROJECT_STAGE_ORDER } from '../ProjectWorkspace/ProjectStatusSheet'
import type { ManagedUser, Project, ProjectStage, StatusHistoryItem, Quotation, PaymentMilestone, Payable, VendorBill, PurchaseOrder, ExpenseRequest, AuditLog, Client, Receipt } from '../../types'

// Built from PROJECT_STAGE_ORDER (ProjectStatusSheet.tsx) — the single source of
// truth for stage sequence — so reordering that one array reorders this
// dropdown too.
const STAGE_OPTIONS: { value: ProjectStage; label: string }[] =
  PROJECT_STAGE_ORDER.map(value => ({ value, label: PROJECT_STAGE_LABEL[value] }))

const STATUS_OPTIONS: { value: Project['status']; label: string }[] = [
  { value: 'active',    label: 'Active' },
  { value: 'on_hold',   label: 'On Hold' },
  { value: 'closed',    label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyProject(): Project {
  return {
    id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    leadId: undefined,
    quotationId: undefined,
    coordinatorId: '',
    clientName: '',
    clientPhone: '',
    coordinatorName: '',
    stage: 'advance_payment',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

type DateRange = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'
const DATE_CHIPS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
]

type SortKey = 'default' | 'newest' | 'oldest' | 'name' | 'value' | 'handover'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Sort: Default' },
  { value: 'newest', label: 'Sort: Newest first' },
  { value: 'oldest', label: 'Sort: Oldest first' },
  { value: 'name', label: 'Sort: Name A–Z' },
  { value: 'value', label: 'Sort: Value high–low' },
  { value: 'handover', label: 'Sort: Handover soonest' },
]

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function inDateRange(createdAt: string, range: DateRange, from: string, to: string): boolean {
  if (range === 'all') return true
  const created = new Date(createdAt)
  if (isNaN(created.getTime())) return false
  const today = startOfDay(new Date())
  const day = startOfDay(created)
  if (range === 'today') return day.getTime() === today.getTime()
  if (range === 'yesterday') return day.getTime() === today.getTime() - 86400000
  if (range === 'week') {
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    return day >= monday
  }
  if (range === 'month') return day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth()
  if (from && day < startOfDay(new Date(from))) return false
  if (to && day > startOfDay(new Date(to))) return false
  return true
}

function fmtShort(val?: string): string {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Days until handover (negative = overdue). Closed/cancelled projects have no due state.
function dueInfo(p: Project): { text: string; tone: 'ok' | 'warn' | 'late' } | null {
  if (!p.expectedHandoverDate || p.stage === 'closed' || p.status === 'closed' || p.status === 'cancelled') return null
  const due = new Date(p.expectedHandoverDate)
  if (isNaN(due.getTime())) return null
  const diff = Math.round((startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86400000)
  if (diff === 0) return { text: 'Due today', tone: 'warn' }
  if (diff < 0) return { text: `${-diff}d overdue`, tone: 'late' }
  return { text: `${diff}d left`, tone: 'ok' }
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-[50px] h-[50px] flex-shrink-0">
      <svg width="50" height="50" viewBox="0 0 50 50" className="-rotate-90">
        <circle cx="25" cy="25" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="25" cy="25" r={r} fill="none" stroke={pct === 100 ? '#16a34a' : '#f59e0b'} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">{pct}%</span>
    </div>
  )
}

function csvCell(v: string | number | undefined): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function ProjectsScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { leads } = useCRM()
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '' })
  const [coordinators, setCoordinators] = useState<ManagedUser[]>([])
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Project>(emptyProject())
  const [selected, setSelected] = useState<Project | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [quotationsLoaded, setQuotationsLoaded] = useState(false)
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([])
  const [closeConfirm, setCloseConfirm] = useState<{ show: boolean; toSave: Project | null; items: string[] }>({ show: false, toSave: null, items: [] })

  useEffect(() => {
    getAllProjects().then(setProjects)
    getManagedUsersDirectory().then(setCoordinators)
    getAllQuotations().then(qs => { setQuotations(qs); setQuotationsLoaded(true) })
    getAllPaymentMilestones().then(setMilestones)
    getAllPayables().then(setPayables)
    getAllVendorBills().then(setVendorBills)
    getAllPurchaseOrders().then(setPurchaseOrders)
    getAllExpenseRequests().then(setExpenseRequests)
    getAllClients().then(setClients)
  }, [])

  useEffect(() => {
    // Wait for quotations to load before consuming ?leadId — onLeadChange looks
    // up the lead's approved quotation to auto-fill Contract Value, and running
    // it while `quotations` is still the initial [] silently skips that fill
    // (the field is then left for someone to fill in by hand, e.g. a bare "1").
    if (!quotationsLoaded) return
    const leadId = searchParams.get('leadId')
    if (leadId) {
      setForm(emptyProject())
      onLeadChange(leadId)
      setShowForm(true)
      setSearchParams(params => { params.delete('leadId'); return params }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, quotationsLoaded])

  // Product Sale shells (type: 'product_sale') and their source FGD leads have
  // their own dedicated screens at /product-sales — kept out of the Interior
  // Projects list/conversion flow so the two workflows never mix.
  const eligibleLeads = leads.filter(l => l.status === 'won' && l.businessDivision !== 'fgd')

  function openCreate() {
    setForm(emptyProject())
    setShowNewClient(false)
    setShowForm(true)
  }

  function onLeadChange(leadId: string) {
    const lead = leads.find(l => l.id === leadId)
    const approvedQuotation = quotations.find(q => q.leadId === leadId && q.status === 'client_approved')
    const matchedClient = lead ? clients.find(c => c.phone === lead.phone) : undefined
    setForm(f => ({
      ...f,
      leadId: leadId || undefined,
      clientName: lead?.name ?? f.clientName,
      clientPhone: lead?.phone ?? f.clientPhone,
      clientId: matchedClient?.id ?? f.clientId,
      quotationId: approvedQuotation && !f.contractValue ? approvedQuotation.id : f.quotationId,
      contractValue: approvedQuotation && !f.contractValue ? approvedQuotation.netAmount : f.contractValue,
      coordinatorId: lead?.ownerId ?? f.coordinatorId,
      coordinatorName: lead?.ownerName ?? f.coordinatorName,
    }))
  }

  function onCoordinatorChange(coordinatorId: string) {
    const coordinator = coordinators.find(c => c.id === coordinatorId)
    setForm(f => ({ ...f, coordinatorId, coordinatorName: coordinator?.fullName ?? '' }))
  }

  function outstandingItemsFor(projectId: string): string[] {
    const unpaidMilestones = milestones.filter(m => m.projectId === projectId && m.status !== 'received').length
    const projectPoIds = new Set(purchaseOrders.filter(po => po.projectId === projectId).map(po => po.id))
    const projectBillIds = new Set(vendorBills.filter(b => b.purchaseOrderId && projectPoIds.has(b.purchaseOrderId)).map(b => b.id))
    const unpaidPayables = payables.filter(p => p.vendorBillId && projectBillIds.has(p.vendorBillId) && p.status !== 'paid').length
    const unpaidExpenses = expenseRequests.filter(e => e.projectId === projectId && e.status === 'approved').length
    const items: string[] = []
    if (unpaidMilestones > 0) items.push(`${unpaidMilestones} unpaid milestone${unpaidMilestones > 1 ? 's' : ''}`)
    if (unpaidPayables > 0) items.push(`${unpaidPayables} unpaid payable${unpaidPayables > 1 ? 's' : ''}`)
    if (unpaidExpenses > 0) items.push(`${unpaidExpenses} approved-but-unpaid expense request${unpaidExpenses > 1 ? 's' : ''}`)
    return items
  }

  async function handleSave() {
    if (!form.name.trim() || !form.coordinatorId) {
      setSnack({ open: true, msg: 'Project name and coordinator are required.', type: 'error' })
      return
    }
    if (showNewClient) {
      if (!newClient.name.trim() || !newClient.phone.trim()) {
        setSnack({ open: true, msg: 'New client name and phone are required.', type: 'error' })
        return
      }
    } else if (!form.clientName.trim()) {
      setSnack({ open: true, msg: 'Client name is required.', type: 'error' })
      return
    }
    let clientId = form.clientId
    let clientName = form.clientName
    let clientPhone = form.clientPhone
    if (showNewClient) {
      const client: Client = {
        id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: newClient.name.trim(),
        phone: newClient.phone.trim(),
        email: newClient.email.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const clientResult = await upsertClient(client)
      if (!clientResult.ok) {
        setSnack({ open: true, msg: clientResult.error ?? 'Failed to create client.', type: 'error' })
        return
      }
      setClients(prev => [client, ...prev])
      clientId = client.id
      clientName = client.name
      clientPhone = client.phone
    }
    const existing = projects.find(p => p.id === form.id)
    // Record the stage picked here (on create, or when edited) in the same
    // status history the Update Status workflow writes to.
    const stageChanged = !existing || existing.stage !== form.stage
    const historyEntry: StatusHistoryItem | null = stageChanged && user ? {
      stage: form.stage,
      note: existing
        ? `Stage changed from ${PROJECT_STAGE_LABEL[existing.stage]} to ${PROJECT_STAGE_LABEL[form.stage]}`
        : `Project created at ${PROJECT_STAGE_LABEL[form.stage]}`,
      updatedBy: user.name,
      updatedRole: user.role,
      updatedAt: new Date().toISOString(),
    } : null
    const formToSave: Project = {
      ...form, clientId, clientName, clientPhone,
      statusHistory: historyEntry ? [...(form.statusHistory ?? []), historyEntry] : form.statusHistory,
    }
    const closingNow = formToSave.status === 'closed' && existing?.status !== 'closed'
    if (closingNow) {
      const items = outstandingItemsFor(formToSave.id)
      if (items.length > 0) {
        setCloseConfirm({ show: true, toSave: { ...formToSave, updatedAt: new Date().toISOString() }, items })
        return
      }
    }
    await commitSave({ ...formToSave, updatedAt: new Date().toISOString() }, !existing, closingNow)
    setShowNewClient(false)
  }

  async function commitSave(toSave: Project, isNew: boolean, closingNow: boolean) {
    const result = await upsertProject(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save project.', type: 'error' })
      return
    }
    setProjects(prev => {
      const exists = prev.some(p => p.id === toSave.id)
      return exists ? prev.map(p => (p.id === toSave.id ? toSave : p)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Project saved.', type: 'success' })

    if (isNew && toSave.leadId) {
      const leadPackages = (await getAllDesignPackages()).filter(pkg => pkg.leadId === toSave.leadId && !pkg.projectId)
      for (const pkg of leadPackages) {
        await upsertDesignPackage({ ...pkg, projectId: toSave.id, updatedAt: new Date().toISOString() })
      }
    }

    if (isNew && toSave.quotationId) {
      const quotation = quotations.find(q => q.id === toSave.quotationId)
      if (quotation) {
        await upsertQuotation({ ...quotation, projectId: toSave.id })
        const milestone: PaymentMilestone = {
          id: `mst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          projectId: toSave.id,
          title: 'Full Contract Value',
          amount: quotation.netAmount,
          status: 'pending',
          receivedAmount: 0,
          receivedDates: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const lead = toSave.leadId ? leads.find(l => l.id === toSave.leadId) : undefined
        if (lead?.advancePaymentAmount) {
          milestone.receivedAmount = lead.advancePaymentAmount
          milestone.receivedDates = [new Date().toISOString()]
          milestone.status = lead.advancePaymentAmount >= milestone.amount ? 'received' : 'partial'
        }
        await upsertPaymentMilestone(milestone)

        if (lead?.advancePaymentAmount) {
          const receipt: Receipt = {
            id: `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            projectId: toSave.id,
            milestoneId: milestone.id,
            amount: lead.advancePaymentAmount,
            receivedDate: new Date().toISOString(),
            reference: lead.advancePaymentRef,
            notes: 'Advance payment carried over from Lead.',
            createdAt: new Date().toISOString(),
          }
          await addReceipt(receipt)
          const projectWithAdvance = { ...toSave, advanceReceived: (toSave.advanceReceived ?? 0) + lead.advancePaymentAmount }
          await upsertProject(projectWithAdvance)
          setProjects(prev => prev.map(p => (p.id === toSave.id ? projectWithAdvance : p)))
        }
      }
    }

    if (user && (isNew || closingNow)) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: toSave.id,
        action: isNew ? 'project_created' : 'project_closed',
        description: isNew ? `Project "${toSave.name}" created.` : `Project "${toSave.name}" closed.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
  }

  async function handleConfirmClose() {
    if (!closeConfirm.toSave) return
    const existing = projects.find(p => p.id === closeConfirm.toSave!.id)
    await commitSave(closeConfirm.toSave, !existing, true)
    setCloseConfirm({ show: false, toSave: null, items: [] })
  }

  async function handleDelete() {
    if (!selected) return
    const result = await deleteProject(selected.id)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to delete project.', type: 'error' })
      return
    }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: selected.id,
        action: 'project_deleted',
        description: `Project "${selected.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setProjects(prev => prev.filter(p => p.id !== selected.id))
    setShowDelete(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Project deleted.', type: 'success' })
  }

  // Sidebar "Project Sort": ?stage=<ProjectStage> or ?stage=active (not closed).
  const stageParam = searchParams.get('stage')
  const stageFilter = stageParam === 'active' || STAGE_OPTIONS.some(o => o.value === stageParam) ? stageParam : null
  // Search + date filters first; stage chip counts come from this set so each
  // chip shows how many projects it would list right now.
  const baseList = projects.filter(p => {
    if (p.type === 'product_sale') return false
    if (!inDateRange(p.createdAt, dateRange, dateFrom, dateTo)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q)
  })

  const stageChips = [
    { value: 'all', label: 'All', count: baseList.length },
    { value: 'active', label: 'Active', count: baseList.filter(p => p.stage !== 'closed').length },
    ...STAGE_OPTIONS.map(o => ({ ...o, count: baseList.filter(p => p.stage === o.value).length })),
  ]

  const filtered = baseList
    .filter(p => {
      if (stageFilter === 'active') return p.stage !== 'closed'
      if (stageFilter) return p.stage === stageFilter
      return true
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'newest': return b.createdAt.localeCompare(a.createdAt)
        case 'oldest': return a.createdAt.localeCompare(b.createdAt)
        case 'name': return a.name.localeCompare(b.name)
        case 'value': return (b.contractValue ?? 0) - (a.contractValue ?? 0)
        case 'handover': return (a.expectedHandoverDate ?? '9999').localeCompare(b.expectedHandoverDate ?? '9999')
        default: return 0
      }
    })

  function exportCsv() {
    const header = ['Project', 'Client', 'Stage', 'Status', 'Contract Value', 'Created', 'Expected Handover']
    const rows = filtered.map(p => [
      p.name, p.clientName, PROJECT_STAGE_LABEL[p.stage], p.status, p.contractValue, fmtShort(p.createdAt), fmtShort(p.expectedHandoverDate),
    ])
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'projects.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const canDelete = user?.role === 'owner'
  const isEditingExisting = projects.some(p => p.id === form.id)

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24">
      <AppHeader />

      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-200 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-3">Projects</h1>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search projects…" className="flex-1" />
          <button onClick={exportCsv} aria-label="Export projects" disabled={filtered.length === 0}
            className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 active:bg-slate-50 disabled:opacity-40 flex-shrink-0">
            <Download size={17} />
          </button>
          <PermissionGate permission="create_project">
            <button onClick={openCreate} aria-label="New project"
              className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-fab active:bg-indigo-700 flex-shrink-0">
              <Plus size={18} className="text-white" />
            </button>
          </PermissionGate>
        </div>
        <FilterChips
          chips={stageChips}
          active={stageFilter ?? 'all'}
          onChange={v => setSearchParams(v === 'all' ? {} : { stage: v }, { replace: true })}
          className="mt-3"
        />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide">
            {DATE_CHIPS.map(c => (
              <button key={c.value} onClick={() => setDateRange(c.value)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold ${
                  dateRange === c.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} aria-label="Sort projects"
            className="flex-shrink-0 bg-slate-100 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 focus:outline-none max-w-[150px]">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {dateRange === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <DateField value={dateFrom} onChange={setDateFrom} />
            <DateField value={dateTo} min={dateFrom || undefined} onChange={setDateTo} />
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No projects found.</p>
        ) : (
          filtered.map(project => {
            const idx = PROJECT_STAGE_ORDER.indexOf(project.stage)
            const pct = Math.round(((idx + 1) / PROJECT_STAGE_ORDER.length) * 100)
            const due = dueInfo(project)
            const dueTone = due?.tone === 'late' ? 'text-red-600' : due?.tone === 'warn' ? 'text-orange-600' : 'text-emerald-600'
            return (
              <button key={project.id} onClick={() => setSelected(project)}
                className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50 flex items-center gap-3">
                <ProgressRing pct={pct} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{project.name}</p>
                  <p className="text-xs text-slate-500 truncate">{project.clientName}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <StatusBadge status={project.stage} />
                    {project.status !== 'active' && <StatusBadge status={project.status} />}
                    {due && <span className={`text-[11px] font-semibold ${dueTone}`}>{due.text}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-400">
                    <span>Created {fmtShort(project.createdAt)}</span>
                    <span className="flex items-center gap-3">
                      {project.contractValue != null && <span className="font-semibold text-slate-600">{fmtCurrency(project.contractValue)}</span>}
                      {project.expectedHandoverDate && <span>Due {fmtShort(project.expectedHandoverDate)}</span>}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
              </button>
            )
          })
        )}
      </div>

      {/* Create/Edit Project */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditingExisting ? 'Edit Project' : 'New Project'}>
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Project Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="SKS-1024" />
          </div>
          <div>
            <label className={label}>From Won Lead (optional)</label>
            <SearchableSelect
              value={form.leadId ?? ''} onChange={onLeadChange}
              options={eligibleLeads.map(l => ({ value: l.id, label: l.name }))}
              placeholder="— None —" searchPlaceholder="Search leads…"
            />
          </div>
          <div>
            <label className={label}>Client</label>
            <SearchableSelect
              value={showNewClient ? '__new__' : form.clientId ?? ''}
              onChange={v => {
                if (v === '__new__') {
                  setShowNewClient(true)
                  setNewClient({ name: form.clientName, phone: form.clientPhone, email: '' })
                } else {
                  setShowNewClient(false)
                  const client = clients.find(c => c.id === v)
                  setForm(f => ({ ...f, clientId: client?.id, clientName: client?.name ?? f.clientName, clientPhone: client?.phone ?? f.clientPhone }))
                }
              }}
              options={clients.map(c => ({ value: c.id, label: `${c.name} (${c.phone})`, sublabel: c.phone }))}
              searchPlaceholder="Search by name or phone…"
              extraOption={{ value: '__new__', label: '+ New Client' }}
            />
          </div>
          {showNewClient ? (
            <>
              <div>
                <label className={label}>New Client Name *</label>
                <input className={inp} value={newClient.name} onChange={e => setNewClient(nc => ({ ...nc, name: e.target.value }))} />
              </div>
              <div>
                <label className={label}>New Client Phone *</label>
                <input className={inp} value={newClient.phone} onChange={e => setNewClient(nc => ({ ...nc, phone: e.target.value }))} />
              </div>
              <div>
                <label className={label}>New Client Email</label>
                <input className={inp} value={newClient.email} onChange={e => setNewClient(nc => ({ ...nc, email: e.target.value }))} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={label}>Client Name *</label>
                <input className={inp} value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Client Phone</label>
                <input className={inp} value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} />
              </div>
            </>
          )}
          <div>
            <label className={label}>Coordinator *</label>
            <SearchableSelect
              value={form.coordinatorId} onChange={onCoordinatorChange}
              options={coordinators.map(c => ({ value: c.id, label: c.fullName }))}
              searchPlaceholder="Search coordinators…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Stage</label>
              <SearchableSelect
                value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v as ProjectStage }))}
                options={STAGE_OPTIONS}
              />
            </div>
            <div>
              <label className={label}>Status</label>
              <SearchableSelect
                value={form.status} onChange={v => setForm(f => ({ ...f, status: v as Project['status'] }))}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Contract Value</label>
              <input type="number" className={inp} value={form.contractValue ?? ''}
                onChange={e => setForm(f => ({ ...f, contractValue: e.target.value === '' ? undefined : Number(e.target.value) }))} />
            </div>
            <div>
              <label className={label}>Internal Budget</label>
              <input type="number" className={inp} value={form.internalBudget ?? ''}
                onChange={e => setForm(f => ({ ...f, internalBudget: e.target.value === '' ? undefined : Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start Date</label>
              <DateField value={form.startDate ?? ''} min={isEditingExisting ? undefined : todayStr()}
                onChange={v => setForm(f => ({ ...f, startDate: v || undefined }))} />
            </div>
            <div>
              <label className={label}>Expected Handover</label>
              <DateField value={form.expectedHandoverDate ?? ''}
                min={isEditingExisting ? undefined : (form.startDate || todayStr())}
                onChange={v => setForm(f => ({ ...f, expectedHandoverDate: v || undefined }))} />
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Project
          </button>
        </div>
      </BottomSheet>

      {/* Project Detail */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.status} />
              <StatusBadge status={selected.stage} />
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              {(() => {
                const sourceLead = selected.leadId ? leads.find(l => l.id === selected.leadId) : undefined
                if (!sourceLead?.businessDivision) return null
                const label = BUSINESS_DIVISION_LABEL[sourceLead.businessDivision]
                  + (sourceLead.businessCategory ? ` (${BUSINESS_CATEGORY_LABEL[sourceLead.businessCategory]})` : '')
                  + (sourceLead.businessBrand ? ` (${BUSINESS_BRAND_LABEL[sourceLead.businessBrand]})` : '')
                return <div className="flex justify-between"><span className="text-slate-500">Company / Brand</span><span className="font-semibold text-slate-800">{label}</span></div>
              })()}
              <div className="flex justify-between"><span className="text-slate-500">Client</span><span className="font-semibold text-slate-800">{selected.clientName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-800">{selected.clientPhone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Coordinator</span><span className="font-semibold text-slate-800">{selected.coordinatorName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Contract Value</span><span className="font-semibold text-slate-800">{fmtCurrency(selected.contractValue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Internal Budget</span><span className="font-semibold text-slate-800">{fmtCurrency(selected.internalBudget)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Advance Received</span><span className="font-semibold text-slate-800">{fmtCurrency(selected.advanceReceived)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{fmtDate(selected.startDate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Expected Handover</span><span className="font-semibold text-slate-800">{fmtDate(selected.expectedHandoverDate)}</span></div>
            </div>
            {selected.status !== 'closed' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Current Stage</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{PROJECT_STAGE_LABEL[selected.stage]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Responsible: {selected.assignedToName ?? (ROLE_FOR_PROJECT_STAGE[selected.stage] ? ROLE_LABELS[ROLE_FOR_PROJECT_STAGE[selected.stage]!] : '—')}
                  </p>
                </div>
                <button onClick={() => setShowStatusSheet(true)}
                  className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90"
                  style={{ background: '#0F2A4A' }}>
                  Update Status →
                </button>
              </div>
            )}
            <button onClick={() => navigate(`/projects/${selected.id}`)}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
              Open Project Workspace
            </button>
            <PermissionGate permission="edit_project">
              <button onClick={() => { setForm(selected); setShowNewClient(false); setSelected(null); setShowForm(true) }}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold active:bg-slate-50">
                Edit
              </button>
            </PermissionGate>
            {canDelete && (
              <button onClick={() => setShowDelete(true)}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold active:bg-red-50 flex items-center justify-center gap-2">
                <Trash2 size={15} /> Delete Project
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {selected && (
        <ProjectStatusSheet
          isOpen={showStatusSheet}
          onClose={() => setShowStatusSheet(false)}
          project={selected}
          onDone={async (msg) => {
            const updated = await getAllProjects()
            setProjects(updated)
            setSelected(updated.find(p => p.id === selected.id) ?? null)
            setSnack({ open: true, msg, type: 'success' })
          }}
        />
      )}

      <Dialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Project"
        message="This permanently deletes the project. This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}>
      </Dialog>

      <Dialog
        isOpen={closeConfirm.show}
        onClose={() => setCloseConfirm({ show: false, toSave: null, items: [] })}
        title="Close Project With Outstanding Items?"
        message="This project has unresolved financial items:"
        variant="danger"
        confirmLabel="Close Anyway"
        cancelLabel="Cancel"
        onConfirm={handleConfirmClose}>
        <ul className="list-disc list-inside text-sm text-slate-600 mt-2">
          {closeConfirm.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </Dialog>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
