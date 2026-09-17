import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Check, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllDailyTasks, upsertDailyTask, updateDailyTaskStatus, deleteDailyTask } from '../../services/dailyTaskService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getRoleDisplayLabel } from '../../data/permissions'
import type { DailyTask, DailyTaskStatus, ManagedUser } from '../../types'

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmtDate(dateKey: string): string {
  const d = new Date(dateKey)
  if (isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const STATUS_STYLE: Record<DailyTaskStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  done:    'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function DailyTasksScreen() {
  const { user, can } = useAuth()
  const canAssign = can('assign_daily_task')

  const [tasks, setTasks] = useState<DailyTask[]>([])
  const [team, setTeam] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const todayKey = toDateKey(new Date())

  async function refresh() {
    setIsLoading(true)
    const [t, dir] = await Promise.all([getAllDailyTasks(), canAssign ? getManagedUsersDirectory() : Promise.resolve([])])
    setTasks(t)
    setTeam(dir)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [canAssign])

  // MD's roster to assign into — everyone except MD's own account.
  const assignableMembers = useMemo(
    () => team.filter(m => m.status === 'active' && m.id !== user?.id),
    [team, user?.id],
  )

  function tasksFor(assigneeId: string): DailyTask[] {
    return tasks
      .filter(t => t.assigneeId === assigneeId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }

  const myTasks = user ? tasksFor(user.id) : []

  // MD assign sheet — pick a member, see their tasks, assign a new one.
  const [assignTarget, setAssignTarget] = useState<ManagedUser | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayKey)
  const [deleteTarget, setDeleteTarget] = useState<DailyTask | null>(null)

  function openAssign(member: ManagedUser) {
    setAssignTarget(member)
    setTitle('')
    setNotes('')
    setDate(todayKey)
  }

  async function handleAssign() {
    if (!user || !assignTarget) return
    if (!title.trim()) { setSnack({ open: true, msg: 'Enter what to assign.', type: 'error' }); return }
    if (date < todayKey) { setSnack({ open: true, msg: 'Cannot assign a task for a past date.', type: 'error' }); return }
    const now = new Date().toISOString()
    const task: DailyTask = {
      id: `dtask_${assignTarget.id}_${Date.now()}`,
      assigneeId: assignTarget.id,
      assigneeName: assignTarget.fullName,
      title: title.trim(),
      notes: notes.trim() || undefined,
      date,
      status: 'pending',
      assignedBy: user.name,
      createdAt: now,
      updatedAt: now,
    }
    setTasks(prev => [task, ...prev])
    setTitle(''); setNotes('')
    const result = await upsertDailyTask(task)
    if (!result.ok) {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      setSnack({ open: true, msg: result.error ?? 'Could not assign task.', type: 'error' })
      return
    }
    setSnack({ open: true, msg: `Assigned to ${assignTarget.fullName}.`, type: 'success' })
  }

  async function toggleStatus(task: DailyTask) {
    const nextStatus: DailyTaskStatus = task.status === 'pending' ? 'done' : 'pending'
    const updated: DailyTask = { ...task, status: nextStatus, updatedAt: new Date().toISOString() }
    setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)))
    const result = await updateDailyTaskStatus(updated)
    if (!result.ok) {
      setTasks(prev => prev.map(t => (t.id === task.id ? task : t)))
      setSnack({ open: true, msg: result.error ?? 'Could not update task.', type: 'error' })
    }
  }

  async function confirmDeleteTask() {
    if (!deleteTarget) return
    const target = deleteTarget
    setTasks(prev => prev.filter(t => t.id !== target.id))
    setDeleteTarget(null)
    const result = await deleteDailyTask(target.id)
    if (!result.ok) {
      setTasks(prev => [target, ...prev])
      setSnack({ open: true, msg: result.error ?? 'Could not remove task.', type: 'error' })
    }
  }

  function renderTaskRow(task: DailyTask, opts: { showAssignedBy?: boolean; canManage?: boolean } = {}) {
    return (
      <div key={task.id} className="bg-white rounded-2xl border border-slate-100 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{task.title}</p>
            {task.notes && <p className="text-xs text-slate-500 mt-0.5">{task.notes}</p>}
            <p className="text-[11px] text-slate-400 mt-1">
              {fmtDate(task.date)}{opts.showAssignedBy ? ` · Assigned by ${task.assignedBy}` : ''}
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[task.status]}`}>
            {task.status}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          {!opts.canManage && (
            <button onClick={() => toggleStatus(task)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold active:opacity-80 ${
                task.status === 'done' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white'
              }`}>
              <Check size={13} /> {task.status === 'done' ? 'Mark Pending' : 'Mark Done'}
            </button>
          )}
          {opts.canManage && (
            <button onClick={() => setDeleteTarget(task)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 active:opacity-70">
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100">
        <h1 className="text-base font-extrabold text-slate-800">Daily Task</h1>
        <p className="text-[11px] text-slate-400 mt-1">
          {canAssign ? 'Assign day-to-day tasks directly to any team member.' : 'Tasks assigned to you — tap Mark Done once complete.'}
        </p>
      </div>

      {canAssign ? (
        <div className="px-4 pt-4 space-y-2.5">
          {!isLoading && assignableMembers.map(member => {
            const memberTasks = tasksFor(member.id)
            const pendingCount = memberTasks.filter(t => t.status === 'pending').length
            return (
              <button key={member.id} onClick={() => openAssign(member)}
                className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 active:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{member.fullName}</p>
                    <p className="text-[11px] text-slate-400">{getRoleDisplayLabel(member.role, member.displayRole)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pendingCount > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                        {pendingCount} pending
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
                      <Plus size={13} /> Assign
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
          {!isLoading && assignableMembers.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <p className="text-sm">No team members found</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-2.5">
          {!isLoading && myTasks.map(task => renderTaskRow(task, { showAssignedBy: true }))}
          {!isLoading && myTasks.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <ClipboardList size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No Daily Tasks assigned to you yet</p>
            </div>
          )}
        </div>
      )}

      {/* MD: assign + manage a specific member's tasks */}
      <BottomSheet isOpen={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget?.fullName ?? ''} height="full">
        <div className="space-y-4 pb-4">
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-700">Assign a new task</p>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Task *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. BOQ Preparation"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Notes <span className="text-slate-300 font-normal">(optional)</span></label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Date</label>
              <input type="date" value={date} min={todayKey}
                onChange={e => setDate(e.target.value < todayKey ? todayKey : e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <button onClick={handleAssign} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
              Assign Task
            </button>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned so far</p>
            {assignTarget && tasksFor(assignTarget.id).map(task => renderTaskRow(task, { canManage: true }))}
            {assignTarget && tasksFor(assignTarget.id).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No tasks assigned yet</p>
            )}
          </div>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Task"
        message={`Remove "${deleteTarget?.title ?? ''}"? This cannot be undone.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={confirmDeleteTask}
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
