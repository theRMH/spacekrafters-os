import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Download, Printer, MessageCircle, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_DIVISION_LABEL, BUSINESS_CATEGORY_LABEL, BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getAllRequirements } from '../../services/requirementService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllQuotations, upsertQuotation, deleteQuotation } from '../../services/quotationService'
import { changeQuotationStatus, recordQuotationAdvanceDecision } from './quotationActions'
import { MdOverrideCard } from '../../components/forms/MdOverrideCard'
import { getAllProjects, upsertProject } from '../../services/projectService'
import { addAuditLog } from '../../services/auditLogService'
import { downloadQuotationExcel } from '../../utils/quotationExport'
import { getManagedUsersDirectory } from '../../services/userService'
import { sendNotification } from '../../utils/notifications'
import { ROLE_LABELS } from '../../data/permissions'
import type { Requirement, SiteVisit, Quotation, BOQSection, BOQLineItem, Project, AuditLog, DiscountType, QuotationStatus, QuotationStatusHistoryItem, AdvanceTermOption } from '../../types'

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'sft', 'lot', 'set', 'lsm', 'cft', 'kgs']

// Quotations saved before the units were renamed to lowercase carry 'L.Sm' /
// 'CFT' / 'Kgs'. Map those to the current names at load time (display, edit
// form, print and Excel all read the loaded list) — the saved records are only
// rewritten if someone edits and re-saves that quotation.
function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase()
  const mapped = lower === 'l.sm' ? 'lsm' : lower
  return UNIT_OPTIONS.includes(mapped) ? mapped : unit
}

function normalizeQuotationUnits(q: Quotation): Quotation {
  return { ...q, sections: q.sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i, unit: normalizeUnit(i.unit) })) })) }
}

// Client asked for this exact terminology ("MD Approval" / "MD Approved") in
// the quotation flow specifically. Passed via StatusBadge's `label` override
// rather than editing the shared status-label map, since 'internally_approved'
// is also a Lead status and renaming it there would relabel Leads too.
export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft:               'Draft',
  pending_pc_review:   'Pending PC Review',
  pc_rejected:         'PC Rejected — Back to QS',
  internal_review:     'Pending MD Approval',
  md_rejected:         'MD Rejected — Back to PC',
  internally_approved: 'MD Approved',
  sent_to_client:      'Awaiting Client Approval',
  revision_requested:  'Revision Requested',
  client_approved:     'Client Approved',
  rejected:            'Rejected',
}

