import { useState } from 'react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { sendNotification } from '../../utils/notifications'
import type { AuthUser, DesignSubmission, DesignWork, ManagedUser, Project, ProjectStage, UserRole } from '../../types'

interface Props {
  project: Project
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage) => Promise<Project | null>
  // Who owns a stage (role + the first person in that role) — the sheet's own lookup.
  responsibleFor: (stage: ProjectStage) => { role?: UserRole; id?: string; name?: string }
}

const newId = () => `dsub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'

// The Design Center stage of a project. The PC assigns an architect and asks for the design; the architect uploads it
// and sends it back; the PC approves (the project moves to Shop Drawing) or rejects with a reason, and the architect
// uploads again until the PC approves. The project's assignedRole/assignedTo* follow whose turn it is, so the work
// shows up in that person's My Tasks.
export function DesignCenterStep({ project, users, user, saving, persist, responsibleFor }: Props) {
  const work = project.designWork
  const subs = work?.submissions ?? []
  const last: DesignSubmission | undefined = subs[subs.length - 1]
  const inReview = !!last && !last.decision
  const rejected = last?.decision === 'rejected'

  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'
  const isArchitect = !!work && (user?.id === work.architectId || user?.role === 'owner')

  const architects = users.filter(u => u.role === 'designer')
  const [architectId, setArchitectId] = useState(work?.architectId ?? '')
  const [brief, setBrief] = useState(work?.brief ?? '')
  const [reassigning, setReassigning] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState('')

  async function assign() {
    const architect = architects.find(a => a.id === architectId)
    if (!architect || !user) { setError('Choose an architect.'); return }
    const next: DesignWork = {
      architectId: architect.id, architectName: architect.fullName, brief: brief.trim() || undefined,
      assignedBy: user.name, assignedAt: new Date().toISOString(), submissions: work?.submissions ?? [],
    }
    const updated = await persist(
      { designWork: next, assignedRole: 'designer', assignedToId: architect.id, assignedToName: architect.fullName },
      `Design requested — assigned to architect ${architect.fullName}`, 'design_center',
    )
    if (updated) await sendNotification([architect.id], 'Design Assigned', `${project.name} — you have been assigned the design.`, `/my-tasks/project/${project.id}`)
  }

  async function submitDesign() {
    if (!work || !user) return
    if (files.length === 0) { setError('Upload the design file(s) first.'); return }
    const submission: DesignSubmission = { id: newId(), files, note: note.trim() || undefined, submittedBy: user.name, submittedAt: new Date().toISOString() }
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    const updated = await persist(
      {
        designWork: { ...work, submissions: [...subs, submission] },
        assignedRole: 'project_coordinator', assignedToId: pc?.id ?? project.coordinatorId, assignedToName: pc?.fullName ?? project.coordinatorName,
      },
      `Design uploaded by ${user.name} — sent to PC for approval`, 'design_center',
    )
    if (updated && pc) await sendNotification([pc.id], 'Design Pending PC Approval', `${project.name} — the architect uploaded the design.`, `/projects/${project.id}`)
  }

  async function approve() {
    if (!work || !last || !user) return
    const decided = subs.map(s => s.id === last.id ? { ...s, decision: 'approved' as const, decidedBy: user.name, decidedAt: new Date().toISOString() } : s)
    const { role, id, name } = responsibleFor('shop_drawing')
    const updated = await persist(
      { designWork: { ...work, submissions: decided }, stage: 'shop_drawing', assignedRole: role, assignedToId: id, assignedToName: name, pendingStageRequest: undefined },
      'PC approved the design — moved to Shop Drawing', 'shop_drawing',
    )
    if (updated) await sendNotification([work.architectId], 'Design Approved', `${project.name} — the PC approved your design.`, `/my-tasks/project/${project.id}`)
  }

  async function reject() {
    if (!work || !last || !user) return
    if (!rejectReason.trim()) { setError('Enter the reason for rejecting.'); return }
    const reason = rejectReason.trim()
    const decided = subs.map(s => s.id === last.id ? { ...s, decision: 'rejected' as const, reason, decidedBy: user.name, decidedAt: new Date().toISOString() } : s)
    const updated = await persist(
      { designWork: { ...work, submissions: decided }, assignedRole: 'designer', assignedToId: work.architectId, assignedToName: work.architectName },
      `PC rejected the design: ${reason}`, 'design_center',
    )
    if (updated) await sendNotification([work.architectId], 'Design Rejected', `${project.name} — PC rejected the design: ${reason}`, `/my-tasks/project/${project.id}`)
  }

  const history = (
    subs.length > 0 && (
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Design history</p>
        {[...subs].reverse().map((s, i) => (
          <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-700">Version {subs.length - i} · {s.submittedBy} · {fmtAt(s.submittedAt)}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : s.decision === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                {s.decision === 'approved' ? 'Approved' : s.decision === 'rejected' ? 'Rejected' : 'In review'}
              </span>
            </div>
            {s.note && <p className="text-xs text-slate-600">{s.note}</p>}
            <MultiFileUploadField label="" files={s.files} onChange={() => {}} readOnly />
            {s.decision === 'rejected' && s.reason && <p className="text-xs text-red-700"><span className="font-bold">Reason:</span> {s.reason}</p>}
          </div>
        ))}
      </div>
    )
  )

  const assignForm = (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Architect *</label>
        <select value={architectId} onChange={e => setArchitectId(e.target.value)} className={input}>
          <option value="">— Select architect —</option>
          {architects.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
        </select>
        {architects.length === 0 && <p className="text-xs text-slate-400 mt-1">No architect (designer) users yet — add one in User Management.</p>}
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">What the design needs <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} className={`${input} resize-none`} />
      </div>
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      <button disabled={saving || !architectId} onClick={assign} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
        {work ? 'Reassign Architect' : 'Assign Architect & Request Design'}
      </button>
    </div>
  )

  // 1. Nobody assigned yet — the PC picks the architect.
  if (!work) {
    return isPc
      ? <div className="space-y-3"><p className="text-sm text-slate-600">Assign an architect and ask for the design.</p>{assignForm}</div>
      : <p className="text-sm text-slate-500 py-6 text-center">Waiting for the PC to assign an architect.</p>
  }

  const assignedLine = (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
      <p className="text-xs text-slate-500">Architect</p>
      <p className="text-sm font-bold text-slate-800">{work.architectName}</p>
      {work.brief && <p className="text-xs text-slate-600">{work.brief}</p>}
    </div>
  )

  // 2. Uploaded — waiting for the PC.
  if (inReview) {
    return (
      <div className="space-y-3">
        {assignedLine}
        {isPc ? (
          <>
            <p className="text-sm text-slate-600">The architect uploaded the design. Review it below, then approve or reject.</p>
            {history}
            {showReject ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Reason for rejecting *</label>
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

  // 3. With the architect — first upload, or re-upload after a rejection.
  return (
    <div className="space-y-3">
      {assignedLine}
      {rejected && last?.reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Rejected by PC</p>
          <p className="text-sm text-red-700 mt-1">{last.reason}</p>
        </div>
      )}
      {isArchitect ? (
        <>
          <p className="text-sm text-slate-600">{rejected ? 'Fix the points above and upload the design again.' : 'Upload the design and send it to the PC for approval.'}</p>
          <MultiFileUploadField label="Design Files" files={files} onChange={setFiles} required uploadButtonLabel="Upload Design Files" />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Note <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
          <button disabled={saving} onClick={submitDesign} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
            Send to PC for Approval
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-500 text-center py-2">Waiting for {work.architectName} to upload the design.</p>
      )}
      {isPc && (
        reassigning
          ? <div className="space-y-2 pt-1">{assignForm}</div>
          : <button onClick={() => setReassigning(true)} className="text-xs font-semibold text-indigo-600 underline">Change architect</button>
      )}
      {history}
    </div>
  )
}
