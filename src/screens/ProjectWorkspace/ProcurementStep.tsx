import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from '../../data/materialCategories'
import { DEFAULT_GST_PERCENT, GST_PERCENT_OPTIONS } from '../../data/procurementRules'
import { ROLE_LABELS } from '../../data/permissions'
import { generateAndUploadPurchaseOrderPdf } from '../../utils/purchaseOrderPdf'
import { inr, lineAmounts, orderTotals } from '../../utils/purchaseOrderMath'
import { deleteRemoteFile } from '../../utils/fileStorage'
import { sendNotification } from '../../utils/notifications'
import type { AuthUser, IndentItem, ManagedUser, Project, ProjectStage, VendorLine, VendorOrder } from '../../types'

const STAGE: ProjectStage = 'procurement'

// The title a project shows in My Tasks while it sits in Procurement (it follows whose turn it is).
export function procurementTaskTitle(project: Project): string {
  const work = project.procurementWork
  if (!work) return 'Assign Procurer'
  const status = work.review?.status
  if (status === 'with_pc') return 'Review Vendor Orders'
  if (status === 'approved') return 'Move to Waiting for Delivery'
  if (status === 'rejected') return 'Revise Vendor Orders'
  return work.vendors.length > 0 ? 'Send Vendor Orders to PC' : 'Create Vendors'
}

interface Props {
  project: Project
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage, opts?: { keepOpen?: boolean; quiet?: boolean }) => Promise<Project | null>
}

const newId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const blankLine = (): VendorLine => ({ id: newId('vl'), category: '', description: '', spec: '', unit: '', qty: '', rate: '', hsn: '', gstPercent: DEFAULT_GST_PERCENT })

const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'text-xs font-semibold text-slate-500 mb-1 block'

type Draft = Omit<VendorOrder, 'poNumber' | 'createdAt' | 'updatedAt'> & { poNumber?: string; createdAt?: string }
const blankDraft = (): Draft => ({ id: newId('ven'), name: '', gstin: '', phone: '', email: '', address: '', lines: [blankLine()] })

