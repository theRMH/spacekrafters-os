import { useState } from 'react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { upsertTask } from '../../services/taskService'
import type { Task, TaskDependency } from '../../types'

interface Props {
  tasks: Task[]
  dependencies: TaskDependency[]
  onTaskUpdated: (task: Task) => void
  canEditDeadline: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const PX_PER_DAY = 28

function toDate(val?: string): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

function fmtDate(val?: string): string {
  const d = toDate(val)
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function taskTitle(tasks: Task[], id: string): string {
  return tasks.find(t => t.id === id)?.title ?? id
}

export function GanttChart({ tasks, dependencies, onTaskUpdated, canEditDeadline }: Props) {
  const [editing, setEditing] = useState<Task | null>(null)
  const [deadlineInput, setDeadlineInput] = useState('')

  const withDeadlines = tasks.filter(t => t.deadline)
  if (withDeadlines.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">No tasks with deadlines yet — set a deadline on a task to see it on the Gantt chart.</p>
  }

  const starts = withDeadlines.map(t => toDate(t.createdAt)!.getTime())
  const ends = withDeadlines.map(t => toDate(t.deadline)!.getTime())
  const rangeStart = Math.min(...starts, ...ends)
  const rangeEnd = Math.max(...starts, ...ends)
  const totalDays = Math.max(1, Math.ceil((rangeEnd - rangeStart) / DAY_MS)) + 1
  const chartWidth = totalDays * PX_PER_DAY

  function dayOffset(iso: string): number {
    return Math.max(0, Math.round((toDate(iso)!.getTime() - rangeStart) / DAY_MS))
  }

  function isLate(t: Task): boolean {
    if (!t.deadline || t.status === 'completed') return false
    return new Date(t.deadline).getTime() < Date.now()
  }

  function openEdit(t: Task) {
    if (!canEditDeadline) return
    setEditing(t)
    setDeadlineInput(t.deadline ? t.deadline.slice(0, 10) : '')
  }

  async function saveDeadline() {
    if (!editing) return
    const updated: Task = { ...editing, deadline: deadlineInput || undefined, updatedAt: new Date().toISOString() }
    const result = await upsertTask(updated)
    if (result.ok) onTaskUpdated(updated)
    setEditing(null)
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4">
        <div style={{ width: chartWidth + 160 }}>
          {withDeadlines.map(t => {
            const startOffset = dayOffset(t.createdAt)
            const endOffset = dayOffset(t.deadline!)
            const barWidth = Math.max(PX_PER_DAY, (endOffset - startOffset) * PX_PER_DAY)
            const deps = dependencies.filter(d => d.taskId === t.id)
            const late = isLate(t)
            return (
              <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50">
                <div className="w-36 flex-shrink-0 truncate text-xs font-semibold text-slate-700">
                  {t.parentTaskId ? '↳ ' : ''}{t.title}
                </div>
                <div className="relative h-6 flex-shrink-0" style={{ width: chartWidth }}>
                  <button
                    onClick={() => openEdit(t)}
                    title={deps.length ? `Depends on: ${deps.map(d => taskTitle(tasks, d.dependsOnId)).join(', ')}` : undefined}
                    className={`absolute top-0.5 h-5 rounded-md text-[10px] text-white font-semibold px-1.5 flex items-center whitespace-nowrap overflow-hidden ${late ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ left: startOffset * PX_PER_DAY, width: barWidth }}
                  >
                    {fmtDate(t.deadline)}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-3">Bar spans creation date → deadline. Red = overdue and not completed. Tap a bar to edit its deadline.</p>

      <BottomSheet isOpen={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit Deadline — ${editing.title}` : ''}>
        <div className="space-y-4 pb-4">
          <input type="date" value={deadlineInput} onChange={e => setDeadlineInput(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <button onClick={saveDeadline} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Deadline
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
