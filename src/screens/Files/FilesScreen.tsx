import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { getAllDocuments, getAllDocumentVersions } from '../../services/documentService'
import { getAllProjects } from '../../services/projectService'
import type { Project, ProjectDocument, ProjectDocumentVersion } from '../../types'

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FilesScreen() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [versions, setVersions] = useState<ProjectDocumentVersion[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ProjectDocument | null>(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [docs, vers, projs] = await Promise.all([getAllDocuments(), getAllDocumentVersions(), getAllProjects()])
      setDocuments(docs)
      setVersions(vers)
      setProjects(projs)
      setIsLoading(false)
    }
    load()
  }, [])

  function projectName(id?: string): string {
    if (!id) return 'Unassigned'
    return projects.find(p => p.id === id)?.name ?? 'Unassigned'
  }

  function versionsFor(documentId: string): ProjectDocumentVersion[] {
    return versions.filter(v => v.documentId === documentId).sort((a, b) => b.versionNumber - a.versionNumber)
  }

  const filtered = documents.filter(d => !search
    || d.name.toLowerCase().includes(search.toLowerCase())
    || projectName(d.projectId).toLowerCase().includes(search.toLowerCase()))

  const groups = Array.from(new Set(filtered.map(d => d.projectId ?? '')))
    .map(id => ({ id, name: projectName(id || undefined), docs: filtered.filter(d => (d.projectId ?? '') === id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-3">Files</h1>
        <SearchBar value={search} onChange={setSearch} placeholder="Search files or projects…" />
      </div>

      <div className="px-4 pt-4 space-y-5">
        {!isLoading && groups.map(group => (
          <div key={group.id || 'unassigned'}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{group.name}</p>
            <div className="space-y-2.5">
              {group.docs.map(doc => (
                <button key={doc.id} onClick={() => setSelected(doc)}
                  className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
                  <span className="text-sm font-bold text-slate-800">{doc.name}</span>
                  <p className="text-xs text-slate-400 mt-1">{versionsFor(doc.id).length} version{versionsFor(doc.id).length !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📁</p>
            <p className="text-sm">No files found</p>
          </div>
        )}
      </div>

      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{projectName(selected.projectId)}</p>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Version History</p>
              <div className="space-y-2.5">
                {versionsFor(selected.id).map(v => (
                  <div key={v.id} className="bg-white border border-slate-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Version {v.versionNumber}</span>
                      <span className="text-[11px] text-slate-400">{fmtDate(v.createdAt)}</span>
                    </div>
                    {v.note && <p className="text-[11px] text-slate-500 mt-1">{v.note}</p>}
                    <p className="text-[11px] text-slate-400 mt-1 mb-1.5">by {v.createdBy}</p>
                    <MultiFileUploadField label="" files={v.files} onChange={() => {}} readOnly />
                  </div>
                ))}
                {versionsFor(selected.id).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No versions uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
