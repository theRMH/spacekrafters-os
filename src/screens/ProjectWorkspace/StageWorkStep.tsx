import { useState } from 'react'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { materialIndentTaskTitle } from './MaterialIndentStep'
import { sendNotification } from '../../utils/notifications'
import { ROLE_LABELS } from '../../data/permissions'
import type { AuthUser, DesignSubmission, DesignWork, ManagedUser, Project, ProjectStage } from '../../types'

type WorkStage = 'design_center' | 'shop_drawing'

interface StageConfig {
  key: 'designWork' | 'shopDrawingWork'
  assignee: string          // who does the work: Architect / QS
  deliverable: string       // what they upload
  nextStage: ProjectStage
  nextLabel: string
  // Shop Drawing ends by choosing the QS who takes the next stage; Design Center just moves on.
  pickNextAssignee: boolean
}

export const STAGE_WORK: Record<WorkStage, StageConfig> = {
  design_center: { key: 'designWork',      assignee: 'Architect', deliverable: 'design',          nextStage: 'shop_drawing',    nextLabel: 'Shop Drawing',    pickNextAssignee: false },
  shop_drawing:  { key: 'shopDrawingWork', assignee: 'QS',        deliverable: '2D shop drawing', nextStage: 'material_intent', nextLabel: 'Material Intent', pickNextAssignee: true  },
}

export function isWorkStage(stage: ProjectStage): stage is WorkStage { return stage in STAGE_WORK }

// The latest upload of a stage's work, and whether the PC has approved it.
function lastSubmission(work?: DesignWork): DesignSubmission | undefined { return work?.submissions[work.submissions.length - 1] }

// The title a project shows in My Tasks while it sits in one of these stages (it follows whose turn it is).
export function stageTaskTitle(project: Project): string | null {
  if (project.stage === 'material_intent') return materialIndentTaskTitle(project)
  if (!isWorkStage(project.stage)) return null
  const cfg = STAGE_WORK[project.stage]
  const work = project[cfg.key]
  const last = lastSubmission(work)
  if (!work) return `Assign ${cfg.assignee}`
  if (last?.decision === 'approved') return cfg.pickNextAssignee ? `Assign QS & Move to ${cfg.nextLabel}` : `Move to ${cfg.nextLabel}`
  if (last) return `Review ${cfg.deliverable}`
  return `Upload ${cfg.deliverable}`
}

interface Props {
  project: Project
  stage: WorkStage
  users: ManagedUser[]
  user: AuthUser | null
  saving: boolean
  persist: (patch: Partial<Project>, historyNote: string, historyStage: ProjectStage) => Promise<Project | null>
}