// Procurement: the PC assigns a procurer, who creates a purchase order for each vendor (name, GST number and the
// products with category, unit, quantity and rate). Each vendor gets its own PO PDF, made automatically from those
// details. The procurer sends the set to the PC, who approves it (then moves the project on) or rejects with a reason.
export function ProcurementStep({ project, users, user, saving, persist }: Props) {
  const work = project.procurementWork
  const vendors = work?.vendors ?? []
  const status = work?.review?.status
  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'
  const isProcurer = !!work && (user?.id === work.procurerId || user?.role === 'owner')
  const projectLabel = project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name

  // The approved material indent travels with the project to the procurer.
  const approvedIndent = [...(project.materialIndents ?? [])].reverse().find(s => s.decision === 'approved')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [personId, setPersonId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showIndentPick, setShowIndentPick] = useState(false)
  const [error, setError] = useState('')

  const everyone = [...users].sort((a, b) => a.fullName.localeCompare(b.fullName))
  const personOptions = (
    <>
      <option value="">— Select —</option>
      {everyone.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
    </>
  )

  function pcFor(): { id: string; name: string } {
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    return { id: pc?.id ?? project.coordinatorId, name: pc?.fullName ?? project.coordinatorName }
  }

  function editLine(id: string, patch: Partial<VendorLine>) {
    setDraft(d => d && { ...d, lines: d.lines.map(l => l.id === id ? { ...l, ...patch } : l) })
  }

  function validate(d: Draft): string {
    if (!d.name.trim()) return 'Enter the vendor name.'
    if (d.lines.length === 0) return 'Add at least one product.'
    const bad = d.lines.findIndex(l => !l.description.trim() || !l.unit || !(parseFloat(l.qty) > 0) || !(parseFloat(l.rate) > 0))
    if (bad >= 0) return `Product ${bad + 1}: enter the description, unit, quantity and rate.`
    return ''
  }

  // Indent items not yet on any vendor's order (apart from `besides`, the vendor being edited) — what is still to buy.
  const indentItems = approvedIndent?.indent.items ?? []
  function remainingItems(extra: VendorLine[] = [], besides?: string) {
    const used = new Set([...vendors.filter(v => v.id !== besides).flatMap(v => v.lines), ...extra].map(l => l.indentItemId).filter(Boolean))
    return indentItems.filter(it => !used.has(it.id))
  }
  const lineFromItem = (it: IndentItem): VendorLine => ({ ...blankLine(), indentItemId: it.id, category: it.category, description: it.description, spec: it.spec, unit: it.unit, qty: it.qty })
  async function saveVendor(addAnother = false) {
    if (!draft || !work) return
    const problem = validate(draft)
    if (problem) { setError(problem); return }
    setError(''); setBusy(true)
    try {
      const existing = vendors.find(v => v.id === draft.id)
      const now = new Date().toISOString()
      const poBase = (project.projectNumber ?? project.id.slice(-6)).replace(/\s+/g, '')
      const order: VendorOrder = {
        ...draft, name: draft.name.trim(), gstin: draft.gstin.trim().toUpperCase(),
        poNumber: existing?.poNumber ?? `PO-${poBase}-${vendors.length + 1}`,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
      }
      order.pdf = await generateAndUploadPurchaseOrderPdf(order, projectLabel)
      if (existing?.pdf) await deleteRemoteFile(existing.pdf)
      const next = existing ? vendors.map(v => v.id === order.id ? order : v) : [...vendors, order]
      const updated = await persist(
        { procurementWork: { ...work, vendors: next, review: status === 'rejected' ? undefined : work.review } },
        `${existing ? 'Updated' : 'Added'} vendor ${order.name} (${order.poNumber})`, STAGE, { keepOpen: true, quiet: true },
      )
      if (updated) {
        // "Save & add another vendor" opens the next vendor blank.
        setDraft(addAnother ? blankDraft() : null)
        setShowIndentPick(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.')
    } finally { setBusy(false) }
  }

  async function removeVendor(v: VendorOrder) {
    if (!work) return
    if (v.pdf) await deleteRemoteFile(v.pdf)
    await persist({ procurementWork: { ...work, vendors: vendors.filter(x => x.id !== v.id) } }, `Removed vendor ${v.name}`, STAGE, { keepOpen: true, quiet: true })
  }

  async function assignProcurer() {
    const person = users.find(u => u.id === personId)
    if (!person || !user) { setError('Choose the procurer.'); return }
    const updated = await persist(
      {
        assignedRole: person.role, assignedToId: person.id, assignedToName: person.fullName,
        procurementWork: { procurerId: person.id, procurerName: person.fullName, assignedBy: user.name, assignedAt: new Date().toISOString(), vendors: [] },
      },
      `Procurement assigned to ${person.fullName}`, STAGE,
    )
    if (updated) await sendNotification([person.id], 'Procurement Assigned', `${project.name} — you have been assigned Procurement.`, `/my-tasks/project/${project.id}`)
  }

  async function sendToPc() {
    if (!work || !user) return
    if (vendors.length === 0 || vendors.some(v => !v.pdf)) { setError('Add at least one vendor — every vendor needs its PDF.'); return }
    const pc = pcFor()
    const updated = await persist(
      {
        procurementWork: { ...work, review: { status: 'with_pc', submittedBy: user.name, submittedAt: new Date().toISOString() } },
        assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name,
      },
      `Vendor orders (${vendors.length}) sent by ${user.name} to PC for approval`, STAGE,
    )
    if (updated) await sendNotification([pc.id], 'Vendor Orders Pending PC Approval', `${project.name} — ${vendors.length} vendor order(s) are waiting for your approval.`, `/projects/${project.id}`)
  }

  async function approve() {
    if (!work || !user) return
    const pc = pcFor()
    const updated = await persist(
      {
        procurementWork: { ...work, review: { ...work.review!, status: 'approved', decidedBy: user.name, decidedAt: new Date().toISOString(), reason: undefined } },
        assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name,
      },
      'PC approved the vendor orders', STAGE,
    )
    if (updated) await sendNotification([work.procurerId], 'Vendor Orders Approved', `${project.name} — the PC approved the vendor orders.`, `/my-tasks/project/${project.id}`)
  }

  async function reject() {
    if (!work || !user) return
    const reason = rejectReason.trim()
    if (!reason) { setError('Enter the reason for rejecting.'); return }
    const procurer = users.find(u => u.id === work.procurerId)
    const updated = await persist(
      {
        procurementWork: { ...work, review: { ...work.review!, status: 'rejected', decidedBy: user.name, decidedAt: new Date().toISOString(), reason } },
        assignedRole: procurer?.role ?? 'purchase', assignedToId: work.procurerId, assignedToName: work.procurerName,
      },
      `PC rejected the vendor orders: ${reason}`, STAGE,
    )
    if (updated) await sendNotification([work.procurerId], 'Vendor Orders Rejected', `${project.name} — PC rejected the vendor orders: ${reason}`, `/my-tasks/project/${project.id}`)
  }

  async function moveOn() {
    if (!work) return
    await persist(
      { stage: 'waiting_for_delivery', assignedRole: 'purchase', assignedToId: work.procurerId, assignedToName: work.procurerName, pendingStageRequest: undefined },
      'PC moved the project to Waiting for Delivery', 'waiting_for_delivery',
    )
  }

  const vendorCards = vendors.length > 0 && (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendors ({vendors.length})</p>
      {vendors.map(v => {
        const t = orderTotals(v.lines)
        const canEdit = isProcurer && status !== 'with_pc' && status !== 'approved'
        return (
          <div key={v.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{v.name}</p>
                <p className="text-xs text-slate-500">{v.poNumber} · GST {v.gstin}</p>
              </div>
              <p className="text-sm font-bold text-slate-800 shrink-0">Rs. {inr(t.total)}</p>
            </div>
            <p className="text-xs text-slate-500">{v.lines.length} product{v.lines.length === 1 ? '' : 's'}</p>
            {v.pdf && <MultiFileUploadField label="" files={[v.pdf]} onChange={() => {}} readOnly />}
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => { setDraft({ ...v }); setError('') }} className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white">Edit</button>
                <button disabled={saving} onClick={() => removeVendor(v)} className="flex-1 py-2 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-700">Remove</button>
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-slate-500 text-right">All vendors: <span className="font-bold text-slate-800">Rs. {inr(vendors.reduce((s, v) => s + orderTotals(v.lines).total, 0))}</span></p>
    </div>
  )

  // 1. Nobody assigned (a project that reached Procurement without a procurer) — the PC picks one.
  if (!work) {
    return isPc ? (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Assign the procurer. The approved material indent goes along with the assignment.</p>
        <div>
          <label className={label}>Procurer *</label>
          <select value={personId} onChange={e => setPersonId(e.target.value)} className={input}>{personOptions}</select>
        </div>
        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
        <button disabled={saving || !personId} onClick={assignProcurer} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>Assign Procurer</button>
      </div>
    ) : <p className="text-sm text-slate-500 py-6 text-center">Waiting for the PC to assign the procurer.</p>
  }

  const header = (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
        <p className="text-xs text-slate-500">Procurer</p>
        <p className="text-sm font-bold text-slate-800">{work.procurerName}</p>
      </div>
      {approvedIndent && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1.5">
          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Approved material indent {approvedIndent.indent.indentNo}</p>
          <MultiFileUploadField label="" files={approvedIndent.files} onChange={() => {}} readOnly />
        </div>
      )}
    </div>
  )

  // 2. Approved — the PC moves on to Waiting for Delivery.
  if (status === 'approved') {
    return (
      <div className="space-y-3">
        {header}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Approved by {work.review?.decidedBy ?? 'PC'}</p>
          <p className="text-sm text-emerald-700 mt-1">The vendor orders are approved.</p>
        </div>
        {vendorCards}
        {isPc
          ? <button disabled={saving} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>Move to Waiting for Delivery</button>
          : <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to move the project to Waiting for Delivery.</p>}
      </div>
    )
  }

  // 3. Sent — waiting for the PC.
  if (status === 'with_pc') {
    return (
      <div className="space-y-3">
        {header}
        {vendorCards}
        {isPc ? (
          showReject ? (
            <div className="space-y-2">
              <label className={label}>Reason for rejecting *</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className={`${input} resize-none`} />
              {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
              <div className="flex gap-2">
                <button disabled={saving} onClick={reject} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>Confirm Reject</button>
                <button onClick={() => { setShowReject(false); setRejectReason(''); setError('') }} className={`flex-1 ${btn} border border-slate-200 bg-white text-slate-600`}>Back</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button disabled={saving} onClick={approve} className={`flex-1 ${btn} text-white`} style={{ background: '#059669' }}>Approve</button>
              <button disabled={saving} onClick={() => setShowReject(true)} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>Reject</button>
            </div>
          )
        ) : <p className="text-sm text-slate-500 text-center py-1">Sent to the PC — waiting for approval.</p>}
      </div>
    )
  }

  // 4. With the procurer — creating vendors, or revising after a rejection.
  if (!isProcurer) {
    return (
      <div className="space-y-3">
        {header}
        <p className="text-sm text-slate-500 text-center py-2">Waiting for {work.procurerName} to create the vendors.</p>
        {vendorCards}
        {isPc && (
          <div className="space-y-2 pt-1">
            <label className={label}>Change procurer</label>
            <select value={personId} onChange={e => setPersonId(e.target.value)} className={input}>{personOptions}</select>
            {personId && <button disabled={saving} onClick={assignProcurer} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Reassign Procurer</button>}
          </div>
        )}
      </div>
    )
  }

  if (draft) {
    const t = orderTotals(draft.lines)
    return (
      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-800">{vendors.some(v => v.id === draft.id) ? 'Edit Vendor' : 'Add Vendor'}</p>
        <div className="space-y-3">
          <div><label className={label}>Vendor Name *</label><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={input} /></div>
          <div><label className={label}>GST Number</label><input value={draft.gstin} onChange={e => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })} maxLength={15} className={input} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Phone</label><input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} inputMode="tel" className={input} /></div>
            <div><label className={label}>Email</label><input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} inputMode="email" className={input} /></div>
          </div>
          <div><label className={label}>Billing Address</label><textarea value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} rows={2} className={`${input} resize-none`} /></div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Products</p>
          {approvedIndent && (() => {
            const left = remainingItems(draft.lines, draft.id)
            if (left.length === 0) return <p className="text-xs text-slate-400">Every item on the approved indent is already on a vendor order.</p>
            const addLines = (items: IndentItem[]) => {
              setDraft(d => d && { ...d, lines: [...d.lines.filter(l => l.description.trim() || l.qty || l.rate), ...items.map(lineFromItem)] })
              setShowIndentPick(false)
            }
            return (
              <>
                <button onClick={() => setShowIndentPick(s => !s)} className={`${btn} border border-indigo-200 bg-indigo-50 text-indigo-700`}>
                  {showIndentPick ? 'Hide' : `Add from approved material indent (${left.length} left)`}
                </button>
                {showIndentPick && (
                  <div className="border border-indigo-100 rounded-xl divide-y divide-indigo-50">
                    <button onClick={() => addLines(left)} className="w-full text-left p-3 text-sm font-bold text-indigo-700 active:bg-indigo-50">Add all {left.length} remaining items</button>
                    {left.map(it => (
                      <button key={it.id} onClick={() => addLines([it])} className="w-full text-left p-3 active:bg-indigo-50">
                        <p className="text-sm font-semibold text-slate-800">{it.description}</p>
                        <p className="text-xs text-slate-500">{[it.category, it.spec, `${it.qty} ${it.unit}`].filter(Boolean).join(' · ')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
          {draft.lines.map((l, idx) => {
            const a = lineAmounts(l)
            return (
              <div key={l.id} className="border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">Product {idx + 1}</p>
                  <button onClick={() => setDraft({ ...draft, lines: draft.lines.filter(x => x.id !== l.id) })} aria-label={`Remove product ${idx + 1}`} className="p-1 text-red-500"><Trash2 size={16} /></button>
                </div>
                <div>
                  <label className={label}>Category</label>
                  <select value={l.category} onChange={e => editLine(l.id, { category: e.target.value })} className={input}>
                    <option value="">— Select —</option>
                    {[...MATERIAL_CATEGORIES, ...(l.category && !MATERIAL_CATEGORIES.includes(l.category) ? [l.category] : [])].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className={label}>Description *</label><textarea value={l.description} onChange={e => editLine(l.id, { description: e.target.value })} rows={2} className={`${input} resize-none`} /></div>
                <div><label className={label}>Specification / Brand</label><input value={l.spec} onChange={e => editLine(l.id, { spec: e.target.value })} className={input} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Unit *</label>
                    <select value={l.unit} onChange={e => editLine(l.id, { unit: e.target.value })} className={input}>
                      <option value="">— Select —</option>
                      {[...MATERIAL_UNITS, ...(l.unit && !MATERIAL_UNITS.includes(l.unit) ? [l.unit] : [])].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div><label className={label}>Qty *</label><input value={l.qty} onChange={e => editLine(l.id, { qty: e.target.value })} inputMode="decimal" className={input} /></div>
                  <div><label className={label}>Rate (Rs.) *</label><input value={l.rate} onChange={e => editLine(l.id, { rate: e.target.value })} inputMode="decimal" className={input} /></div>
                  <div>
                    <label className={label}>GST %</label>
                    <select value={l.gstPercent} onChange={e => editLine(l.id, { gstPercent: e.target.value })} className={input}>
                      {GST_PERCENT_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </div>
                </div>
                <div><label className={label}>HSN / SAC</label><input value={l.hsn} onChange={e => editLine(l.id, { hsn: e.target.value })} className={input} /></div>
                <p className="text-xs text-slate-500 text-right">Amount: <span className="font-bold text-slate-800">Rs. {inr(a.amount)}</span> <span className="text-slate-400">(incl. GST)</span></p>
              </div>
            )
          })}
          <button onClick={() => setDraft({ ...draft, lines: [...draft.lines, blankLine()] })} className={`${btn} border border-dashed border-indigo-300 text-indigo-600 flex items-center justify-center gap-1.5`}>
            <Plus size={16} /> Add Product
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Taxable amount</span><span className="font-semibold">Rs. {inr(t.taxable)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-semibold">Rs. {inr(t.tax)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-slate-800">Total</span><span className="font-bold text-slate-800">Rs. {inr(t.total)}</span></div>
        </div>
        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
        <button disabled={busy || saving} onClick={() => saveVendor(true)} className={`${btn} border border-indigo-300 bg-indigo-50 text-indigo-700`}>
          Save & Add Another Vendor
        </button>
        <button disabled={busy || saving} onClick={() => saveVendor()} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
          {busy ? 'Creating PDF…' : 'Save Vendor & Create PDF'}
        </button>
        <button disabled={busy} onClick={() => { setDraft(null); setError('') }} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Cancel</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      {status === 'rejected' && work.review?.reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Rejected by PC</p>
          <p className="text-sm text-red-700 mt-1">{work.review.reason}</p>
        </div>
      )}
      <p className="text-sm text-slate-600">Add each vendor with its products. A separate purchase-order PDF is made for every vendor.</p>
      {vendorCards}
      {approvedIndent && vendors.length > 0 && remainingItems().length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Still to buy ({remainingItems().length})</p>
          {remainingItems().map(it => <p key={it.id} className="text-xs text-amber-900">{it.description} · {it.qty} {it.unit}</p>)}
        </div>
      )}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      <button onClick={() => { setDraft(blankDraft()); setError('') }} className={`${btn} border border-dashed border-indigo-300 text-indigo-600 flex items-center justify-center gap-1.5`}>
        <Plus size={16} /> {vendors.length > 0 ? 'Add Another Vendor' : 'Add Vendor'}{vendors.length > 0 && remainingItems().length > 0 ? ` (${remainingItems().length} items left)` : ''}
      </button>
      <button disabled={saving || vendors.length === 0} onClick={sendToPc} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
        Send to PC for Approval
      </button>
    </div>
  )
}
