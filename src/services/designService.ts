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

// A true SQL UPDATE on an already-existing package, not an upsert. Postgres
// RLS evaluates the INSERT policy for .upsert() (it's an
// INSERT...ON CONFLICT DO UPDATE under the hood) even when the row already
// exists — sks_design_packages' INSERT policy is owner/designer only, so a
// PC's upsert() call to merely change a status field was being rejected with
// "new row violates row-level security policy", even though the UPDATE
// policy itself permits it. Use this for any write that only ever touches an
// existing row (status transitions, etc.); keep upsertDesignPackage for
// actual package creation.
export async function updateDesignPackage(pkg: DesignPackage): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PACKAGES_TABLE).update({
    project_id: pkg.projectId ?? null,
    lead_id:    pkg.leadId ?? null,
    status:     pkg.status,
    data:       pkg,
    updated_at: new Date().toISOString(),
  }).eq('id', pkg.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Deletes a package (its versions go with it via ON DELETE CASCADE). Needs the
// owner DELETE policy in supabase/owner-edit-policies.sql — without it Postgres
// silently deletes 0 rows and returns no error, so confirm a row really went.
export async function deleteDesignPackage(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { data, error } = await supabase.from(PACKAGES_TABLE).delete().eq('id', id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Delete was blocked by the database (owner delete policy not applied yet).' }
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
