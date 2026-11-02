import { useState } from 'react'
import { Plus, Trash2, Eye, Download, FileText } from 'lucide-react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { FilePreviewModal } from '../../components/feedback/FilePreviewModal'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from '../../data/materialCategories'
import { generateAndUploadIndentPdf } from '../../utils/materialIndentPdf'
import { deleteRemoteFile } from '../../utils/fileStorage'
import { sendNotification } from '../../utils/notifications'
import type { AuthUser, IndentForm, IndentItem, IndentSubmission, ManagedUser, Project, ProjectStage } from '../../types'

const STAGE: ProjectStage = 'material_intent'

// The title a project shows in My Tasks while it sits in Material Intent (it follows whose turn it is).
export function materialIndentTaskTitle(project: Project): string {
  const last = project.materialIndents?.[project.materialIndents.length - 1]
  if (!last) return 'Prepare Material Indent'
  if (last.decision === 'approved') return 'Move to Procurement'
  if (last.decision === 'rejected') return 'Revise Material Indent'
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
const blankItem = (): IndentItem => ({ id: newId(), category: '', description: '', spec: '', unit: '', qty: '', remarks: '' })

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

  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'
  const isQs = user?.role === 'qs' || user?.role === 'owner'

  const [form, setForm] = useState<IndentForm>(() => {
    if (last) return { ...last.indent, items: last.indent.items.map(i => ({ ...i })) }
    return {
      companyName: 'FGD & Space Krafters',
      projectName: project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name,
      siteLocation: '', date: today(), indentNo: '1',
      preparedBy: user?.name ?? '', checkedBy: '', approvedBy: '', items: [blankItem()],
    }
  })
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; fileName: string } | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState('')

  function edit(patch: Partial<IndentForm>) { setForm(f => ({ ...f, ...patch })); setStale(true) }
  function editItem(id: string, patch: Partial<IndentItem>) { edit({ items: form.items.map(i => i.id === id ? { ...i, ...patch } : i) }) }

  function validate(): string {
    if (!form.projectName.trim()) return 'Enter the project name.'
    if (!form.indentNo.trim()) return 'Enter the indent number.'
    if (!form.date) return 'Choose the date.'
    if (form.items.length === 0) return 'Add at least one item.'
    const bad = form.items.findIndex(i => !i.category || !i.description.trim() || !i.unit.trim() || !i.qty.trim())
    if (bad >= 0) return `Item ${bad + 1}: choose a category and enter the description, unit and quantity.`
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

  async function send() {
    if (!user || !pdf || stale) return
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
      `PC approved material indent ${last.indent.indentNo}`, STAGE,
    )
    if (updated) await sendNotification([last.submittedById], 'Material Indent Approved', `${project.name} — the PC approved material indent ${last.indent.indentNo}.`, `/my-tasks/project/${project.id}`)
  }

  async function reject() {
    if (!last || !user) return
    const reason = rejectReason.trim()
    if (!reason) { setError('Enter the reason for rejecting.'); return }
    const qs = users.find(u => u.id === last.submittedById)
    const updated = await persist(
      { materialIndents: decide('rejected', reason), assignedRole: qs?.role ?? 'qs', assignedToId: last.submittedById, assignedToName: qs?.fullName ?? last.submittedBy },
      `PC rejected material indent ${last.indent.indentNo}: ${reason}`, STAGE,
    )
    if (updated) await sendNotification([last.submittedById], 'Material Indent Rejected', `${project.name} — PC rejected material indent ${last.indent.indentNo}: ${reason}`, `/my-tasks/project/${project.id}`)
  }

  // Procurement is the next stage; the PC holds it until it is assigned, as after Design Center.
  async function moveOn() {
    const pc = pcFor()
    await persist(
      { stage: 'procurement', assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name, pendingStageRequest: undefined },
      'PC moved the project to Procurement', 'procurement',
    )
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
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Approved by PC</p>
          <p className="text-sm text-emerald-700 mt-1">Material indent {last.indent.indentNo} is approved.</p>
        </div>
        {isPc
          ? <button disabled={saving} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>Move to Procurement</button>
          : <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to move the project to Procurement.</p>}
        {history}
      </div>
    )
  }

  // Sent — waiting for the PC.
  if (inReview) {
    return (
      <div className="space-y-3">
        {isPc ? (
          <>
            <p className="text-sm text-slate-600">The QS sent the material indent. Open the PDF below, then approve or reject.</p>
            {history}
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
            ) : (
              <div className="flex gap-2">
                <button disabled={saving} onClick={approve} className={`flex-1 ${btn} text-white`} style={{ background: '#059669' }}>Approve</button>
                <button disabled={saving} onClick={() => setShowReject(true)} className={`flex-1 ${btn} border border-red-200 bg-red-50 text-red-700`}>Reject</button>
              </div>
            )}
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

  // With the QS — first indent, or a revision after a rejection.
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
      <p className="text-sm text-slate-600">Fill in the material indent, create the PDF, then send it to the PC for approval.</p>

      <div className="space-y-3">
        {field('Company Name', 'companyName')}
        {field('Project Name *', 'projectName')}
        {field('Site Location', 'siteLocation')}
        <div className="grid grid-cols-2 gap-3">
          {field('Date *', 'date', 'date')}
          {field('Indent No *', 'indentNo')}
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
        Send to PC for Approval
      </button>
      {history}
    </div>
  )
}