const newId = () => `dsub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
const input = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'

// Design Center and Shop Drawing run the same loop. The PC assigns someone and asks for the work; they upload it and
// send it to the PC; the PC approves or rejects with a reason, and they upload again until it is approved. Approval
// does not move the stage by itself — the person is told it is approved and the PC then moves the project on. The
// project's assignedRole/assignedTo* follow whose turn it is, so the work shows up in that person's My Tasks.
export function StageWorkStep({ project, stage, users, user, saving, persist }: Props) {
  const cfg = STAGE_WORK[stage]
  const work = project[cfg.key]
  const subs = work?.submissions ?? []
  const last = lastSubmission(work)
  const inReview = !!last && !last.decision
  const rejected = last?.decision === 'rejected'
  const approved = last?.decision === 'approved'

  const isPc = user?.role === 'project_coordinator' || user?.role === 'owner'
  const isAssignee = !!work && (user?.id === work.architectId || user?.role === 'owner')

  // Shop Drawing is sent the design the PC approved in Design Center.
  const designFiles = stage === 'shop_drawing'
    ? (project.designWork?.submissions ?? []).filter(s => s.decision === 'approved').flatMap(s => s.files)
    : []

  const everyone = [...users].sort((a, b) => a.fullName.localeCompare(b.fullName))
  const [personId, setPersonId] = useState(work?.architectId ?? '')
  const [nextPersonId, setNextPersonId] = useState('')
  const [brief, setBrief] = useState(work?.brief ?? '')
  const [reassigning, setReassigning] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [error, setError] = useState('')

  const personOptions = (
    <>
      <option value="">— Select —</option>
      {everyone.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.role ? ` · ${ROLE_LABELS[u.role] ?? u.role}` : ''}</option>)}
    </>
  )

  async function assign() {
    const person = users.find(u => u.id === personId)
    if (!person || !user) { setError(`Choose the ${cfg.assignee.toLowerCase()}.`); return }
    const next: DesignWork = {
      architectId: person.id, architectName: person.fullName, brief: brief.trim() || undefined,
      assignedBy: user.name, assignedAt: new Date().toISOString(), submissions: subs,
    }
    const updated = await persist(
      { [cfg.key]: next, assignedRole: person.role, assignedToId: person.id, assignedToName: person.fullName },
      `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} requested — assigned to ${cfg.assignee} ${person.fullName}`, stage,
    )
    if (updated) await sendNotification([person.id], `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} Assigned`, `${project.name} — you have been assigned the ${cfg.deliverable}.`, `/my-tasks/project/${project.id}`)
  }

  function pcFor(): { id: string; name: string } {
    const pc = users.find(u => u.id === project.coordinatorId) ?? users.find(u => u.role === 'project_coordinator')
    return { id: pc?.id ?? project.coordinatorId, name: pc?.fullName ?? project.coordinatorName }
  }

  async function submitWork() {
    if (!work || !user) return
    if (files.length === 0) { setError(`Upload the ${cfg.deliverable} file(s) first.`); return }
    const submission: DesignSubmission = { id: newId(), files, note: note.trim() || undefined, submittedBy: user.name, submittedAt: new Date().toISOString() }
    const pc = pcFor()
    const updated = await persist(
      { [cfg.key]: { ...work, submissions: [...subs, submission] }, assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name },
      `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} uploaded by ${user.name} — sent to PC for approval`, stage,
    )
    if (updated) await sendNotification([pc.id], `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} Pending PC Approval`, `${project.name} — the ${cfg.assignee} uploaded the ${cfg.deliverable}.`, `/projects/${project.id}`)
  }

  function decide(decision: 'approved' | 'rejected', reason?: string): DesignSubmission[] {
    return subs.map(s => s.id === last?.id ? { ...s, decision, reason, decidedBy: user?.name, decidedAt: new Date().toISOString() } : s)
  }

  // The PC approves: the assignee is told, and the PC is next to move the project on.
  async function approve() {
    if (!work || !last || !user) return
    const pc = pcFor()
    const updated = await persist(
      { [cfg.key]: { ...work, submissions: decide('approved') }, assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name },
      `PC approved the ${cfg.deliverable}`, stage,
    )
    if (updated) await sendNotification([work.architectId], `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} Approved`, `${project.name} — the PC approved your ${cfg.deliverable}.`, `/my-tasks/project/${project.id}`)
  }

  async function reject() {
    if (!work || !last || !user) return
    const reason = rejectReason.trim()
    if (!reason) { setError('Enter the reason for rejecting.'); return }
    const person = users.find(u => u.id === work.architectId)
    const updated = await persist(
      { [cfg.key]: { ...work, submissions: decide('rejected', reason) }, assignedRole: person?.role ?? 'designer', assignedToId: work.architectId, assignedToName: work.architectName },
      `PC rejected the ${cfg.deliverable}: ${reason}`, stage,
    )
    if (updated) await sendNotification([work.architectId], `${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} Rejected`, `${project.name} — PC rejected the ${cfg.deliverable}: ${reason}`, `/my-tasks/project/${project.id}`)
  }

  // The PC moves the project to the next stage. Design Center → Shop Drawing starts with the PC (who assigns the QS
  // there); Shop Drawing → Material Intent goes to the QS the PC picks.
  async function moveOn() {
    if (!user) return
    let patch: Partial<Project>
    if (cfg.pickNextAssignee) {
      const person = users.find(u => u.id === nextPersonId)
      if (!person) { setError('Choose the QS for the next stage.'); return }
      patch = { stage: cfg.nextStage, assignedRole: person.role, assignedToId: person.id, assignedToName: person.fullName }
    } else {
      const pc = pcFor()
      patch = { stage: cfg.nextStage, assignedRole: 'project_coordinator', assignedToId: pc.id, assignedToName: pc.name }
    }
    const updated = await persist({ ...patch, pendingStageRequest: undefined }, `PC moved the project to ${cfg.nextLabel}`, cfg.nextStage)
    if (updated && patch.assignedToId && cfg.pickNextAssignee) {
      await sendNotification([patch.assignedToId], `${cfg.nextLabel} Assigned`, `${project.name} — you have been assigned ${cfg.nextLabel}.`, `/my-tasks/project/${project.id}`)
    }
  }

  const history = subs.length > 0 && (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{cfg.deliverable} history</p>
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

  // The approved design, sent along with the Shop Drawing request.
  const designReference = designFiles.length > 0 && (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1.5">
      <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Approved design (from Design Center)</p>
      <MultiFileUploadField label="" files={designFiles} onChange={() => {}} readOnly />
    </div>
  )

  const assignForm = (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">{cfg.assignee} *</label>
        <select value={personId} onChange={e => setPersonId(e.target.value)} className={input}>{personOptions}</select>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">What is needed <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} className={`${input} resize-none`} />
      </div>
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      <button disabled={saving || !personId} onClick={assign} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
        {work ? `Reassign ${cfg.assignee}` : `Assign ${cfg.assignee} & Request ${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)}`}
      </button>
    </div>
  )

  // 1. Nobody assigned yet — the PC picks.
  if (!work) {
    return isPc ? (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Assign the {cfg.assignee.toLowerCase()} and ask for the {cfg.deliverable}.{designFiles.length > 0 ? ' The approved design below is sent to them with the request.' : ''}</p>
        {designReference}
        {assignForm}
      </div>
    ) : <p className="text-sm text-slate-500 py-6 text-center">Waiting for the PC to assign the {cfg.assignee.toLowerCase()}.</p>
  }

  const assignedLine = (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
      <p className="text-xs text-slate-500">{cfg.assignee}</p>
      <p className="text-sm font-bold text-slate-800">{work.architectName}</p>
      {work.brief && <p className="text-xs text-slate-600">{work.brief}</p>}
    </div>
  )

  // 2. Approved — the assignee sees it is approved; the PC moves the project on.
  if (approved) {
    return (
      <div className="space-y-3">
        {assignedLine}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Approved by PC</p>
          <p className="text-sm text-emerald-700 mt-1">The {cfg.deliverable} is approved.</p>
        </div>
        {isPc ? (
          <>
            {cfg.pickNextAssignee && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Assign QS for {cfg.nextLabel} *</label>
                <select value={nextPersonId} onChange={e => setNextPersonId(e.target.value)} className={input}>{personOptions}</select>
              </div>
            )}
            {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
            <button disabled={saving || (cfg.pickNextAssignee && !nextPersonId)} onClick={moveOn} className={`${btn} text-white`} style={{ background: '#059669' }}>
              {cfg.pickNextAssignee ? `Assign QS & Move to ${cfg.nextLabel}` : `Move to ${cfg.nextLabel}`}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center py-1">Waiting for the PC to move the project to {cfg.nextLabel}.</p>
        )}
        {history}
      </div>
    )
  }

  // 3. Uploaded — waiting for the PC.
  if (inReview) {
    return (
      <div className="space-y-3">
        {assignedLine}
        {isPc ? (
          <>
            <p className="text-sm text-slate-600">The {cfg.assignee.toLowerCase()} uploaded the {cfg.deliverable}. Review it below, then approve or reject.</p>
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

  // 4. With the assignee — first upload, or re-upload after a rejection.
  return (
    <div className="space-y-3">
      {assignedLine}
      {designReference}
      {rejected && last?.reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Rejected by PC</p>
          <p className="text-sm text-red-700 mt-1">{last.reason}</p>
        </div>
      )}
      {isAssignee ? (
        <>
          <p className="text-sm text-slate-600">{rejected ? `Fix the points above and upload the ${cfg.deliverable} again.` : `Upload the ${cfg.deliverable} and send it to the PC for approval.`}</p>
          <MultiFileUploadField label={`${cfg.deliverable[0].toUpperCase()}${cfg.deliverable.slice(1)} Files`} files={files} onChange={setFiles} required uploadButtonLabel="Upload Files" />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Note <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
          <button disabled={saving} onClick={submitWork} className={`${btn} text-white`} style={{ background: '#0F2A4A' }}>
            Send to PC for Approval
          </button>
        </>
      ) : (
        <p className="text-sm text-slate-500 text-center py-2">Waiting for {work.architectName} to upload the {cfg.deliverable}.</p>
      )}
      {isPc && (
        reassigning
          ? <div className="space-y-2 pt-1">{assignForm}</div>
          : <button onClick={() => setReassigning(true)} className="text-xs font-semibold text-indigo-600 underline">Change {cfg.assignee.toLowerCase()}</button>
      )}
      {history}
    </div>
  )
}

