import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getManagedUsersDirectory } from '../../services/userService'
import {
  getAllTasks, upsertTask,
  getAllTaskDependencies, addTaskDependency, deleteTaskDependency,
} from '../../services/taskService'
import type { Task, TaskStatus, TaskDependency, ManagedUser } from '../../types'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'blocked',     label: 'Blocked' },
]

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function newSubtask(projectId: string, parentTaskId: string, createdBy: string): Task {
  const now = new Date().toISOString()
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId, parentTaskId, title: '', status: 'not_started',
    createdBy, createdAt: now, updatedAt: now,
  }
}

export default function TaskDetailScreen() {
  const { id: projectId, taskId } = useParams<{ id: string; taskId: string }>()
  const navigate = useNavigate()
  const { user, can } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [dependencies, setDependencies] = useState<TaskDependency[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [showLateReasonDialog, setShowLateReasonDialog] = useState(false)
  const [lateReason, setLateReason] = useState('')
  const [showSubtaskSheet, setShowSubtaskSheet] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [showDepSheet, setShowDepSheet] = useState(false)
  const [depTaskId, setDepTaskId] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [allTasks, allDeps, dirUsers] = await Promise.all([
      getAllTasks(), getAllTaskDependencies(), getManagedUsersDirectory(),
    ])
    setTasks(allTasks)
    setDependencies(allDeps)
    setUsers(dirUsers)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const task = tasks.find(t => t.id === taskId)
  const subtasks = tasks.filter(t => t.parentTaskId === taskId)
  const taskDeps = dependencies.filter(d => d.taskId === taskId)
  const otherProjectTasks = tasks.filter(t => t.projectId === projectId && t.id !== taskId && t.parentTaskId !== taskId)

  function isLate(t: Task): boolean {
    if (!t.deadline) return false
    return new Date(t.deadline).getTime() < Date.now()
  }

  async function updateStatus(t: Task, status: TaskStatus) {
    if (status === 'completed' && isLate(t) && !t.lateReason) {
      setLateReason('')
      setShowLateReasonDialog(true)
      return
    }
    const updated: Task = { ...t, status, completedAt: status === 'completed' ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() }
    const result = await upsertTask(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to update task.', type: 'error' }); return }
    setTasks(prev => prev.map(x => (x.id === updated.id ? updated : x)))
  }

  async function confirmLateCompletion() {
    if (!task || !lateReason.trim()) return
    const updated: Task = { ...task, status: 'completed', completedAt: new Date().toISOString(), lateReason: lateReason.trim(), updatedAt: new Date().toISOString() }
    const result = await upsertTask(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to update task.', type: 'error' }); return }
    setTasks(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    setShowLateReasonDialog(false)
    setSnack({ open: true, msg: 'Task marked completed.', type: 'success' })
  }

  async function handleAddSubtask() {
    if (!task || !user || !subtaskTitle.trim()) return
    const sub = { ...newSubtask(task.projectId, task.id, user.id), title: subtaskTitle.trim() }
    const result = await upsertTask(sub)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add subtask.', type: 'error' }); return }
    setTasks(prev => [sub, ...prev])
    setSubtaskTitle('')
    setShowSubtaskSheet(false)
    setSnack({ open: true, msg: 'Subtask added.', type: 'success' })
  }

  async function handleAddDependency() {
    if (!task || !depTaskId) return
    const dep: TaskDependency = {
      id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: task.projectId, taskId: task.id, dependsOnId: depTaskId,
      createdAt: new Date().toISOString(),
    }
    const result = await addTaskDependency(dep)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add dependency.', type: 'error' }); return }
    setDependencies(prev => [dep, ...prev])
    setDepTaskId('')
    setShowDepSheet(false)
    setSnack({ open: true, msg: 'Dependency added.', type: 'success' })
  }

  async function handleRemoveDependency(depId: string) {
    const result = await deleteTaskDependency(depId)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to remove dependency.', type: 'error' }); return }
    setDependencies(prev => prev.filter(d => d.id !== depId))
  }

  function userName(userId?: string): string {
    if (!userId) return '—'
    return users.find(u => u.id === userId)?.fullName ?? userId
  }

  function taskTitle(id: string): string {
    return tasks.find(t => t.id === id)?.title ?? id
  }

  if (isLoading) {
    return <div className="min-h-screen bg-[#f8f9fa]"><AppHeader /><p className="text-sm text-slate-400 text-center py-16">Loading…</p></div>
  }

  if (!task) {
    return <div className="min-h-screen bg-[#f8f9fa]"><AppHeader /><p className="text-sm text-slate-400 text-center py-16">Task not found.</p></div>
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24">
      <AppHeader />

      <div className="bg-white px-4 pt-3 pb-4 border-b border-slate-200 sticky top-14 z-20">
        <button onClick={() => navigate(`/projects/${projectId}`)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-2 active:text-slate-700">
          <ChevronLeft size={14} /> Project
        </button>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>
        {task.description && <p className="text-xs text-slate-500">{task.description}</p>}
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Assignee</span><span className="font-semibold text-slate-800">{task.assigneeName ?? userName(task.assigneeId)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Deadline</span><span className={`font-semibold ${isLate(task) && task.status !== 'completed' ? 'text-red-600' : 'text-slate-800'}`}>{fmtDate(task.deadline)}</span></div>
          {task.completedAt && <div className="flex justify-between"><span className="text-slate-500">Completed</span><span className="font-semibold text-slate-800">{fmtDate(task.completedAt)}</span></div>}
          {task.lateReason && (
            <div>
              <p className="text-slate-500 mb-1">Late Reason</p>
              <p className="text-slate-800">{task.lateReason}</p>
            </div>
          )}
        </div>

        <PermissionGate permission="complete_task">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => updateStatus(task, opt.value)}
                disabled={task.status === opt.value}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${task.status === opt.value ? 'bg-slate-100 text-slate-400' : 'text-white'}`}
                style={task.status === opt.value ? undefined : { background: '#0F2A4A' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </PermissionGate>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subtasks</p>
            <PermissionGate permission="add_subtask">
              <button onClick={() => setShowSubtaskSheet(true)} className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                <Plus size={13} /> Add
              </button>
            </PermissionGate>
          </div>
          {subtasks.length === 0 ? (
            <p className="text-xs text-slate-400">No subtasks.</p>
          ) : (
            <div className="space-y-2">
              {subtasks.map(sub => (
                <div key={sub.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center justify-between">
                  <span className="text-sm text-slate-800">{sub.title}</span>
                  <StatusBadge status={sub.status} size="xs" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dependencies</p>
            <PermissionGate permission="edit_task">
              <button onClick={() => setShowDepSheet(true)} className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                <Plus size={13} /> Add
              </button>
            </PermissionGate>
          </div>
          {taskDeps.length === 0 ? (
            <p className="text-xs text-slate-400">No dependencies — this task can start any time.</p>
          ) : (
            <div className="space-y-2">
              {taskDeps.map(dep => (
                <div key={dep.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center justify-between">
                  <span className="text-sm text-slate-800">Depends on: {taskTitle(dep.dependsOnId)}</span>
                  <PermissionGate permission="edit_task">
                    <button onClick={() => handleRemoveDependency(dep.id)} className="text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </PermissionGate>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Subtask */}
      <BottomSheet isOpen={showSubtaskSheet} onClose={() => setShowSubtaskSheet(false)} title="Add Subtask">
        <div className="space-y-4 pb-4">
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
            value={subtaskTitle} onChange={e => setSubtaskTitle(e.target.value)} placeholder="Subtask title" autoFocus
          />
          <button onClick={handleAddSubtask} disabled={!subtaskTitle.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Add Subtask
          </button>
        </div>
      </BottomSheet>

      {/* Add Dependency */}
      <BottomSheet isOpen={showDepSheet} onClose={() => setShowDepSheet(false)} title="Add Dependency">
        <div className="space-y-4 pb-4">
          <select
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
            value={depTaskId} onChange={e => setDepTaskId(e.target.value)}
          >
            <option value="">Select a task this depends on…</option>
            {otherProjectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button onClick={handleAddDependency} disabled={!depTaskId}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Add Dependency
          </button>
        </div>
      </BottomSheet>

      {/* Mandatory late-reason dialog */}
      <Dialog
        isOpen={showLateReasonDialog}
        onClose={() => setShowLateReasonDialog(false)}
        title="Task Completed Late"
        message="This task is past its deadline. Enter a reason before marking it complete."
        confirmLabel="Mark Completed"
        confirmDisabled={!lateReason.trim()}
        onConfirm={confirmLateCompletion}
      >
        <textarea
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
          rows={3} value={lateReason} onChange={e => setLateReason(e.target.value)} placeholder="Reason for late completion…" autoFocus
        />
      </Dialog>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
