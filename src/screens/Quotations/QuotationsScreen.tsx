import { useEffect, useState } from 'react'
import { Plus, Trash2, Download, Printer } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllRequirements } from '../../services/requirementService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllQuotations, upsertQuotation, deleteQuotation } from '../../services/quotationService'
import { addAuditLog } from '../../services/auditLogService'
import { downloadQuotationExcel } from '../../utils/quotationExport'
import type { Requirement, SiteVisit, Quotation, BOQSection, BOQLineItem, AuditLog } from '../../types'

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'sft', 'lot', 'set']

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function newLineItem(): BOQLineItem {
  return { id: `bqi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, description: '', unit: 'sqft', quantity: 0, rate: 0, amount: 0 }
}

function newSection(title = ''): BOQSection {
  return { id: `bqs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title, items: [newLineItem()] }
}

function sectionsFromRequirement(req: Requirement): BOQSection[] {
  const byRoom = new Map<string, BOQLineItem[]>()
  for (const li of req.lineItems) {
    const item: BOQLineItem = {
      id: `bqi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      description: li.description, unit: li.unit, quantity: li.quantity, rate: 0, amount: 0,
    }
    const existing = byRoom.get(li.roomName) ?? []
    existing.push(item)
    byRoom.set(li.roomName, existing)
  }
  return Array.from(byRoom.entries()).map(([roomName, items]) => ({
    id: `bqs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: roomName || 'General',
    items,
  }))
}

function computeTotals(sections: BOQSection[], discountAmount: number) {
  let totalAmount = 0
  let taxAmount = 0
  for (const section of sections) {
    for (const item of section.items) {
      const amount = item.quantity * item.rate
      totalAmount += amount
      taxAmount += amount * ((item.taxPercent ?? 0) / 100)
    }
  }
  const netAmount = totalAmount + taxAmount - discountAmount
  return { totalAmount, taxAmount, netAmount }
}

