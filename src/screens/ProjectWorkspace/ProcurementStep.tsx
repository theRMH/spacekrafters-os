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
import { logEntry, routeFor, vendorStatus } from '../../utils/vendorOrderFlow'
import { VendorOrdersPanel } from './VendorOrdersPanel'
import type { AuthUser, IndentItem, ManagedUser, Project, ProjectStage, VendorLine, VendorOrder } from '../../types'

const STAGE: ProjectStage = 'procurement'

// The title a project shows in My Tasks while it sits in Procurement (it follows whose turn it is).
export function procurementTaskTitle(project: Project): string {
  const work = project.procurementWork
  if (!work) return 'Assign Procurer'
  const statuses = work.vendors.map(v => vendorStatus(work, v))
  if (statuses.length === 0) return 'Create Vendors'
  if (statuses.includes('with_pc')) return 'Review Vendor Orders'
  if (statuses.includes('rejected')) return 'Revise Vendor Orders'
  if (statuses.includes('draft')) return 'Send Vendor Orders to PC'
  return 'Send Orders to Vendors'
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
  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'
  const isProcurer = !!work && (user?.id === work.procurerId || user?.role === 'owner')
  const projectLabel = project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name

  // The approved material indent travels with the project to the procurer.
  const approvedIndent = [...(project.materialIndents ?? [])].reverse().find(s => s.decision === 'approved')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [personId, setPersonId] = useState('')
  const [showIndentPick, setShowIndentPick] = useState(false)
  const [error, setError] = useState('')

  const everyone = [...users].sort((a, b) => a.fullName.localeCompare(b.fullName))
  const personOptions = (
    <>
      <option value="">— Select —</option>
      {everyone.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
    </>
  )

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
        // Saving a vendor sends its order straight to the PC for approval — there is no separate send step.
        status: 'with_pc', rejectionReason: undefined,
        log: [...(existing?.log ?? []), logEntry('draft', existing ? 'Edited' : 'Created', user?.name ?? 'Unknown'), logEntry('with_pc', 'Sent to PC for approval', user?.name ?? 'Unknown')],
      }
      order.pdf = await generateAndUploadPurchaseOrderPdf(order, projectLabel)
      if (existing?.pdf) await deleteRemoteFile(existing.pdf)
      const next = existing ? vendors.map(v => v.id === order.id ? order : v) : [...vendors, order]
      const nextWork = { ...work, vendors: next, review: undefined }
      const updated = await persist(
        { procurementWork: nextWork, ...routeFor(nextWork, project, users) },
        `${existing ? 'Updated' : 'Added'} vendor ${order.name} (${order.poNumber}) — sent to PC for approval`, STAGE, { keepOpen: true },
      )
      if (updated) {
        const pcId = routeFor(nextWork, project, users).assignedToId
        if (pcId) await sendNotification([pcId], 'Vendor Order Pending PC Approval', `${project.name} — ${order.name} (${order.poNumber}) is waiting for your approval.`, `/projects/${project.id}`)
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

  const statusOf = (v: VendorOrder) => work ? vendorStatus(work, v) : 'draft'
  // Only vendors saved before orders went to the PC on save can still be waiting as plain drafts.
  const toSubmit = vendors.filter(v => statusOf(v) === 'draft' && v.pdf)
  const approvedUnsent = vendors.filter(v => statusOf(v) === 'approved')

  // The procurer sends the finished orders (drafts and rejected ones) to the PC, who approves or rejects each vendor.
  async function sendToPc() {
    if (!work || !user) return
    if (toSubmit.length === 0) { setError('Add a vendor first — every vendor needs its PDF.'); return }
    const ids = new Set(toSubmit.map(v => v.id))
    const next = {
      ...work, review: undefined,
      vendors: vendors.map(v => ids.has(v.id) ? { ...v, status: 'with_pc' as const, rejectionReason: undefined, log: [...(v.log ?? []), logEntry('with_pc', 'Sent to PC for approval', user.name)] } : v),
    }
    const route = routeFor(next, project, users)
    const updated = await persist({ procurementWork: next, ...route }, `Vendor orders (${ids.size}) sent by ${user.name} to PC for approval`, STAGE)
    if (updated && route.assignedToId) await sendNotification([route.assignedToId], 'Vendor Orders Pending PC Approval', `${project.name} — ${ids.size} vendor order(s) are waiting for your approval.`, `/projects/${project.id}`)
  }

  // The PC names who sends the approved orders to the vendors (the procurer by default).
  async function assignSender() {
    const person = users.find(u => u.id === personId)
    if (!person || !work) { setError('Choose who will send the orders.'); return }
    const next = { ...work, senderId: person.id, senderName: person.fullName }
    const updated = await persist({ procurementWork: next, ...routeFor(next, project, users) }, `${person.fullName} will send the approved orders to the vendors`, STAGE, { keepOpen: true })
    if (updated) {
      await sendNotification([person.id], 'Send Vendor Orders', `${project.name} — you are to send the approved purchase orders to the vendors.`, `/my-tasks/project/${project.id}`)
      setPersonId('')
    }
  }


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
          {busy ? 'Creating PDF…' : 'Save Vendor & Send to PC'}
        </button>
        <button disabled={busy} onClick={() => { setDraft(null); setError('') }} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Cancel</button>
      </div>
    )
  }

  const hint = isProcurer
    ? 'Add each vendor with its products. A separate purchase-order PDF is made for every vendor, and saving a vendor sends it to the PC for approval.'
    : isPc
      ? 'Approve or reject each vendor order. Approved orders are sent to the vendor by the procurer (or the person you name below).'
      : `Waiting for ${work.procurerName} to create the vendors.`
  return (
    <div className="space-y-3">
      {header}
      <p className="text-sm text-slate-600">{hint}</p>
      <VendorOrdersPanel project={project} users={users} user={user} saving={saving} stage={STAGE} persist={persist}
        onEdit={v => { setDraft({ ...v }); setError('') }} onRemove={removeVendor} />
      {isProcurer && approvedIndent && vendors.length > 0 && remainingItems().length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Still to buy ({remainingItems().length})</p>
          {remainingItems().map(it => <p key={it.id} className="text-xs text-amber-900">{it.description} · {it.qty} {it.unit}</p>)}
        </div>
      )}
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      {isProcurer && (
        <>
          <button onClick={() => { setDraft(blankDraft()); setError('') }} className={`${btn} border border-dashed border-indigo-300 text-indigo-600 flex items-center justify-center gap-1.5`}>
            <Plus size={16} /> {vendors.length > 0 ? 'Add Another Vendor' : 'Add Vendor'}{vendors.length > 0 && remainingItems().length > 0 ? ` (${remainingItems().length} items left)` : ''}
          </button>
          {toSubmit.length > 0 && <button disabled={saving} onClick={sendToPc} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
            Send to PC for Approval ({toSubmit.length})
          </button>}
        </>
      )}
      {isPc && approvedUnsent.length > 0 && (
        <div className="border border-slate-200 rounded-xl p-3 space-y-2">
          <label className={label}>Procurer to send the approved orders{work.senderName ? ` (now: ${work.senderName})` : ` (now: ${work.procurerName})`}</label>
          <select value={personId} onChange={e => setPersonId(e.target.value)} className={input}>{personOptions}</select>
          {personId && <button disabled={saving} onClick={assignSender} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Assign to Send</button>}
        </div>
      )}
    </div>
  )
}
