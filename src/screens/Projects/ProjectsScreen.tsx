import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
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

  const eligibleLeads = leads.filter(l => l.status === 'won')

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

  const filtered = projects.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q)
  })

  const canDelete = user?.role === 'owner'
  const isEditingExisting = projects.some(p => p.id === form.id)

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24">
      <AppHeader />

      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-200 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-3">Projects</h1>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search projects…" className="flex-1" />
          <PermissionGate permission="create_project">
            <button onClick={openCreate} aria-label="New project"
              className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-fab active:bg-indigo-700 flex-shrink-0">
              <Plus size={18} className="text-white" />
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No projects yet.</p>
        ) : (
          filtered.map(project => (
            <button key={project.id} onClick={() => setSelected(project)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{project.name}</span>
                <StatusBadge status={project.status} />
              </div>
              <p className="text-xs text-slate-500 mb-2">{project.clientName}</p>
              <div className="flex items-center justify-between">
                <StatusBadge status={project.stage} />
                <span className="text-xs font-semibold text-slate-600">{fmtCurrency(project.contractValue)}</span>
              </div>
            </button>
          ))
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
            <select className={inp} value={form.leadId ?? ''} onChange={e => onLeadChange(e.target.value)}>
              <option value="">— None —</option>
              {eligibleLeads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Client</label>
            <select className={inp} value={showNewClient ? '__new__' : form.clientId ?? ''} onChange={e => {
              if (e.target.value === '__new__') {
                setShowNewClient(true)
                setNewClient({ name: form.clientName, phone: form.clientPhone, email: '' })
              } else {
                setShowNewClient(false)
                const client = clients.find(c => c.id === e.target.value)
                setForm(f => ({ ...f, clientId: client?.id, clientName: client?.name ?? f.clientName, clientPhone: client?.phone ?? f.clientPhone }))
              }
            }}>
              <option value="">— Select —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
              <option value="__new__">+ New Client</option>
            </select>
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
            <select className={inp} value={form.coordinatorId} onChange={e => onCoordinatorChange(e.target.value)}>
              <option value="">— Select —</option>
              {coordinators.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Stage</label>
              <select className={inp} value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value as ProjectStage }))}>
                {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <select className={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Project['status'] }))}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
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
              <input type="date" className={inp} value={form.startDate ?? ''} min={isEditingExisting ? undefined : todayStr()}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value || undefined }))} />
            </div>
            <div>
              <label className={label}>Expected Handover</label>
              <input type="date" className={inp} value={form.expectedHandoverDate ?? ''}
                min={isEditingExisting ? undefined : (form.startDate || todayStr())}
                onChange={e => setForm(f => ({ ...f, expectedHandoverDate: e.target.value || undefined }))} />
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
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current Stage</p>
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