export default function QuotationsScreen() {
  const { user, can } = useAuth()
  const { leads } = useCRM()

  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Quotation | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [leadId, setLeadId] = useState('')
  const [requirementId, setRequirementId] = useState('')
  const [sections, setSections] = useState<BOQSection[]>([newSection()])
  const [discountAmount, setDiscountAmount] = useState(0)
  const [terms, setTerms] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [reqs, visits, quotes] = await Promise.all([getAllRequirements(), getAllSiteVisits(), getAllQuotations()])
    setRequirements(reqs)
    setSiteVisits(visits)
    setQuotations(quotes)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function leadName(id: string): string {
    return leads.find(l => l.id === id)?.name ?? id
  }

  function requirementLabel(req: Requirement): string {
    const visit = siteVisits.find(v => v.id === req.siteVisitId)
    const name = visit ? leadName(visit.leadId) : req.siteVisitId
    return `${name} — ${req.lineItems.length} item${req.lineItems.length !== 1 ? 's' : ''}`
  }

  function requirementsForLead(id: string): Requirement[] {
    const visitIds = new Set(siteVisits.filter(v => v.leadId === id).map(v => v.id))
    return requirements.filter(r => visitIds.has(r.siteVisitId))
  }

  function resetForm() {
    setLeadId(''); setRequirementId(''); setSections([newSection()])
    setDiscountAmount(0); setTerms(''); setPaymentTerms(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(q: Quotation) {
    setLeadId(q.leadId); setRequirementId(q.requirementId ?? '')
    setSections(q.sections.length ? q.sections : [newSection()])
    setDiscountAmount(q.discountAmount); setTerms(q.terms ?? ''); setPaymentTerms(q.paymentTerms ?? '')
    setFormError('')
    setShowEdit(true)
  }

  function handleRequirementPick(id: string) {
    setRequirementId(id)
    const req = requirements.find(r => r.id === id)
    if (req && req.lineItems.length > 0) setSections(sectionsFromRequirement(req))
  }

  function updateSectionTitle(id: string, title: string) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, title } : s)))
  }

  function removeSection(id: string) {
    setSections(prev => prev.filter(s => s.id !== id))
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQLineItem>) {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      return {
        ...s,
        items: s.items.map(item => {
          if (item.id !== itemId) return item
          const updated = { ...item, ...patch }
          updated.amount = updated.quantity * updated.rate
          return updated
        }),
      }
    }))
  }

  function removeItem(sectionId: string, itemId: string) {
    setSections(prev => prev.map(s => (s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s)))
  }

  function validSections(): BOQSection[] {
    return sections
      .map(s => ({ ...s, items: s.items.filter(i => i.description.trim() && i.quantity > 0 && i.rate >= 0) }))
      .filter(s => s.title.trim() && s.items.length > 0)
  }

  async function handleAddQuotation() {
    const valid = validSections()
    if (!leadId || valid.length === 0) {
      setFormError('Lead and at least one section with a titled, priced line item are required.')
      return
    }
    const { totalAmount, taxAmount, netAmount } = computeTotals(valid, discountAmount)
    const now = new Date().toISOString()
    const quotation: Quotation = {
      id: `quo_${Date.now()}`,
      leadId, requirementId: requirementId || undefined,
      version: 1, status: 'draft',
      sections: valid, totalAmount, taxAmount, discountAmount, netAmount,
      terms: terms.trim() || undefined, paymentTerms: paymentTerms.trim() || undefined,
      createdBy: user?.id ?? '', createdAt: now, updatedAt: now,
    }
    const result = await upsertQuotation(quotation)
    if (!result.ok) { setFormError(result.error ?? 'Could not save quotation.'); return }
    setQuotations(prev => [quotation, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Quotation created!', type: 'success' })
  }

  async function handleUpdateQuotation() {
    if (!selected) return
    const valid = validSections()
    if (valid.length === 0) {
      setFormError('At least one section with a titled, priced line item is required.')
      return
    }
    const { totalAmount, taxAmount, netAmount } = computeTotals(valid, discountAmount)
    const updated: Quotation = {
      ...selected, leadId, requirementId: requirementId || undefined,
      sections: valid, totalAmount, taxAmount, discountAmount, netAmount,
      terms: terms.trim() || undefined, paymentTerms: paymentTerms.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertQuotation(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update quotation.'); return }
    setQuotations(prev => prev.map(q => (q.id === updated.id ? updated : q)))
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Quotation updated.', type: 'success' })
  }

  async function handleStatusChange(q: Quotation, status: Quotation['status']) {
    const updated: Quotation = {
      ...q, status,
      sentAt: status === 'sent_to_client' ? new Date().toISOString() : q.sentAt,
      approvedAt: status === 'client_approved' ? new Date().toISOString() : q.approvedAt,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertQuotation(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update status.', type: 'error' }); return }
    setQuotations(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    setSelected(updated)
    setSnack({ open: true, msg: 'Status updated.', type: 'success' })
    if (user && status === 'rejected') {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: updated.projectId,
        action: 'quotation_rejected',
        description: `Quotation v${updated.version} (${fmtCurrency(updated.netAmount)}) rejected.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteQuotation(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete quotation.', type: 'error' }); return }
    setQuotations(prev => prev.filter(q => q.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Quotation deleted.', type: 'success' })
  }

  const filtered = quotations.filter(q => !search || leadName(q.leadId).toLowerCase().includes(search.toLowerCase()))
  const formTotals = computeTotals(sections, discountAmount)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Quotations</h1>
          <PermissionGate permission="create_quotation">
            <button onClick={openNew} aria-label="Add new quotation"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by lead name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(q => (
          <div key={q.id} onClick={() => setSelected(q)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="text-sm font-bold text-slate-800">{leadName(q.leadId)}</span>
                  <span className="text-slate-300 text-xs">|</span>
                  <span className="text-xs text-slate-500">v{q.version}</span>
                </div>
                <p className="text-sm font-bold" style={{ color: '#0F2A4A' }}>{fmtCurrency(q.netAmount)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(q.updatedAt)}</p>
              </div>
              <StatusBadge status={q.status} size="xs" />
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">🧾</p>
            <p className="text-sm">No quotations found</p>
          </div>
        )}
      </div>

      {/* Quotation Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected ? leadName(selected.leadId) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={selected.status} size="sm" />
              <div className="flex items-center gap-2">
                <button onClick={() => downloadQuotationExcel(selected, leadName(selected.leadId))}
                  aria-label="Download Excel"
                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-50">
                  <Download size={14} />
                </button>
                <button onClick={() => setShowPrint(true)}
                  aria-label="Print or save as PDF"
                  className="w-8 h-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-50">
                  <Printer size={14} />
                </button>
                <PermissionGate permission="create_quotation">
                  <button onClick={() => openEdit(selected)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Edit
                  </button>
                </PermissionGate>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sections</p>
              <div className="space-y-3">
                {selected.sections.map(section => {
                  const sectionTotal = section.items.reduce((sum, i) => sum + i.amount, 0)
                  return (
                    <div key={section.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                      <div className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{section.title}</span>
                        <span className="text-xs font-semibold text-slate-600">{fmtCurrency(sectionTotal)}</span>
                      </div>
                      {section.items.map((item, i) => (
                        <div key={item.id} className={`p-3.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-700">{item.description}</span>
                            <span className="text-xs font-bold text-slate-800">{fmtCurrency(item.amount)}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {item.quantity} {item.unit} × {fmtCurrency(item.rate)}{item.taxPercent ? ` · ${item.taxPercent}% tax` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.totalAmount)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.taxAmount)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Discount</span><span className="font-semibold text-slate-700">-{fmtCurrency(selected.discountAmount)}</span></div>
              <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(selected.netAmount)}</span></div>
            </div>

            {(selected.terms || selected.paymentTerms) && (
              <div className="space-y-2">
                {selected.terms && (
                  <div><p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p><p className="text-xs text-slate-600">{selected.terms}</p></div>
                )}
                {selected.paymentTerms && (
                  <div><p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Terms</p><p className="text-xs text-slate-600">{selected.paymentTerms}</p></div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Actions</p>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'draft' && can('approve_quotation_internal') && (
                  <button onClick={() => handleStatusChange(selected, 'internal_review')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Submit for Internal Review
                  </button>
                )}
                {selected.status === 'internal_review' && can('approve_quotation_internal') && (
                  <button onClick={() => handleStatusChange(selected, 'internally_approved')}
                    className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                    Approve Internally
                  </button>
                )}
                {selected.status === 'internally_approved' && can('send_quotation_client') && (
                  <button onClick={() => handleStatusChange(selected, 'sent_to_client')}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Send to Client
                  </button>
                )}
                {selected.status === 'sent_to_client' && can('send_quotation_client') && (
                  <>
                    <button onClick={() => handleStatusChange(selected, 'client_approved')}
                      className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                      Mark Client Approved
                    </button>
                    <button onClick={() => handleStatusChange(selected, 'revision_requested')}
                      className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 active:bg-amber-100">
                      Revision Requested
                    </button>
                    <button onClick={() => handleStatusChange(selected, 'rejected')}
                      className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100">
                      Rejected
                    </button>
                  </>
                )}
              </div>
            </div>

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Quotation
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Print / PDF View */}
      <BottomSheet isOpen={showPrint} onClose={() => setShowPrint(false)} title="Print Quotation" height="full">
        {selected && (
          <div>
            <div className="flex justify-end mb-3 print:hidden">
              <button onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold active:opacity-90"
                style={{ background: '#0F2A4A' }}>
                Print / Save as PDF
              </button>
            </div>
            <div id="quotation-print-area" className="bg-white p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold" style={{ color: '#0F2A4A' }}>SpaceKrafters</h2>
                  <p className="text-xs text-slate-500">Interior Design & Construction</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">Quotation v{selected.version}</p>
                  <p className="text-xs text-slate-500">{fmtDate(selected.createdAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Client</p>
                <p className="text-sm font-semibold text-slate-800">{leadName(selected.leadId)}</p>
              </div>

              {selected.sections.map(section => (
                <table key={section.id} className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th colSpan={5} className="text-left px-2 py-1.5 font-bold text-slate-800 border border-slate-200">{section.title}</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-2 py-1 border border-slate-200 font-semibold">Description</th>
                      <th className="text-right px-2 py-1 border border-slate-200 font-semibold">Qty</th>
                      <th className="text-right px-2 py-1 border border-slate-200 font-semibold">Rate</th>
                      <th className="text-right px-2 py-1 border border-slate-200 font-semibold">Tax %</th>
                      <th className="text-right px-2 py-1 border border-slate-200 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-2 py-1 border border-slate-200">{item.description}</td>
                        <td className="text-right px-2 py-1 border border-slate-200">{item.quantity} {item.unit}</td>
                        <td className="text-right px-2 py-1 border border-slate-200">{fmtCurrency(item.rate)}</td>
                        <td className="text-right px-2 py-1 border border-slate-200">{item.taxPercent ?? 0}%</td>
                        <td className="text-right px-2 py-1 border border-slate-200">{fmtCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}

              <div className="flex justify-end">
                <div className="w-56 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{fmtCurrency(selected.totalAmount)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold">{fmtCurrency(selected.taxAmount)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Discount</span><span className="font-semibold">-{fmtCurrency(selected.discountAmount)}</span></div>
                  <div className="flex justify-between text-sm border-t border-slate-300 pt-1"><span className="font-bold">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(selected.netAmount)}</span></div>
                </div>
              </div>

              {selected.terms && (
                <div><p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p><p className="text-xs text-slate-600">{selected.terms}</p></div>
              )}
              {selected.paymentTerms && (
                <div><p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Terms</p><p className="text-xs text-slate-600">{selected.paymentTerms}</p></div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Quotation Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Quotation' : 'New Quotation'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead *</label>
            <select value={leadId} onChange={e => { setLeadId(e.target.value); setRequirementId('') }} disabled={showEdit}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-60">
              <option value="">Select a lead…</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
            </select>
          </div>

          {leadId && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Requirement</label>
              <select value={requirementId} onChange={e => handleRequirementPick(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">None — build sections manually</option>
                {requirementsForLead(leadId).map(r => <option key={r.id} value={r.id}>{requirementLabel(r)}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Selecting a requirement pre-fills one section per room with its captured line items (rate defaults to 0).</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500">Sections *</label>
              <button onClick={() => setSections(prev => [...prev, newSection()])}
                className="text-xs font-semibold text-indigo-600">+ Add Section</button>
            </div>
            <div className="space-y-3">
              {sections.map(section => {
                const sectionTotal = section.items.reduce((sum, i) => sum + i.quantity * i.rate, 0)
                return (
                  <div key={section.id} className="bg-slate-50 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={section.title} onChange={e => updateSectionTitle(section.id, e.target.value)}
                        placeholder="Section title (e.g. Living Room)"
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-indigo-400" />
                      {sections.length > 1 && (
                        <button onClick={() => removeSection(section.id)} className="text-red-400 p-1.5">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {section.items.map(item => (
                        <div key={item.id} className="bg-white rounded-xl p-2.5 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input value={item.description} onChange={e => updateItem(section.id, item.id, { description: e.target.value })}
                              placeholder="Description"
                              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            <button onClick={() => removeItem(section.id, item.id)} className="text-red-400 p-1">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min="0" step="0.01" value={item.quantity}
                              onChange={e => updateItem(section.id, item.id, { quantity: parseFloat(e.target.value) || 0 })}
                              placeholder="Qty"
                              className="w-1/4 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            <select value={item.unit} onChange={e => updateItem(section.id, item.id, { unit: e.target.value })}
                              className="w-1/5 border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input type="number" min="0" step="0.01" value={item.rate}
                              onChange={e => updateItem(section.id, item.id, { rate: parseFloat(e.target.value) || 0 })}
                              placeholder="Rate"
                              className="w-1/4 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            <input type="number" min="0" step="0.01" value={item.taxPercent ?? ''}
                              onChange={e => updateItem(section.id, item.id, { taxPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                              placeholder="Tax%"
                              className="w-1/5 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            <span className="w-1/4 text-right text-xs font-bold text-slate-700">{fmtCurrency(item.quantity * item.rate)}</span>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setSections(prev => prev.map(s => (s.id === section.id ? { ...s, items: [...s.items, newLineItem()] } : s)))}
                        className="text-[11px] font-semibold text-indigo-600">+ Add Line Item</button>
                    </div>

                    <div className="text-right text-xs font-bold text-slate-700 pt-1">Section total: {fmtCurrency(sectionTotal)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Discount Amount</label>
            <input type="number" min="0" step="0.01" value={discountAmount}
              onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>

          <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(formTotals.totalAmount)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(formTotals.taxAmount)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Discount</span><span className="font-semibold text-slate-700">-{fmtCurrency(discountAmount)}</span></div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(formTotals.netAmount)}</span></div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Terms</label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Payment Terms</label>
            <textarea value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          <button
            onClick={showEdit ? handleUpdateQuotation : handleAddQuotation}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {showEdit ? 'Save Changes' : 'Create Quotation'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Quotation"
        message="Are you sure you want to delete this quotation? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar
        isOpen={snack.open}
        message={snack.msg}
        type={snack.type}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
