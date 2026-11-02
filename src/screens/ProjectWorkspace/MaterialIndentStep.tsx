import { useState } from 'react'
import { Plus, Trash2, Eye, Download, FileText } from 'lucide-react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { FilePreviewModal } from '../../components/feedback/FilePreviewModal'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from '../../data/materialCategories'
import { MD_APPROVAL_LIMIT } from '../../data/procurementRules'
import { ROLE_LABELS } from '../../data/permissions'
import { inr, parseAmount } from '../../utils/purchaseOrderMath'
import { generateAndUploadIndentPdf } from '../../utils/materialIndentPdf'
import { deleteRemoteFile } from '../../utils/fileStorage'
import { sendNotification } from '../../utils/notifications'
import type { AuthUser, IndentForm, IndentItem, IndentSubmission, ManagedUser, Project, ProjectStage } from '../../types'

const STAGE: ProjectStage = 'material_intent'

// The title a project shows in My Tasks while it sits in Material Intent (it follows whose turn it is).
export function materialIndentTaskTitle(project: Project): string {
  const last = project.materialIndents?.[project.materialIndents.length - 1]
  if (!last) return 'Prepare Material Indent'
  if (last.decision === 'approved') return 'Assign Procurer & Move to Procurement'
  if (last.decision === 'rejected') return 'Revise Material Indent'
  if (last.sentToMd) return 'Approve Material Indent (over limit)'
  return 'Review Material Indent'
}

interface Props {
  project: Project
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage) => Promise<Project | null>
}

