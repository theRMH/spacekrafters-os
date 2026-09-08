import { supabase } from '../lib/supabase'
import type { Task, TaskDependency } from '../types'

const TASKS_TABLE = 'sks_tasks'
const DEPS_TABLE = 'sks_task_dependencies'

export async function getAllTasks(): Promise<Task[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TASKS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Task)
}

export async function upsertTask(task: Task): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TASKS_TABLE).upsert({
    id:              task.id,
    project_id:      task.projectId,
    parent_task_id:  task.parentTaskId ?? null,
    assignee_id:     task.assigneeId ?? null,
    status:          task.status,
    data:            task,
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteTask(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TASKS_TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllTaskDependencies(): Promise<TaskDependency[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(DEPS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as TaskDependency)
}

export async function addTaskDependency(dep: TaskDependency): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(DEPS_TABLE).insert({
    id:            dep.id,
    project_id:    dep.projectId,
    task_id:       dep.taskId,
    depends_on_id: dep.dependsOnId,
    data:          dep,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteTaskDependency(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(DEPS_TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