// Who's currently responsible and what happens next, per stage — shown
// directly on the Detail sheet so this is never ambiguous. Takes the full
// Quotation (not just its status) because 'client_approved' has two distinct
// sub-states: the advance decision still pending, or already made
// (advanceStatus/advancePaymentReceived set) — without that, "Next" stayed
// stuck on "Choose an advance payment option" forever, even after it was chosen.
export function quotationWorkflowInfo(q: Pick<Quotation, 'status' | 'advanceStatus' | 'advancePaymentReceived'>): { responsible: string; next: string } {
  switch (q.status) {
    case 'draft':               return { responsible: 'QS',      next: 'Send to PC for review' }
    case 'pending_pc_review':   return { responsible: 'PC',      next: 'PC approves or rejects' }
    case 'pc_rejected':         return { responsible: 'QS',      next: 'Revise and resubmit for PC review' }
    case 'internal_review':     return { responsible: 'MD',      next: 'MD approves or rejects' }
    case 'md_rejected':         return { responsible: 'PC',      next: 'Resubmit to MD, or revise first' }
    case 'internally_approved': return { responsible: 'PC / MD', next: 'Send to client' }
    case 'sent_to_client':      return { responsible: 'Client',  next: 'Awaiting client decision (Approval page)' }
    case 'revision_requested':  return { responsible: 'QS',      next: 'Revise and resend to client' }
    case 'client_approved':
      if (q.advanceStatus || q.advancePaymentReceived) return { responsible: '—', next: 'Quotation complete — proceed in Design Center' }
      return { responsible: 'PC / MD', next: 'Choose an advance payment option' }
    case 'rejected':            return { responsible: 'QS',      next: 'Revise and resubmit' }
  }
}

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtCurrency(n: number): string {
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

// Order is Subtotal -> Discount -> Taxable Amount -> Tax -> Transport -> Net.
// Tax is calculated on the discounted (taxable) amount, never on the
// original subtotal — a flat discount is applied proportionally across line
// items so each item's own tax% still applies correctly to its share.
function computeTotals(sections: BOQSection[], discountType: DiscountType, discountValue: number, transportCost: number) {
  let totalAmount = 0
  for (const section of sections) {
    for (const item of section.items) totalAmount += item.quantity * item.rate
  }
  const discountAmount = discountType === 'percentage'
    ? totalAmount * (discountValue / 100)
    : discountValue
  const discountRatio = totalAmount > 0 ? discountAmount / totalAmount : 0
  let taxAmount = 0
  for (const section of sections) {
    for (const item of section.items) {
      const taxableItemAmount = item.quantity * item.rate * (1 - discountRatio)
      taxAmount += taxableItemAmount * ((item.taxPercent ?? 0) / 100)
    }
  }
  const taxableAmount = totalAmount - discountAmount
  const netAmount = taxableAmount + taxAmount + transportCost
  return { totalAmount, taxAmount, discountAmount, taxableAmount, netAmount }
}

// With Advance: amount from the chosen %/₹ entry. Without Advance: ₹0 due
// now. Full Advance: the entire net amount upfront. Returns undefined for
// every field when no option is chosen yet, so it never writes partial/zero
// values nobody actually picked.
function computeAdvanceTerm(netAmount: number, option: AdvanceTermOption | '', type: DiscountType, value: number) {
  if (!option) return {}
  if (option === 'without_advance') {
    return { advanceTermOption: option, advanceTermAmount: 0, advanceTermBalance: netAmount }
  }
  if (option === 'full_advance') {
    return { advanceTermOption: option, advanceTermAmount: netAmount, advanceTermBalance: 0 }
  }
  const amount = type === 'percentage' ? netAmount * (value / 100) : value
  const clamped = Math.min(Math.max(amount, 0), netAmount)
  return {
    advanceTermOption: option, advanceTermType: type, advanceTermValue: value,
    advanceTermAmount: clamped, advanceTermBalance: netAmount - clamped,
  }
}

export default function QuotationsScreen() {
  const { user, can } = useAuth()
  const { leads, updateLead } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Quotation | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSendChoice, setShowSendChoice] = useState(false)
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email' | null>(null)
  const [showAdvancePayment, setShowAdvancePayment] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceRef, setAdvanceRef] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  // Set (together with returnTo) when this screen was opened via a Lead's
  // leadId deep link that explicitly asked for a return destination. While
  // set, every dismissal of the New/Edit/Detail sheet (X, backdrop tap, or a
  // successful save) returns there instead of leaving the bare Quotations
  // list showing underneath. NOT set for ProductSaleDetailScreen's own
  // leadId deep link into this same screen — it sends no returnTo, so that
  // flow's dismissal behavior is unchanged (plain prefill + local close).
  const [fromLeadId, setFromLeadId] = useState('')
  const [returnTo, setReturnTo] = useState('')
  const [leadId, setLeadId] = useState('')
  const [requirementId, setRequirementId] = useState('')
  const [sections, setSections] = useState<BOQSection[]>([newSection()])
  const [discountType, setDiscountType] = useState<DiscountType>('amount')
  const [discountValue, setDiscountValue] = useState(0)
  const [transportCost, setTransportCost] = useState(0)
  const [advanceTermOption, setAdvanceTermOption] = useState<AdvanceTermOption | ''>('')
  const [advanceTermType, setAdvanceTermType] = useState<DiscountType>('percentage')
  const [advanceTermValue, setAdvanceTermValue] = useState(0)
  const [documentFiles, setDocumentFiles] = useState<string[]>([])
  const [terms, setTerms] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [formError, setFormError] = useState('')
  // Target of the shared "Reject Quotation" sheet — which status a rejection
  // from the currently open stage writes, and who it's then waiting on.
  const [rejectTarget, setRejectTarget] = useState<{ status: QuotationStatus; label: string }>({ status: 'md_rejected', label: 'MD rejected' })

  function makeHistory(status: QuotationStatus, label: string, note?: string): QuotationStatusHistoryItem {
    return { status, label, note: note || undefined, by: user?.name ?? 'Unknown', byRole: user?.role, at: new Date().toISOString() }
  }

  // Best-effort heads-up to the MD(s) that a quotation is waiting on them.
  async function notifyMdPending(q: Quotation, what: string) {
    const mdIds = (await getManagedUsersDirectory()).filter(u => u.role === 'owner' && u.id !== user?.id).map(u => u.id)
    await sendNotification(mdIds, 'Quotation Pending MD Approval', `${leadName(q.leadId)} — ${fmtCurrency(q.netAmount)}. ${what}`, '/approval')
  }

  // Same, for the new PC review step ahead of MD. PC doesn't have access to
  // /approval (owner-only) — deep-link straight to this exact quotation.
  async function notifyPcPending(q: Quotation, what: string) {
    const pcIds = (await getManagedUsersDirectory()).filter(u => u.role === 'project_coordinator' && u.id !== user?.id).map(u => u.id)
    await sendNotification(pcIds, 'Quotation Pending PC Review', `${leadName(q.leadId)} — ${fmtCurrency(q.netAmount)}. ${what}`, `/quotations?quotationId=${q.id}`)
  }

  async function refresh() {
    setIsLoading(true)
    const [reqs, visits, quotes, projs] = await Promise.all([getAllRequirements(), getAllSiteVisits(), getAllQuotations(), getAllProjects()])
    setRequirements(reqs)
    setSiteVisits(visits)
    setQuotations(quotes.map(normalizeQuotationUnits))
    setProjects(projs)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const state = routerLocation.state as { leadId?: string; returnTo?: string } | null
    if (!state?.leadId || isLoading) return
    setLeadId(state.leadId)
    const req = requirementsForLead(state.leadId)[0]
    if (req) handleRequirementPick(req.id)
    setShowNew(true)
    if (state.returnTo) { setFromLeadId(state.leadId); setReturnTo(state.returnTo) }
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading])

  // Deep-link from the Approval page's "Review" on a PC-pending quotation, or
  // from a bell notification's url (?quotationId=... — a plain link can't
  // carry router state, only a query string) — either way opens this exact
  // quotation's Detail sheet directly (same pattern as AppointmentsScreen's
  // appointmentId deep link).
  useEffect(() => {
    const state = routerLocation.state as { quotationId?: string } | null
    const id = state?.quotationId ?? new URLSearchParams(routerLocation.search).get('quotationId')
    if (!id || isLoading) return
    const found = quotations.find(q => q.id === id)
    if (found) setSelected(found)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, routerLocation.search, quotations, isLoading])

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
    setDiscountType('amount'); setDiscountValue(0); setTransportCost(0)
    setAdvanceTermOption(''); setAdvanceTermType('percentage'); setAdvanceTermValue(0)
    setDocumentFiles([])
    setTerms(''); setPaymentTerms(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  // Closes a sheet normally, unless this screen was entered via a Lead deep
  // link carrying returnTo — then every dismissal (X, backdrop, Cancel, or a
  // completed save) returns to that origin page instead.
  function dismiss(closeLocally: () => void) {
    if (returnTo) {
      const id = fromLeadId
      const to = returnTo
      setFromLeadId(''); setReturnTo('')
      navigate(to, { state: { leadId: id } })
    } else {
      closeLocally()
    }
  }

  function openEdit(q: Quotation) {
    setLeadId(q.leadId); setRequirementId(q.requirementId ?? '')
    setSections(q.sections.length ? q.sections : [newSection()])
    // Legacy quotations (created before discountType/discountValue existed)
    // only have the computed discountAmount — treat that as a flat ₹ value.
    setDiscountType(q.discountType ?? 'amount')
    setDiscountValue(q.discountValue ?? q.discountAmount)
    setTransportCost(q.transportCost ?? 0)
    setAdvanceTermOption(q.advanceTermOption ?? '')
    setAdvanceTermType(q.advanceTermType ?? 'percentage')
    setAdvanceTermValue(q.advanceTermValue ?? 0)
    setDocumentFiles(q.documentFiles ?? [])
    setTerms(q.terms ?? ''); setPaymentTerms(q.paymentTerms ?? '')
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

  function updateSectionNotes(id: string, notes: string) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, notes } : s)))
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
    const { totalAmount, taxAmount, discountAmount, taxableAmount, netAmount } = computeTotals(valid, discountType, discountValue, transportCost)
    const advanceTerm = computeAdvanceTerm(netAmount, advanceTermOption, advanceTermType, advanceTermValue)
    const now = new Date().toISOString()
    const quotation: Quotation = {
      id: `quo_${Date.now()}`,
      leadId, requirementId: requirementId || undefined,
      // A new quotation never goes straight to MD: it starts out waiting for PC review.
      version: 1, status: 'pending_pc_review',
      statusHistory: [makeHistory('pending_pc_review', 'Created — sent to PC for review')],
      sections: valid, totalAmount, taxAmount, taxableAmount, transportCost: transportCost || undefined,
      discountType, discountValue, discountAmount, netAmount,
      ...advanceTerm,
      documentFiles: documentFiles.length > 0 ? documentFiles : undefined,
      terms: terms.trim() || undefined, paymentTerms: paymentTerms.trim() || undefined,
      createdBy: user?.id ?? '', createdAt: now, updatedAt: now,
    }
    const result = await upsertQuotation(quotation)
    if (!result.ok) { setFormError(result.error ?? 'Could not save quotation.'); return }
    setQuotations(prev => [quotation, ...prev])
    dismiss(() => setShowNew(false))
    setSnack({ open: true, msg: 'Quotation created and sent to PC for review.', type: 'success' })
    notifyPcPending(quotation, 'New quotation created.')
  }

  async function handleUpdateQuotation() {
    if (!selected) return
    const valid = validSections()
    if (valid.length === 0) {
      setFormError('At least one section with a titled, priced line item is required.')
      return
    }
    const { totalAmount, taxAmount, discountAmount, taxableAmount, netAmount } = computeTotals(valid, discountType, discountValue, transportCost)
    const advanceTerm = computeAdvanceTerm(netAmount, advanceTermOption, advanceTermType, advanceTermValue)
    // Changing an approved/rejected quotation means the version anyone
    // already approved is no longer the one on screen — it must go through
    // the full PC -> MD chain again, never skipping straight back to MD.
    const needsReapproval = ['internally_approved', 'rejected', 'revision_requested', 'pc_rejected', 'md_rejected'].includes(selected.status)
    const updated: Quotation = {
      ...selected, leadId, requirementId: requirementId || undefined,
      sections: valid, totalAmount, taxAmount, taxableAmount, transportCost: transportCost || undefined,
      discountType, discountValue, discountAmount, netAmount,
      ...advanceTerm,
      documentFiles: documentFiles.length > 0 ? documentFiles : undefined,
      terms: terms.trim() || undefined, paymentTerms: paymentTerms.trim() || undefined,
      ...(needsReapproval ? {
        status: 'pending_pc_review' as const,
        rejectionReason: undefined,
        statusHistory: [...(selected.statusHistory ?? []), makeHistory('pending_pc_review', 'Edited — resubmitted for PC review')],
      } : {}),
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertQuotation(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update quotation.'); return }
    setQuotations(prev => prev.map(q => (q.id === updated.id ? updated : q)))
    dismiss(() => { setShowEdit(false); setSelected(null) })
    setSnack({ open: true, msg: needsReapproval ? 'Quotation updated and sent back to PC for review.' : 'Quotation updated.', type: 'success' })
    if (needsReapproval) notifyPcPending(updated, 'Quotation was edited and needs review again.')
  }

  // Delegates the actual transition + history + notify + Lead-advance to
  // quotationActions.ts's changeQuotationStatus() — the same function the
  // compact Lead-page QuotationStatusCard calls, so there is exactly one
  // implementation of that logic. What stays here is screen-specific:
  // local state updates, project contractValue sync, and the legacy
  // 'rejected' audit log.
  async function handleStatusChange(q: Quotation, status: Quotation['status'], note?: string, labelOverride?: string): Promise<boolean> {
    const lead = leads.find(l => l.id === q.leadId)
    const result = await changeQuotationStatus({
      quotation: q, status, note, labelOverride,
      decidedByName: user?.name ?? 'Unknown', decidedByRole: user?.role,
      leadLabel: lead?.name, lead, updateLead,
    })
    if (!result.ok || !result.updated) { setSnack({ open: true, msg: result.error ?? 'Could not update status.', type: 'error' }); return false }
    const updated = result.updated
    setQuotations(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    setSelected(updated)
    setSnack({ open: true, msg: 'Status updated.', type: 'success' })

    // Project already exists (this is a later revision, not the initial project-creation flow
    // in ProjectsScreen) — sync its contract value to the newly approved amount.
    if (status === 'client_approved' && updated.projectId) {
      const project = projects.find(p => p.id === updated.projectId)
      if (project && project.contractValue !== updated.netAmount) {
        const savedProject = { ...project, contractValue: updated.netAmount, updatedAt: new Date().toISOString() }
        const projResult = await upsertProject(savedProject)
        if (projResult.ok) setProjects(prev => prev.map(p => (p.id === savedProject.id ? savedProject : p)))
      }
    }

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
    return true
  }

  // "Send to Client" only RECORDS the send — it does not open WhatsApp or an
  // email, and nothing is sent anywhere (no provider is integrated yet). The
  // chosen method is stored in the quotation's approval history and in the
  // lead's activity log (who + when), and the quotation moves to Sent to Client
  // / Awaiting Client Approval.
  async function handleSendToClient() {
    if (!selected || !sendChannel) return
    const channelLabel = sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'
    const activity = `Quotation sent via ${channelLabel}`
    setShowSendChoice(false)
    const ok = await handleStatusChange(selected, 'sent_to_client', undefined, activity)
    if (!ok) return
    setSnack({ open: true, msg: `${activity} — recorded in the activity log (nothing was actually sent).`, type: 'success' })
  }

  // Saves an advance decision on a client-approved quotation, adds it to the
  // quotation's approval history AND the lead's Activity Log (action, date/time
  // and user are stamped on both), and unlocks Design Center for the lead.
  // Shared with the compact Lead-page card via recordQuotationAdvanceDecision.
  async function saveAdvanceDecision(patch: Partial<Quotation>, label: string, note: string, successMsg: string): Promise<boolean> {
    if (!selected) return false
    const lead = leads.find(l => l.id === selected.leadId)
    const result = await recordQuotationAdvanceDecision({
      quotation: selected, patch, label, note,
      decidedByName: user?.name ?? 'Unknown', decidedByRole: user?.role,
      lead, updateLead,
    })
    if (!result.ok || !result.updated) { setSnack({ open: true, msg: result.error ?? 'Could not save.', type: 'error' }); return false }
    setQuotations(prev => prev.map(q => (q.id === result.updated!.id ? result.updated! : q)))
    setSelected(result.updated)
    setSnack({ open: true, msg: successMsg, type: 'success' })
    return true
  }

  // "Proceed with Advance": records the advance received (amount required,
  // reference optional) and Advance status: With Advance. Also used later to
  // record an advance that arrives after "Proceed without Advance".
  async function handleRecordAdvancePayment() {
    if (!selected) return
    const amount = Number(advanceAmount)
    if (!amount || amount <= 0) { setSnack({ open: true, msg: 'Enter a valid advance payment amount.', type: 'error' }); return }
    const laterPayment = selected.advanceStatus === 'without_advance'
    const detail = `${fmtCurrency(amount)}${advanceRef.trim() ? ` · Ref: ${advanceRef.trim()}` : ''}`
    const ok = await saveAdvanceDecision(
      {
        advanceStatus: 'with_advance',
        advancePaymentReceived: true,
        advancePaymentAmount: amount,
        advancePaymentRef: advanceRef.trim() || undefined,
        advancePaymentAt: new Date().toISOString(),
      },
      laterPayment ? 'Advance payment received (was proceeding without advance)' : 'Proceeding with advance payment',
      `Advance status: With Advance (${detail})`,
      'Proceeding with advance — recorded in the activity log.',
    )
    if (!ok) return
    setShowAdvancePayment(false)
    setAdvanceAmount(''); setAdvanceRef('')
  }

  // "Proceed without Advance": the client hasn't paid yet. Recorded, and Design
  // is NOT blocked.
  async function handleProceedWithoutAdvance() {
    await saveAdvanceDecision(
      { advanceStatus: 'without_advance' },
      'Proceeding without advance payment',
      'Advance status: Without Advance',
      'Proceeding without advance — recorded in the activity log. Design can start.',
    )
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteQuotation(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete quotation.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: selected.projectId,
        action: 'quotation_deleted',
        description: `Quotation v${selected.version} (${fmtCurrency(selected.netAmount)}) deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setQuotations(prev => prev.filter(q => q.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Quotation deleted.', type: 'success' })
  }

  const filtered = quotations.filter(q => !search || leadName(q.leadId).toLowerCase().includes(search.toLowerCase()))
  const formTotals = computeTotals(sections, discountType, discountValue, transportCost)

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
                <p className="text-[12px] text-slate-400 mt-0.5">{fmtDate(q.updatedAt)}</p>
              </div>
              <StatusBadge status={q.status} label={QUOTATION_STATUS_LABEL[q.status]} size="xs" />
            </div>
            <button onClick={e => { e.stopPropagation(); setSelected(q) }}
              className="w-full mt-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 active:bg-blue-100">
              Update Status
            </button>
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
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => dismiss(() => setSelected(null))} title={selected ? leadName(selected.leadId) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={selected.status} label={QUOTATION_STATUS_LABEL[selected.status]} size="sm" />
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

            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Current Stage</p>
                  <p className="text-sm font-bold text-indigo-900">{QUOTATION_STATUS_LABEL[selected.status]}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                  <p className="text-sm font-bold text-indigo-900">{quotationWorkflowInfo(selected).responsible}</p>
                </div>
              </div>
              <p className="text-xs text-indigo-700 mt-1.5">Next: {quotationWorkflowInfo(selected).next}</p>
            </div>

            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sections</p>
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
                          <p className="text-[12px] text-slate-400 mt-0.5">
                            {item.quantity} {item.unit} × {fmtCurrency(item.rate)}{item.taxPercent ? ` · ${item.taxPercent}% tax` : ''}
                          </p>
                        </div>
                      ))}
                      {section.notes && (
                        <div className="p-3.5 border-t border-slate-100 bg-slate-50">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Notes</p>
                          <p className="text-xs text-slate-600">{section.notes}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Material Cost</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.totalAmount)}</span></div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Discount{selected.discountType === 'percentage' && selected.discountValue ? ` (${selected.discountValue}%)` : ''}</span>
                <span className="font-semibold text-slate-700">-{fmtCurrency(selected.discountAmount)}</span>
              </div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.taxableAmount ?? selected.totalAmount - selected.discountAmount)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.taxAmount)}</span></div>
              {!!selected.transportCost && (
                <div className="flex justify-between text-xs"><span className="text-slate-500">Transport Cost</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.transportCost)}</span></div>
              )}
              <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(selected.netAmount)}</span></div>
            </div>

            {selected.advanceTermOption && (
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 space-y-1">
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Advance Payment Terms</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">
                    {selected.advanceTermOption === 'with_advance' ? 'With Advance' : selected.advanceTermOption === 'full_advance' ? 'Full Advance' : 'Without Advance'}
                    {selected.advanceTermOption === 'with_advance' && selected.advanceTermType === 'percentage' && selected.advanceTermValue ? ` (${selected.advanceTermValue}%)` : ''}
                  </span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(selected.advanceTermAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Balance Due</span><span className="font-semibold text-slate-700">{fmtCurrency(selected.advanceTermBalance ?? selected.netAmount)}</span></div>
              </div>
            )}

            {selected.documentFiles && selected.documentFiles.length > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quotation Document</p>
                <MultiFileUploadField label="" files={selected.documentFiles} onChange={() => {}} readOnly />
              </div>
            )}

            {(selected.terms || selected.paymentTerms) && (
              <div className="space-y-2">
                {selected.terms && (
                  <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p><p className="text-xs text-slate-600">{selected.terms}</p></div>
                )}
                {selected.paymentTerms && (
                  <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Terms</p><p className="text-xs text-slate-600">{selected.paymentTerms}</p></div>
                )}
              </div>
            )}

            {user?.role === 'owner' && (
              <MdOverrideCard noun="status" title="quotation status"
                options={(Object.keys(QUOTATION_STATUS_LABEL) as Quotation['status'][]).filter(s => s !== selected.status).map(s => ({ value: s, label: QUOTATION_STATUS_LABEL[s] }))}
                onApply={async (v, reason) => { await handleStatusChange(selected, v as Quotation['status'], reason, `MD override: ${QUOTATION_STATUS_LABEL[selected.status]} → ${QUOTATION_STATUS_LABEL[v as Quotation['status']]}`) }} />
            )}

            <div className="space-y-2">
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Status Actions</p>
              <div className="flex flex-wrap gap-2">
                {/* Quotations created before the PC/approval flow was enforced can still be sitting in Draft. */}
                {selected.status === 'draft' && can('create_quotation') && (
                  <button onClick={() => handleStatusChange(selected, 'pending_pc_review')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                    Send to PC for Review
                  </button>
                )}

                {/* QS -> PC: new, ahead of the existing MD step below. */}
                {selected.status === 'pending_pc_review' && !can('approve_quotation_pc') && (
                  <p className="text-xs text-slate-500">Waiting for PC review.</p>
                )}
                {selected.status === 'pending_pc_review' && can('approve_quotation_pc') && (
                  <div className="w-full flex justify-center gap-3">
                    <button onClick={() => handleStatusChange(selected, 'internal_review')}
                      className="px-10 py-3.5 rounded-xl bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700">
                      PC Approve
                    </button>
                    <button onClick={() => { setRejectReason(''); setRejectTarget({ status: 'pc_rejected', label: 'PC rejected' }); setShowReject(true) }}
                      className="px-10 py-3.5 rounded-xl border border-red-300 bg-white text-sm font-bold text-red-600 active:bg-red-50">
                      Reject
                    </button>
                  </div>
                )}
                {selected.status === 'pc_rejected' && (
                  <p className="w-full text-xs text-slate-500">Rejected by PC — edit the quotation to address it and resubmit for PC review.</p>
                )}

                {/* PC -> MD: unchanged from before, except Reject now returns to PC (md_rejected) instead of a dead-end 'rejected'. */}
                {selected.status === 'internal_review' && !can('approve_quotation_internal') && (
                  <p className="text-xs text-slate-500">Waiting for MD approval.</p>
                )}
                {selected.status === 'internal_review' && can('approve_quotation_internal') && (
                  <div className="w-full flex justify-center gap-3">
                    <button onClick={() => handleStatusChange(selected, 'internally_approved')}
                      className="px-10 py-3.5 rounded-xl bg-red-500 text-sm font-bold text-white active:bg-red-600">
                      MD Approve
                    </button>
                    <button onClick={() => { setRejectReason(''); setRejectTarget({ status: 'md_rejected', label: 'MD rejected' }); setShowReject(true) }}
                      className="px-10 py-3.5 rounded-xl border border-red-300 bg-white text-sm font-bold text-red-600 active:bg-red-50">
                      Reject
                    </button>
                  </div>
                )}

                {/* MD rejected -> back to PC, the previous responsible person. PC can
                    resubmit directly, or use the normal Edit button first if changes
                    are needed (which routes back through PC review again). */}
                {selected.status === 'md_rejected' && !can('approve_quotation_pc') && (
                  <p className="text-xs text-slate-500">Rejected by MD — waiting for PC.</p>
                )}
                {selected.status === 'md_rejected' && can('approve_quotation_pc') && (
                  <button onClick={() => handleStatusChange(selected, 'internal_review', undefined, 'PC resubmitted to MD')}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Resubmit to MD
                  </button>
                )}
                {selected.status === 'internally_approved' && can('send_quotation_client') && (
                  <button onClick={() => { setSendChannel(null); setShowSendChoice(true) }}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Send to Client
                  </button>
                )}
                {selected.status === 'sent_to_client' && (
                  <p className="w-full text-xs text-slate-500">Sent to the client — their decision is recorded on the Approval page.</p>
                )}
                {selected.status === 'client_approved' && !selected.advanceStatus && !selected.advancePaymentReceived && can('send_quotation_client') && (
                  <>
                    <p className="w-full text-xs text-slate-500">Client approved. How is the project proceeding to Design?</p>
                    <button onClick={() => setShowAdvancePayment(true)}
                      className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 active:bg-emerald-100">
                      Proceed with Advance
                    </button>
                    <button onClick={handleProceedWithoutAdvance}
                      className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 active:bg-amber-100">
                      Proceed without Advance
                    </button>
                  </>
                )}
                {selected.status === 'client_approved' && selected.advanceStatus === 'without_advance' && !selected.advancePaymentReceived && can('send_quotation_client') && (
                  <button onClick={() => setShowAdvancePayment(true)}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 active:bg-blue-100">
                    Record Advance Payment (when received)
                  </button>
                )}
              </div>
            </div>

            {(selected.status === 'rejected' || selected.status === 'pc_rejected' || selected.status === 'md_rejected') && selected.rejectionReason && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-3.5">
                <p className="text-xs font-bold text-red-700">
                  {selected.status === 'md_rejected' ? 'Rejected by MD' : selected.status === 'pc_rejected' ? 'Rejected by PC' : 'Rejected'}
                </p>
                <p className="text-xs text-red-600 mt-0.5">{selected.rejectionReason}</p>
                <p className="text-[12px] text-red-500 mt-1">
                  {selected.status === 'pc_rejected'
                    ? 'Edit the quotation to address this and it goes back to PC for review.'
                    : 'Edit the quotation to address this, or PC can resubmit directly to MD.'}
                </p>
              </div>
            )}

            {(selected.statusHistory?.length ?? 0) > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Approval History</p>
                <div className="space-y-2.5">
                  {[...(selected.statusHistory ?? [])].reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-slate-800 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">{h.label}</p>
                        {h.note && <p className="text-[12px] text-slate-500">{h.note}</p>}
                        <p className="text-[11px] text-slate-400">
                          {h.by}{h.byRole ? ` (${ROLE_LABELS[h.byRole]})` : ''} · {new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.status === 'client_approved' && selected.advanceStatus === 'without_advance' && !selected.advancePaymentReceived && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                <p className="text-xs font-bold text-amber-700">Advance status: Without Advance</p>
                <p className="text-[12px] text-amber-600 mt-1">Design can be started for this lead in Design Center. Record the advance when the client pays it.</p>
              </div>
            )}

            {selected.status === 'client_approved' && selected.advancePaymentReceived && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5">
                <p className="text-xs font-bold text-emerald-700">Advance status: With Advance — Payment Received</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {fmtCurrency(selected.advancePaymentAmount ?? 0)}{selected.advancePaymentRef ? ` · Ref: ${selected.advancePaymentRef}` : ''}
                  {selected.advancePaymentAt ? ` · ${fmtDate(selected.advancePaymentAt)}` : ''}
                </p>
                <p className="text-[12px] text-emerald-600 mt-1">Design can now be started for this lead in Design Center.</p>
              </div>
            )}

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Quotation
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* PC or MD rejection — reason required. Target status/label set by
          whichever Reject button opened this (see rejectTarget). */}
      <BottomSheet isOpen={showReject} onClose={() => setShowReject(false)} title="Reject Quotation">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Reason for rejection *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="What needs to change?"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button disabled={!rejectReason.trim()}
            onClick={async () => {
              if (!selected) return
              setShowReject(false)
              await handleStatusChange(selected, rejectTarget.status, rejectReason.trim(), rejectTarget.label)
            }}
            className="w-full py-3.5 rounded-xl bg-red-500 text-sm font-bold text-white active:bg-red-600 disabled:opacity-40">
            Reject Quotation
          </button>
        </div>
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
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Client</p>
                <p className="text-sm font-semibold text-slate-800">{leadName(selected.leadId)}</p>
              </div>

              {(() => {
                const sourceLead = leads.find(l => l.id === selected.leadId)
                if (!sourceLead?.businessDivision) return null
                const label = BUSINESS_DIVISION_LABEL[sourceLead.businessDivision]
                  + (sourceLead.businessCategory ? ` (${BUSINESS_CATEGORY_LABEL[sourceLead.businessCategory]})` : '')
                  + (sourceLead.businessBrand ? ` (${BUSINESS_BRAND_LABEL[sourceLead.businessBrand]})` : '')
                return (
                  <div>
                    <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Company / Brand</p>
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                  </div>
                )
              })()}

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
                  {section.notes && (
                    <tfoot>
                      <tr>
                        <td colSpan={5} className="px-2 py-1.5 border border-slate-200 text-slate-500 italic">Notes: {section.notes}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ))}

              <div className="flex justify-end">
                <div className="w-56 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Material Cost</span><span className="font-semibold">{fmtCurrency(selected.totalAmount)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Discount</span><span className="font-semibold">-{fmtCurrency(selected.discountAmount)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{fmtCurrency(selected.taxableAmount ?? selected.totalAmount - selected.discountAmount)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Tax</span><span className="font-semibold">{fmtCurrency(selected.taxAmount)}</span></div>
                  {!!selected.transportCost && (
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Transport Cost</span><span className="font-semibold">{fmtCurrency(selected.transportCost)}</span></div>
                  )}
                  <div className="flex justify-between text-sm border-t border-slate-300 pt-1"><span className="font-bold">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(selected.netAmount)}</span></div>
                  {selected.advanceTermOption && (
                    <>
                      <div className="flex justify-between text-xs pt-1"><span className="text-slate-500">Advance ({selected.advanceTermOption === 'with_advance' ? 'With Advance' : selected.advanceTermOption === 'full_advance' ? 'Full Advance' : 'Without Advance'})</span><span className="font-semibold">{fmtCurrency(selected.advanceTermAmount ?? 0)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">Balance Due</span><span className="font-semibold">{fmtCurrency(selected.advanceTermBalance ?? selected.netAmount)}</span></div>
                    </>
                  )}
                </div>
              </div>

              {selected.terms && (
                <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p><p className="text-xs text-slate-600">{selected.terms}</p></div>
              )}
              {selected.paymentTerms && (
                <div><p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Terms</p><p className="text-xs text-slate-600">{selected.paymentTerms}</p></div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Quotation Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => dismiss(() => { setShowNew(false); setShowEdit(false) })}
        title={showEdit ? 'Edit Quotation' : 'New Quotation'}
        height="full"
      >
        <div className="space-y-3.5">
          {formError && <p className="text-sm text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-sm font-semibold text-slate-500 mb-1 block">Lead *</label>
            {showEdit ? (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base text-slate-500 opacity-60">
                {leadName(leadId)}
              </div>
            ) : (
              <SearchableSelect
                value={leadId} onChange={v => { setLeadId(v); setRequirementId('') }}
                options={leads.map(l => ({ value: l.id, label: `${l.name} — ${l.city}` }))}
                placeholder="Select a lead…" searchPlaceholder="Search leads…"
              />
            )}
          </div>

          {leadId && (
            <div>
              <label className="text-sm font-semibold text-slate-500 mb-1 block">Requirement</label>
              <SearchableSelect
                value={requirementId} onChange={handleRequirementPick}
                options={requirementsForLead(leadId).map(r => ({ value: r.id, label: requirementLabel(r) }))}
                placeholder="None — build sections manually" searchPlaceholder="Search requirements…"
              />
              <p className="text-xs text-slate-400 mt-1">Selecting a requirement pre-fills one section per room with its captured line items (rate defaults to 0).</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-500">Sections *</label>
              <button onClick={() => setSections(prev => [...prev, newSection()])}
                className="text-sm font-semibold text-indigo-600">+ Add Section</button>
            </div>
            <div className="space-y-3">
              {sections.map(section => {
                const sectionTotal = section.items.reduce((sum, i) => sum + i.quantity * i.rate, 0)
                return (
                  <div key={section.id} className="bg-slate-50 rounded-2xl p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input value={section.title} onChange={e => updateSectionTitle(section.id, e.target.value)}
                        placeholder="Section title (e.g. Living Room)"
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:border-indigo-400" />
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
                              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                            <button onClick={() => removeItem(section.id, item.id)} className="text-red-400 p-1">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="flex items-end gap-1.5">
                            <div className="w-[18%]">
                              <label className="block text-sm font-semibold text-slate-400 mb-1">Qty</label>
                              <input type="number" min="0" step="0.01" value={item.quantity || ''}
                                onChange={e => updateItem(section.id, item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div className="w-[22%]">
                              <label className="block text-sm font-semibold text-slate-400 mb-1">Unit</label>
                              <SearchableSelect compact value={item.unit} onChange={v => updateItem(section.id, item.id, { unit: v })}
                                options={UNIT_OPTIONS.map(u => ({ value: u, label: u }))} />
                            </div>
                            <div className="w-[20%]">
                              <label className="block text-sm font-semibold text-slate-400 mb-1">Rate</label>
                              <input type="number" min="0" step="0.01" value={item.rate || ''}
                                onChange={e => updateItem(section.id, item.id, { rate: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div className="w-[15%]">
                              <label className="block text-sm font-semibold text-slate-400 mb-1">Tax%</label>
                              <input type="number" min="0" step="0.01" value={item.taxPercent ?? ''}
                                onChange={e => updateItem(section.id, item.id, { taxPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div className="w-[25%]">
                              <label className="block text-sm font-semibold text-slate-400 mb-1 text-right">Amount</label>
                              <span className="block text-right text-base font-bold text-slate-700 py-2 truncate">{fmtCurrency(item.quantity * item.rate)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setSections(prev => prev.map(s => (s.id === section.id ? { ...s, items: [...s.items, newLineItem()] } : s)))}
                        className="text-xs font-semibold text-indigo-600">+ Add Line Item</button>
                    </div>

                    <div className="text-right text-sm font-bold text-slate-700 pt-1">Section total: {fmtCurrency(sectionTotal)}</div>

                    <textarea value={section.notes ?? ''} onChange={e => updateSectionNotes(section.id, e.target.value)}
                      placeholder="Notes for this room/section (optional)" rows={2}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-500 mb-1 block">Discount</label>
            <div className="flex gap-2">
              <div className="w-32">
                <SearchableSelect value={discountType} onChange={v => setDiscountType(v as DiscountType)} options={[
                  { value: 'amount', label: 'Amount (₹)' },
                  { value: 'percentage', label: 'Percentage (%)' },
                ]} />
              </div>
              <input type="number" min="0" step="0.01" value={discountValue || ''}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 5000'}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-400" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Applied before tax — tax is calculated on the discounted (taxable) amount.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-500 mb-1 block">Transport Cost</label>
            <input type="number" min="0" step="0.01" value={transportCost || ''}
              onChange={e => setTransportCost(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 5000"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-400" />
          </div>

          <div>
            <MultiFileUploadField label="Quotation Documents (PDF)" files={documentFiles} onChange={setDocumentFiles}
              accept="application/pdf,.pdf" uploadButtonLabel="Upload PDFs" />
          </div>

          <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Material Cost</span><span className="font-semibold text-slate-700">{fmtCurrency(formTotals.totalAmount)}</span></div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Discount{discountType === 'percentage' && discountValue ? ` (${discountValue}%)` : ''}</span>
              <span className="font-semibold text-slate-700">-{fmtCurrency(formTotals.discountAmount)}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(formTotals.taxableAmount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Tax</span><span className="font-semibold text-slate-700">{fmtCurrency(formTotals.taxAmount)}</span></div>
            {!!transportCost && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Transport Cost</span><span className="font-semibold text-slate-700">{fmtCurrency(transportCost)}</span></div>
            )}
            <div className="flex justify-between text-base pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Net Amount</span><span className="font-extrabold" style={{ color: '#0F2A4A' }}>{fmtCurrency(formTotals.netAmount)}</span></div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-500 mb-1 block">Terms</label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-500 mb-1 block">Payment Terms</label>
            <textarea value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          <button
            onClick={showEdit ? handleUpdateQuotation : handleAddQuotation}
            className="w-full text-white rounded-xl py-3 text-base font-bold active:opacity-90"
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

      {/* Send to Client — choose channel */}
      <BottomSheet isOpen={showSendChoice} onClose={() => setShowSendChoice(false)} title="Send to Client">
        <div className="space-y-3 pb-4">
          <p className="text-xs text-slate-500">
            Choose how the quotation goes to {leadName(selected?.leadId ?? '')}. For now this only records the action in the
            activity log — no WhatsApp message or email is actually sent.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([['whatsapp', 'WhatsApp', MessageCircle], ['email', 'Email', Mail]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setSendChannel(value)} aria-pressed={sendChannel === value}
                className={`flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 text-sm font-bold active:opacity-90 ${
                  sendChannel === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
                }`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <button disabled={!sendChannel} onClick={handleSendToClient}
            className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-40"
            style={{ background: '#0F2A4A' }}>
            Send to Client
          </button>
        </div>
      </BottomSheet>

      {/* Record Advance Payment */}
      <BottomSheet isOpen={showAdvancePayment} onClose={() => setShowAdvancePayment(false)} title="Proceed with Advance">
        <div className="space-y-3 pb-4">
          <p className="text-xs text-slate-500">Records the advance received and that the project is proceeding With Advance. Design can then be started for this lead.</p>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Advance Amount Received *</label>
            <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="₹"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Reference (optional)</label>
            <input value={advanceRef} onChange={e => setAdvanceRef(e.target.value)} placeholder="UTR / cheque no."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <button onClick={handleRecordAdvancePayment}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            Confirm & Proceed with Advance
          </button>
        </div>
      </BottomSheet>

      <Snackbar
        isOpen={snack.open}
        message={snack.msg}
        type={snack.type}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