const newId = () => `ind_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const today = () => new Date().toISOString().slice(0, 10)
const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const blankItem = (): IndentItem => ({ id: newId(), category: '', description: '', spec: '', unit: '', qty: '', rate: '', remarks: '' })

const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'text-xs font-semibold text-slate-500 mb-1 block'

// Material Intent runs the Design Center loop, but the QS fills in a Material Indent Form instead of uploading a file.
// The form becomes a PDF (view / download / delete); the QS sends it to the PC, who approves or rejects with a reason.
// A rejected indent comes back pre-filled for the QS to fix. Approval does not move the stage by itself — the PC does.
export function MaterialIndentStep({ project, users, user, saving, persist }: Props) {
  const subs = project.materialIndents ?? []
  const last: IndentSubmission | undefined = subs[subs.length - 1]
  const inReview = !!last && !last.decision
  const rejected = last?.decision === 'rejected'
  const approved = last?.decision === 'approved'
  // Over the limit the PC cannot approve: it goes to the MD, and the QS keeps working on it until the MD decides.
  const withMd = inReview && !!last?.sentToMd
  const amount = parseAmount(last?.indent.estimatedAmount)
  const overLimit = amount > MD_APPROVAL_LIMIT

  const isOwner = user?.role === 'owner'
  const isPc = user?.role === 'project_coordinator' || isOwner
  const isQs = user?.role === 'qs' || isOwner
  const qsRevising = withMd && user?.role === 'qs'

  const [form, setForm] = useState<IndentForm>(() => {
    if (last) return { ...last.indent, items: last.indent.items.map(i => ({ ...i })) }
    return {
      companyName: 'FGD & Space Krafters',
      projectName: project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name,
      siteLocation: '', date: today(), indentNo: '1',
      preparedBy: user?.name ?? '', checkedBy: '', approvedBy: '', items: [blankItem()], estimatedAmount: '',
    }
  })
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; fileName: string } | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [nextPersonId, setNextPersonId] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState('')

  // The estimated amount is always the sum of qty × rate over the items.
  const lineAmount = (i: IndentItem) => parseAmount(i.qty) * parseAmount(i.rate)
  function edit(patch: Partial<IndentForm>) {
    setForm(f => {
      const next = { ...f, ...patch }
      next.estimatedAmount = String(Math.round(next.items.reduce((s, i) => s + lineAmount(i), 0) * 100) / 100)
      return next
    })
    setStale(true)
  }
  function editItem(id: string, patch: Partial<IndentItem>) { edit({ items: form.items.map(i => i.id === id ? { ...i, ...patch } : i) }) }

  function validate(): string {
    if (!form.projectName.trim()) return 'Enter the project name.'
    if (!form.indentNo.trim()) return 'Enter the indent number.'
    if (!form.date) return 'Choose the date.'
    if (form.items.length === 0) return 'Add at least one item.'
    const bad = form.items.findIndex(i => !i.category || !i.description.trim() || !i.unit.trim() || !i.qty.trim() || parseAmount(i.rate) <= 0)
    if (bad >= 0) return `Item ${bad + 1}: choose a category and enter the description, unit, quantity and rate.`
    return ''
  }

  async function generate() {
    const problem = validate()
    if (problem) { setError(problem); return }
    setError(''); setBusy(true)
    try {
      const made = await generateAndUploadIndentPdf(form)
      if (pdf) await deleteRemoteFile(pdf.url)
      setPdf(made); setStale(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.')
    } finally { setBusy(false) }
  }

  async function removePdf() {
    if (!pdf) return
    await deleteRemoteFile(pdf.url)
    setPdf(null)
  }

  function download() {
    if (!pdf) return
    const url = URL.createObjectURL(pdf.blob)
    const a = document.createElement('a')
    a.href = url; a.download = pdf.fileName
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function pcFor(): { id: string; name: string } {
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    return { id: pc?.id ?? project.coordinatorId, name: pc?.fullName ?? project.coordinatorName }
  }

  function mdFor(): { id: string; name: string } {
    const md = users.find(u => u.role === 'owner')
    return { id: md?.id ?? '', name: md?.fullName ?? 'MD' }
  }

  async function send() {
    if (!user || !pdf || stale) return
    // The QS revising while the MD decides: the waiting indent is replaced in place and goes back to the MD.
    if (qsRevising && last) {
      const md = mdFor()
      const revised = subs.map(s => s.id === last.id ? { ...s, files: [pdf.url], indent: form, submittedAt: new Date().toISOString() } : s)
      const updated = await persist(
        { materialIndents: revised, assignedRole: 'owner', assignedToId: md.id, assignedToName: md.name },
        `Material indent ${form.indentNo} updated by ${user.name} while with the MD`, STAGE,
      )
      if (updated && md.id) await sendNotification([md.id], 'Material Indent Updated', `${project.name} — the QS updated material indent ${form.indentNo}.`, `/projects/${project.id}`)
      return
    }
    const submission: IndentSubmission = {
      id: newId(), files: [pdf.url], indent: form, submittedBy: user.name, submittedById: user.id, submittedAt: new Date().toISOString(),
    }
    const pc = pcFor()
    const updated = await persist(
      { materialIndents: [...subs, submission], assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name },
      `Material indent ${form.indentNo} sent by ${user.name} to PC for approval`, STAGE,
    )
    if (updated) await sendNotification([pc.id], 'Material Indent Pending PC Approval', `${project.name} — the QS sent material indent ${form.indentNo}.`, `/projects/${project.id}`)
  }

  function decide(decision: 'approved' | 'rejected', reason?: string): IndentSubmission[] {
    return subs.map(s => s.id === last?.id ? { ...s, decision, reason, decidedBy: user?.name, decidedAt: new Date().toISOString() } : s)
  }

  async function approve() {
    if (!last || !user) return
    const pc = pcFor()
    const updated = await persist(
      { materialIndents: decide('approved'), assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name },
      `${isOwner ? 'MD' : 'PC'} approved material indent ${last.indent.indentNo}`, STAGE,
    )
    if (updated) await sendNotification([last.submittedById], 'Material Indent Approved', `${project.name} — ${isOwner ? 'the MD' : 'the PC'} approved material indent ${last.indent.indentNo}.`, `/my-tasks/project/${project.id}`)
  }

  // The PC forwards the indent to the MD (required above the limit, optional below it).
  async function sendToMd() {
    if (!last || !user) return
    const md = mdFor()
    const forwarded = subs.map(s => s.id === last.id ? { ...s, sentToMd: { by: user.name, byId: user.id, at: new Date().toISOString() } } : s)
    const updated = await persist(
      { materialIndents: forwarded, assignedRole: 'owner', assignedToId: md.id, assignedToName: md.name },
      `PC sent material indent ${last.indent.indentNo} to the MD for approval`, STAGE,
    )
    if (updated) {
      const owners = users.filter(u => u.role === 'owner').map(u => u.id)
      await sendNotification(owners, 'Material Indent Pending MD Approval', `${project.name} — material indent ${last.indent.indentNo} (about Rs. ${inr(amount)}) needs your approval.`, `/projects/${project.id}`)
      await sendNotification([last.submittedById], 'Material Indent Sent to MD', `${project.name} — the PC sent material indent ${last.indent.indentNo} to the MD. You can keep revising it until the MD decides.`, `/my-tasks/project/${project.id}`)
    }
  }

  async function reject() {
    if (!last || !user) return
    const reason = rejectReason.trim()
    if (!reason) { setError('Enter the reason for rejecting.'); return }
    const qs = users.find(u => u.id === last.submittedById)
    const updated = await persist(
      { materialIndents: decide('rejected', reason), assignedRole: qs?.role ?? 'qs', assignedToId: last.submittedById, assignedToName: qs?.fullName ?? last.submittedBy },
      `${isOwner ? 'MD' : 'PC'} rejected material indent ${last.indent.indentNo}: ${reason}`, STAGE,
    )
    if (updated) await sendNotification([last.submittedById], 'Material Indent Rejected', `${project.name} — ${isOwner ? 'MD' : 'PC'} rejected material indent ${last.indent.indentNo}: ${reason}`, `/my-tasks/project/${project.id}`)
  }

  // The PC picks the procurer and moves the project to Procurement; the approved indent goes along with them.
  async function moveOn() {
    const person = users.find(u => u.id === nextPersonId)
    if (!person || !user) { setError('Choose the procurer.'); return }
    const updated = await persist(
      {
        stage: 'procurement', assignedRole: person.role, assignedToId: person.id, assignedToName: person.fullName, pendingStageRequest: undefined,
        procurementWork: { procurerId: person.id, procurerName: person.fullName, assignedBy: user.name, assignedAt: new Date().toISOString(), vendors: [] },
      },
      `PC moved the project to Procurement — assigned to ${person.fullName}`, 'procurement',
    )
    if (updated) await sendNotification([person.id], 'Procurement Assigned', `${project.name} — you have been assigned Procurement. The approved material indent is attached.`, `/my-tasks/project/${project.id}`)
  }

  const history = subs.length > 0 && (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Material indent history</p>
      {[...subs].reverse().map((s, i) => (
        <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">Indent {s.indent.indentNo} · v{subs.length - i} · {s.submittedBy} · {fmtAt(s.submittedAt)}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : s.decision === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
              {s.decision === 'approved' ? 'Approved' : s.decision === 'rejected' ? 'Rejected' : 'In review'}
            </span>
          </div>
          <MultiFileUploadField label="" files={s.files} onChange={() => {}} readOnly />
          {s.decision === 'rejected' && s.reason && <p className="text-xs text-red-700"><span className="font-bold">Reason:</span> {s.reason}</p>}
        </div>
      ))}
    </div>
  )

  // Approved — the PC moves the project on.
  if (approved) {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Approved by {last.decidedBy ?? 'PC'}</p>
          <p className="text-sm text-emerald-700 mt-1">Material indent {last.indent.indentNo} is approved.</p>
        </div>
        {isPc ? (
          <>
            <div>
              <label className={label}>Procurer *</label>
              <select value={nextPersonId} onChange={e => setNextPersonId(e.target.value)} className={input}>
                <option value="">— Select —</option>
                {[...users].sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
              </select>
            </div>
            {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
            <button disabled={saving || !nextPersonId} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>Assign Procurer & Move to Procurement</button>
          </>
        ) : <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to assign a procurer and move the project to Procurement.</p>}
        {history}
      </div>
    )
  }

  // Sent — waiting for the PC (or, over the limit, the MD). The QS revising for the MD gets the form below instead.
  if (inReview && !qsRevising) {
    const mdTurn = withMd && !isOwner
    const canDecide = isOwner || (isPc && !withMd)
    return (
      <div className="space-y-3">
        {isPc ? (
          <>
            <p className="text-sm text-slate-600">The QS sent the material indent. Open the PDF below, then {canDecide ? 'decide' : 'wait for the MD'}.</p>
            <div className={`rounded-xl border p-3 text-sm ${overLimit ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              Estimated amount: <span className="font-bold">Rs. {inr(amount)}</span>
              {overLimit
                ? ` — above Rs. ${inr(MD_APPROVAL_LIMIT)}, so the MD must approve it.`
                : ` — Rs. ${inr(MD_APPROVAL_LIMIT)} or less, so the PC can approve it.`}
              {withMd && <span className="block text-xs mt-1">Sent to the MD by {last?.sentToMd?.by}. The QS can keep revising until the MD decides.</span>}
            </div>
            {history}
            {mdTurn && <p className="text-sm text-slate-500 text-center py-1">Waiting for the MD to approve or reject.</p>}
            {showReject ? (
              <div className="space-y-2">
                <label className={label}>Reason for rejecting *</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className={`${input} resize-none`} />
                {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                <div className="flex gap-2">
                  <button disabled={saving} onClick={reject} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>Confirm Reject</button>
                  <button onClick={() => { setShowReject(false); setRejectReason(''); setError('') }} className={`flex-1 ${btn} border border-slate-200 bg-white text-slate-600`}>Back</button>
                </div>
              </div>
            ) : canDecide ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {(isOwner || !overLimit) && <button disabled={saving} onClick={approve} className={`flex-1 ${btn} text-white`} style={{ background: '#059669' }}>Approve</button>}
                  {!isOwner && overLimit && <button disabled={saving} onClick={sendToMd} className={`flex-1 ${btn} text-white`} style={{ background: '#0F2A4A' }}>Send to MD for Approval</button>}
                  <button disabled={saving} onClick={() => setShowReject(true)} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>Reject</button>
                </div>
                {!isOwner && !overLimit && (
                  <button disabled={saving} onClick={sendToMd} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Send to MD for Approval instead</button>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 text-center py-2">Sent to the PC — waiting for approval.</p>
            {history}
          </>
        )}
      </div>
    )
  }

  // With the QS — first indent, a revision after a rejection, or work on it while the MD decides.
  if (!isQs) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 text-center py-4">Waiting for the QS to prepare the material indent.</p>
        {history}
      </div>
    )
  }

  const field = (text: string, key: keyof Omit<IndentForm, 'items'>, type = 'text') => (
    <div>
      <label className={label}>{text}</label>
      <input type={type} value={form[key]} onChange={e => edit({ [key]: e.target.value })} className={input} />
    </div>
  )
  // Prepared / Checked / Approved By: pick from everyone (the name is what prints on the PDF).
  const names = [...new Set(users.map(u => u.fullName))].sort((a, b) => a.localeCompare(b))
  const personField = (text: string, key: 'preparedBy' | 'checkedBy' | 'approvedBy') => (
    <div>
      <label className={label}>{text}</label>
      <select value={form[key]} onChange={e => edit({ [key]: e.target.value })} className={input}>
        <option value="">— Select —</option>
        {[...names, ...(form[key] && !names.includes(form[key]) ? [form[key]] : [])].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )


  return (
    <div className="space-y-4">
      {rejected && last?.reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Rejected by PC</p>
          <p className="text-sm text-red-700 mt-1">{last.reason}</p>
        </div>
      )}
      {qsRevising && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">With the MD</p>
          <p className="text-sm text-amber-800 mt-1">Your indent is waiting for MD approval. You can keep working on it; send the updated PDF to the MD when ready.</p>
        </div>
      )}
      <p className="text-sm text-slate-600">Fill in the material indent, create the PDF, then send it to the {qsRevising ? 'MD' : 'PC'} for approval.</p>

      <div className="space-y-3">
        {field('Company Name', 'companyName')}
        {field('Project Name *', 'projectName')}
        {field('Site Location', 'siteLocation')}
        <div className="grid grid-cols-2 gap-3">
          {field('Date *', 'date', 'date')}
          {field('Indent No *', 'indentNo')}
        </div>
        <div>
          <label className={label}>Estimated Amount (Rs.) — total of qty × rate</label>
          <div className={`${input} font-bold text-slate-800`}>{inr(parseAmount(form.estimatedAmount))}</div>
          <p className="text-[11px] text-slate-400 mt-1">Above Rs. {inr(MD_APPROVAL_LIMIT)} the MD must approve the indent; otherwise the PC can.</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Materials</p>
        {form.items.map((it, idx) => (
          <div key={it.id} className="border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700">S.No {idx + 1}</p>
              <button onClick={() => edit({ items: form.items.filter(i => i.id !== it.id) })} aria-label={`Remove item ${idx + 1}`} className="p-1 text-red-500"><Trash2 size={16} /></button>
            </div>
            <div>
              <label className={label}>Category *</label>
              <select value={it.category} onChange={e => editItem(it.id, { category: e.target.value })} className={input}>
                <option value="">— Select —</option>
                {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Description *</label>
              <textarea value={it.description} onChange={e => editItem(it.id, { description: e.target.value })} rows={2} className={`${input} resize-none`} />
            </div>
            <div>
              <label className={label}>Specification / Brand</label>
              <input value={it.spec} onChange={e => editItem(it.id, { spec: e.target.value })} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Unit *</label>
                <select value={it.unit} onChange={e => editItem(it.id, { unit: e.target.value })} className={input}>
                  <option value="">— Select —</option>
                  {[...MATERIAL_UNITS, ...(it.unit && !MATERIAL_UNITS.includes(it.unit) ? [it.unit] : [])].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Qty *</label>
                <input value={it.qty} onChange={e => editItem(it.id, { qty: e.target.value })} inputMode="decimal" className={input} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Rate (Rs. per unit) *</label>
                <input value={it.rate ?? ''} onChange={e => editItem(it.id, { rate: e.target.value })} inputMode="decimal" className={input} />
              </div>
              <div>
                <label className={label}>Amount (Rs.)</label>
                <div className={`${input} text-slate-600`}>{inr(lineAmount(it))}</div>
              </div>
            </div>
            <div>
              <label className={label}>Remarks</label>
              <input value={it.remarks} onChange={e => editItem(it.id, { remarks: e.target.value })} className={input} />
            </div>
          </div>
        ))}
        <button onClick={() => edit({ items: [...form.items, blankItem()] })} className={`${btn} border border-dashed border-indigo-300 text-indigo-600 flex items-center justify-center gap-1.5`}>
          <Plus size={16} /> Add Item
        </button>
      </div>

      <div className="space-y-3">
        {personField('Prepared By', 'preparedBy')}
        {personField('Checked By', 'checkedBy')}
        {personField('Approved By', 'approvedBy')}
      </div>

      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

      {pdf && (
        <div className="border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-indigo-600 shrink-0" />
            <p className="text-sm font-semibold text-slate-700 truncate">{pdf.fileName}</p>
          </div>
          {stale && <p className="text-xs text-amber-700 font-semibold">The form changed after this PDF was made — create it again before sending.</p>}
          <div className="flex gap-2">
            <button onClick={() => setPreview(true)} className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"><Eye size={14} /> View</button>
            <button onClick={download} className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"><Download size={14} /> Download</button>
            <button onClick={removePdf} className="flex-1 py-2 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-700 flex items-center justify-center gap-1.5"><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      )}
      {preview && pdf && <FilePreviewModal src={pdf.url} name={pdf.fileName} onClose={() => setPreview(false)} />}

      <button disabled={busy || saving} onClick={generate} className={`${btn} border border-indigo-300 text-indigo-700 bg-white`}>
        {busy ? 'Creating PDF…' : pdf ? 'Create PDF Again' : 'Create PDF'}
      </button>
      <button disabled={saving || busy || !pdf || stale} onClick={send} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
        {qsRevising ? 'Send Updated Indent to MD' : 'Send to PC for Approval'}
      </button>
      {history}
    </div>
  )
}
