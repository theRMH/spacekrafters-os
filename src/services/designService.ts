import { supabase } from '../lib/supabase'
import type { DesignPackage, DesignVersion } from '../types'

const PACKAGES_TABLE = 'sks_design_packages'
const VERSIONS_TABLE = 'sks_design_versions'

export async function getAllDesignPackages(): Promise<DesignPackage[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PACKAGES_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as DesignPackage)
}

export async function upsertDesignPackage(pkg: DesignPackage): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PACKAGES_TABLE).upsert({
    id:         pkg.id,
    project_id: pkg.projectId ?? null,
    lead_id:    pkg.leadId ?? null,
    status:     pkg.status,
    data:       pkg,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllDesignVersions(): Promise<DesignVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(VERSIONS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as DesignVersion)
}

export async function addDesignVersion(version: DesignVersion): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(VERSIONS_TABLE).insert({
    id:                 version.id,
    design_package_id:  version.designPackageId,
    data:               version,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
