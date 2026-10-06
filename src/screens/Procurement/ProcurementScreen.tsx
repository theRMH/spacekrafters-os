import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllVendors } from '../../services/vendorService'
import {
  getAllPurchaseRequests, upsertPurchaseRequest, deletePurchaseRequest,
  getAllVendorQuotes, addVendorQuote,
  getAllPurchaseOrders, upsertPurchaseOrder,
  getAllGoodsReceipts, addGoodsReceipt,
  getAllVendorBills, upsertVendorBill,
} from '../../services/procurementService'
import { upsertPayable } from '../../services/financeService'
import { addAuditLog } from '../../services/auditLogService'
import type {
  Project, Vendor, PurchaseRequest, VendorQuote, PurchaseOrder, GoodsReceipt, VendorBill, Payable, AuditLog,
} from '../../types'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function emptyPR(): PurchaseRequest {
  const now = new Date().toISOString()
  return {
    id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    quantity: 1,
    unit: '',
    status: 'draft',
    createdBy: '',
    createdAt: now,
    updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function ProcurementScreen() {
  const { user, can } = useAuth()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [prs, setPrs] = useState<PurchaseRequest[]>([])
  const [quotes, setQuotes] = useState<VendorQuote[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [grns, setGrns] = useState<GoodsReceipt[]>([])
  const [bills, setBills] = useState<VendorBill[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PurchaseRequest | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PurchaseRequest>(emptyPR())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [quoteForm, setQuoteForm] = useState({ vendorId: '', amount: '', notes: '' })
  const [poVendorId, setPoVendorId] = useState('')
  const [billForm, setBillForm] = useState({ billNumber: '', amount: '', documentFiles: [] as string[] })

  async function reload() {
    setIsLoading(true)
    const [p, v, pr, q, po, g, b] = await Promise.all([
      getAllProjects(), getAllVendors(), getAllPurchaseRequests(),
      getAllVendorQuotes(), getAllPurchaseOrders(), getAllGoodsReceipts(), getAllVendorBills(),
    ])
    setProjects(p); setVendors(v); setPrs(pr); setQuotes(q); setPos(po); setGrns(g); setBills(b)
    setIsLoading(false)
  }

  useEffect(() => { reload() }, [])

  useEffect(() => {
    const state = routerLocation.state as { projectId?: string } | null
    if (!state?.projectId || isLoading) return
    setForm({ ...emptyPR(), projectId: state.projectId })
    setShowForm(true)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading])

  useEffect(() => {
    if (selected) {
      const fresh = prs.find(p => p.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [prs])

  function openCreate() {
    setForm(emptyPR())
    setShowForm(true)
  }

  async function handleSavePR() {
    if (!form.description.trim() || !form.unit.trim()) {
      setSnack({ open: true, msg: 'Description and unit are required.', type: 'error' })
      return
    }
    const isNew = !prs.some(p => p.id === form.id)
    const toSave: PurchaseRequest = { ...form, createdBy: form.createdBy || user?.id || '', updatedAt: new Date().toISOString() }
    const result = await upsertPurchaseRequest(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save purchase request.', type: 'error' })
      return
    }
    if (user && isNew) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: toSave.projectId,
        action: 'purchase_request_created',
        description: `Purchase request "${toSave.description}" (${toSave.quantity} ${toSave.unit}) raised.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setPrs(prev => {
      const exists = prev.some(p => p.id === toSave.id)
      return exists ? prev.map(p => (p.id === toSave.id ? toSave : p)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Purchase request saved.', type: 'success' })
  }

  async function handleApprove() {
    if (!selected) return
    const toSave: PurchaseRequest = { ...selected, status: 'approved', updatedAt: new Date().toISOString() }
    const result = await upsertPurchaseRequest(toSave)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to approve.', type: 'error' }); return }
    setPrs(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: toSave.projectId,
        action: 'purchase_request_approved',
        description: `Purchase request "${toSave.description}" approved.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setSnack({ open: true, msg: 'Purchase request approved.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deletePurchaseRequest(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete purchase request.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: selected.projectId,
        action: 'purchase_request_deleted',
        description: `Purchase request "${selected.description}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setPrs(prev => prev.filter(p => p.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Purchase request deleted.', type: 'success' })
  }

  async function handleAddQuote() {
    if (!selected || !quoteForm.vendorId || !quoteForm.amount) {
      setSnack({ open: true, msg: 'Vendor and amount are required.', type: 'error' })
      return
    }
    const quote: VendorQuote = {
      id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      purchaseRequestId: selected.id,
      vendorId: quoteForm.vendorId,
      amount: Number(quoteForm.amount),
      notes: quoteForm.notes || undefined,
      createdAt: new Date().toISOString(),
    }
    const result = await addVendorQuote(quote)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add quote.', type: 'error' }); return }
    setQuotes(prev => [quote, ...prev])
    const toSave: PurchaseRequest = { ...selected, status: 'quoted', updatedAt: new Date().toISOString() }
    await upsertPurchaseRequest(toSave)
    setPrs(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    setQuoteForm({ vendorId: '', amount: '', notes: '' })
    setSnack({ open: true, msg: 'Quote added.', type: 'success' })
  }

  async function handleRaisePO(quote: VendorQuote) {
    if (!selected) return
    const po: PurchaseOrder = {
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      purchaseRequestId: selected.id,
      vendorId: quote.vendorId,
      projectId: selected.projectId,
      amount: quote.amount,
      status: 'issued',
      issuedAt: new Date().toISOString(),
      createdBy: user?.id || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertPurchaseOrder(po)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to raise PO.', type: 'error' }); return }
    setPos(prev => [po, ...prev])
    const toSave: PurchaseRequest = { ...selected, status: 'po_raised', updatedAt: new Date().toISOString() }
    await upsertPurchaseRequest(toSave)
    setPrs(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: po.projectId,
        action: 'po_raised',
        description: `Purchase order raised for "${selected.description}" (${fmtCurrency(po.amount)}).`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setSnack({ open: true, msg: 'Purchase order raised.', type: 'success' })
  }

  async function handleReceiveGoods(po: PurchaseOrder) {
    if (!selected) return
    const grn: GoodsReceipt = {
      id: `grn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      purchaseOrderId: po.id,
      receivedBy: user?.id || '',
      receivedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    const result = await addGoodsReceipt(grn)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to record receipt.', type: 'error' }); return }
    setGrns(prev => [grn, ...prev])
    const updatedPO: PurchaseOrder = { ...po, status: 'received', updatedAt: new Date().toISOString() }
    await upsertPurchaseOrder(updatedPO)
    setPos(prev => prev.map(p => (p.id === updatedPO.id ? updatedPO : p)))
    const toSave: PurchaseRequest = { ...selected, status: 'received', updatedAt: new Date().toISOString() }
    await upsertPurchaseRequest(toSave)
    setPrs(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: po.projectId,
        action: 'goods_received',
        description: `Goods receipt recorded for PO against "${selected.description}".`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setSnack({ open: true, msg: 'Goods receipt recorded.', type: 'success' })
  }

  async function handleEnterBill(po: PurchaseOrder) {
    if (!selected || !billForm.billNumber.trim() || !billForm.amount) {
      setSnack({ open: true, msg: 'Bill number and amount are required.', type: 'error' })
      return
    }
    const bill: VendorBill = {
      id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      vendorId: po.vendorId,
      purchaseOrderId: po.id,
      billNumber: billForm.billNumber,
      amount: Number(billForm.amount),
      paidAmount: 0,
      status: 'unpaid',
      billDate: new Date().toISOString(),
      documentFiles: billForm.documentFiles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertVendorBill(bill)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to enter vendor bill.', type: 'error' }); return }
    setBills(prev => [bill, ...prev])

    const payable: Payable = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      vendorId: bill.vendorId,
      vendorBillId: bill.id,
      description: `Vendor bill ${bill.billNumber}`,
      amount: bill.amount,
      paidAmount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const payableResult = await upsertPayable(payable)

    const updatedPO: PurchaseOrder = { ...po, status: 'billed', updatedAt: new Date().toISOString() }
    await upsertPurchaseOrder(updatedPO)
    setPos(prev => prev.map(p => (p.id === updatedPO.id ? updatedPO : p)))
    const toSave: PurchaseRequest = { ...selected, status: 'billed', updatedAt: new Date().toISOString() }
    await upsertPurchaseRequest(toSave)
    setPrs(prev => prev.map(p => (p.id === toSave.id ? toSave : p)))
    setBillForm({ billNumber: '', amount: '', documentFiles: [] })
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: po.projectId,
        action: 'vendor_bill_entered',
        description: `Vendor bill "${bill.billNumber}" (${fmtCurrency(bill.amount)}) entered against "${selected.description}".`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    if (!payableResult.ok) {
      setSnack({ open: true, msg: `Vendor bill entered, but creating the payable failed (${payableResult.error ?? 'unknown error'}). Add it manually in Payables.`, type: 'error' })
    } else {
      setSnack({ open: true, msg: 'Vendor bill entered — outstanding balance updated.', type: 'success' })
    }
  }

  const filtered = prs.filter(p => !search || p.description.toLowerCase().includes(search.toLowerCase()))

  const selQuotes = selected ? quotes.filter(q => q.purchaseRequestId === selected.id) : []
  const selPOs    = selected ? pos.filter(p => p.purchaseRequestId === selected.id) : []
  const selGRNs   = (poId: string) => grns.filter(g => g.purchaseOrderId === poId)
  const selBill   = (poId: string) => bills.find(b => b.purchaseOrderId === poId)

  function vendorName(id: string) { return vendors.find(v => v.id === id)?.name ?? 'Unknown vendor' }
  function projectName(id?: string) { return projects.find(p => p.id === id)?.name }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Procurement</h1>
          <PermissionGate permission="raise_purchase_request">
            <button onClick={openCreate} aria-label="New purchase request"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search purchase requests…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(pr => (
          <button key={pr.id} onClick={() => setSelected(pr)}
            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-bold text-sm text-slate-800">{pr.description}</span>
              <StatusBadge status={pr.status} />
            </div>
            <p className="text-xs text-slate-500">
              {pr.quantity} {pr.unit}{projectName(pr.projectId) ? ` · ${projectName(pr.projectId)}` : ''}
            </p>
          </button>
        ))}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No purchase requests yet.</p>
        )}
      </div>

      {/* Create PR */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Purchase Request">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Project</label>
            <SearchableSelect
              value={form.projectId ?? ''} onChange={v => setForm(f => ({ ...f, projectId: v || undefined }))}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="No specific project"
            />
          </div>
          <div>
            <label className={label}>Description *</label>
            <input className={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Quantity</label>
              <input type="number" min={1} className={inp} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={label}>Unit *</label>
              <input className={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. sheets, kg, nos" />
            </div>
          </div>
          <div>
            <label className={label}>Needed By</label>
            <DateField value={form.neededBy?.slice(0, 10) ?? ''} min={todayStr()}
              onChange={v => setForm(f => ({ ...f, neededBy: v || undefined }))} />
          </div>
          <button onClick={handleSavePR} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Purchase Request
          </button>
        </div>
      </BottomSheet>

      {/* PR Flow-sheet Detail */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.description ?? ''} height="full">
        {selected && (
          <div className="space-y-5 pb-4">
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
              <div>
                <p className="text-xs text-slate-500">{selected.quantity} {selected.unit}{projectName(selected.projectId) ? ` · ${projectName(selected.projectId)}` : ''}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">Needed by {fmtDate(selected.neededBy)}</p>
              </div>
              <StatusBadge status={selected.status} />
            </div>

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Purchase Request
              </button>
            )}

            {/* Stage: Approval */}
            {selected.status === 'draft' && (
              <PermissionGate permission="approve_purchase_request">
                <button onClick={handleApprove} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:bg-emerald-700">
                  Approve Purchase Request
                </button>
              </PermissionGate>
            )}

            {/* Stage: Vendor Quotes / Comparison */}
            {(selected.status === 'approved' || selected.status === 'quoted') && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Vendor Quotes (Comparison)</h3>
                <div className="space-y-2 mb-3">
                  {selQuotes.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No quotes yet.</p>}
                  {selQuotes.sort((a, b) => a.amount - b.amount).map(q => (
                    <div key={q.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{vendorName(q.vendorId)}</p>
                        {q.notes && <p className="text-[12px] text-slate-400">{q.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-800">{fmtCurrency(q.amount)}</span>
                        <PermissionGate permission="create_po">
                          <button onClick={() => handleRaisePO(q)} className="text-xs font-semibold text-indigo-600 active:opacity-70">
                            Raise PO
                          </button>
                        </PermissionGate>
                      </div>
                    </div>
                  ))}
                </div>
                <PermissionGate permission="raise_purchase_request">
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <SearchableSelect
                      value={quoteForm.vendorId} onChange={v => setQuoteForm(f => ({ ...f, vendorId: v }))}
                      options={vendors.map(v => ({ value: v.id, label: v.name }))}
                      placeholder="Select vendor…"
                    />
                    <input type="number" className={inp} placeholder="Quoted amount" value={quoteForm.amount} onChange={e => setQuoteForm(f => ({ ...f, amount: e.target.value }))} />
                    <input className={inp} placeholder="Notes (optional)" value={quoteForm.notes} onChange={e => setQuoteForm(f => ({ ...f, notes: e.target.value }))} />
                    <button onClick={handleAddQuote} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:bg-indigo-700">
                      Add Quote
                    </button>
                  </div>
                </PermissionGate>
              </div>
            )}

            {/* Stage: PO → GRN → Bill */}
            {selPOs.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Purchase Orders</h3>
                <div className="space-y-3">
                  {selPOs.map(po => {
                    const receipts = selGRNs(po.id)
                    const bill = selBill(po.id)
                    return (
                      <div key={po.id} className="bg-white rounded-xl p-3 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-800">{vendorName(po.vendorId)}</span>
                          <StatusBadge status={po.status} />
                        </div>
                        <p className="text-xs text-slate-500">{fmtCurrency(po.amount)} · Issued {fmtDate(po.issuedAt)}</p>

                        {po.status === 'issued' && (
                          <PermissionGate permission="receive_goods">
                            <button onClick={() => handleReceiveGoods(po)} className="w-full py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold active:bg-slate-200">
                              Mark Goods Received
                            </button>
                          </PermissionGate>
                        )}

                        {receipts.length > 0 && (
                          <p className="text-[12px] text-slate-400">Received {fmtDate(receipts[0].receivedAt)}</p>
                        )}

                        {po.status === 'received' && !bill && (
                          <PermissionGate permission="enter_vendor_bill">
                            <div className="space-y-2 pt-1">
                              <input className={inp} placeholder="Bill number" value={billForm.billNumber} onChange={e => setBillForm(f => ({ ...f, billNumber: e.target.value }))} />
                              <input type="number" className={inp} placeholder="Bill amount" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} />
                              <MultiFileUploadField label="Bill Documents" files={billForm.documentFiles} onChange={files => setBillForm(f => ({ ...f, documentFiles: files }))} uploadButtonLabel="Upload Document" />
                              <button onClick={() => handleEnterBill(po)} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold active:bg-indigo-700">
                                Enter Vendor Bill
                              </button>
                            </div>
                          </PermissionGate>
                        )}

                        {bill && (
                          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5">
                            <span className="text-xs font-semibold text-slate-700">{bill.billNumber}</span>
                            <StatusBadge status={bill.status} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
