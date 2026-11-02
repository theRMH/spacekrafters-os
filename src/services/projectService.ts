import { supabase } from '../lib/supabase'
import type { Project } from '../types'

const TABLE = 'sks_projects'

export async function getAllProjects(): Promise<Project[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  // 'designing' was renamed Design Center and the Advance Payment stage was dropped (the advance is taken on the
  // lead); projects saved at either are read as Design Center, and a pending move into Design Center is cleared.
  return data.map(r => {
    const project = r.data as Project
    const old = project.stage as string
    if (old !== 'designing' && old !== 'advance_payment') return project
    const pending = project.pendingStageRequest?.toStage === 'design_center' ? undefined : project.pendingStageRequest
    return { ...project, stage: 'design_center' as const, pendingStageRequest: pending }
  })
}

export async function upsertProject(project: Project): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:            project.id,
    owner_id:      project.coordinatorId,
    status:        project.status,
    current_stage: project.stage,
    data:          project,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteProject(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
