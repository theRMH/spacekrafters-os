import { supabase } from '../lib/supabase'
import type { ProjectDocument, ProjectDocumentVersion } from '../types'

const DOCUMENTS_TABLE = 'sks_documents'
const VERSIONS_TABLE = 'sks_document_versions'

export async function getAllDocuments(): Promise<ProjectDocument[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(DOCUMENTS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as ProjectDocument)
}

export async function upsertDocument(doc: ProjectDocument): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(DOCUMENTS_TABLE).upsert({
    id:         doc.id,
    project_id: doc.projectId,
    data:       doc,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllDocumentVersions(): Promise<ProjectDocumentVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(VERSIONS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as ProjectDocumentVersion)
}

export async function addDocumentVersion(version: ProjectDocumentVersion): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(VERSIONS_TABLE).insert({
    id:          version.id,
    document_id: version.documentId,
    data:        version,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
