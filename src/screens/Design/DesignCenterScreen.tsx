import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { getAllProjects } from '../../services/projectService'
import { getAllDesignPackages, upsertDesignPackage, getAllDesignVersions, addDesignVersion } from '../../services/designService'
import { addAuditLog } from '../../services/auditLogService'
import type { Project, DesignPackage, DesignPackageStatus, DesignVersion, AuditLog } from '../../types'

const STATUS_OPTIONS: { value: DesignPackageStatus; label: string }[] = [
  { value: 'in_progress',       label: 'In Progress' },
  { value: 'client_review',     label: 'Client Review' },
  { value: 'client_approved',   label: 'Client Approved' },
  { value: 'revision_requested',label: 'Revision Requested' },
]

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DesignCenterScreen() {
  const { user, can } = useAuth()
  const canUpload = can('upload_design')
  const canApprove = can('approve_design')
  const canRequestRevision = can('request_revision')

  const [projects, setProjects] = useState<Project[]>([])
  const [packages, setPackages] = useState<DesignPackage[]>([])
  const [versions, setVersions] = useState<DesignVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selected, setSelected] = useState<DesignPackage | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showVersion, setShowVersion] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [versionFiles, setVersionFiles] = useState<string[]>([])
  const [versionNote, setVersionNote] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [projs, pkgs, vers] = await Promise.all([getAllProjects(), getAllDesignPackages(), getAllDesignVersions()])
    setProjects(projs)
    setPackages(pkgs)
    setVersions(vers)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function projectName(id: string): string {
    return projects.find(p => p.id === id)?.name ?? id
  }

  function versionsFor(pkgId: string): DesignVersion[] {
    return versions.filter(v => v.designPackageId === pkgId).sort((a, b) => b.versionNumber - a.versionNumber)
  }

  function resetNewForm() {
    setProjectId(''); setName(''); setNotes(''); setFormError('')
  }

  function openNew() {
    resetNewForm()
    setShowNew(true)
  }

  function openVersionUpload() {
    setVersionFiles([]); setVersionNote(''); setFormError('')
    setShowVersion(true)
  }

  async function handleCreatePackage() {
    if (!user) return
    if (!projectId || !name.trim()) {
      setFormError('Project and name are required.')
      return
    }
    const now = new Date().toISOString()
    const pkg: DesignPackage = {
      id: `dspkg_${Date.now()}`,
      projectId,
      quotationId: projects.find(p => p.id === projectId)?.quotationId,
      name: name.trim(),
      status: 'in_progress',
      notes: notes.trim() || undefined,
      createdBy: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertDesignPackage(pkg)
    if (!result.ok) { setFormError(result.error ?? 'Could not create design package.'); return }
    setPackages(prev => [pkg, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Design package created.', type: 'success' })
  }

  async function handleAddVersion() {
    if (!user || !selected) return
    if (versionFiles.length === 0) {
      setFormError('At least one file is required.')
      return
    }
    const nextVersionNumber = versionsFor(selected.id).length + 1
    const version: DesignVersion = {
      id: `dsver_${Date.now()}`,
      designPackageId: selected.id,
      versionNumber: nextVersionNumber,
      files: versionFiles,
      note: versionNote.trim() || undefined,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    }
    const result = await addDesignVersion(version)
    if (!result.ok) { setFormError(result.error ?? 'Could not add version.'); return }
    setVersions(prev => [version, ...prev])
    setShowVersion(false)
    setSnack({ open: true, msg: 'Version added.', type: 'success' })
  }

  async function handleStatusChange(status: DesignPackageStatus) {
    if (!selected) return
    const updated: DesignPackage = { ...selected, status, updatedAt: new Date().toISOString() }
    const result = await upsertDesignPackage(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update status.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: updated.projectId,
        action: 'design_status_changed',
        description: `Design package "${updated.name}" status changed to "${status}".`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setPackages(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    setSelected(updated)
    setSnack({ open: true, msg: 'Status updated.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-slate-800">Design Center</h1>
          <PermissionGate permission="upload_design">
            <button onClick={openNew} aria-label="New design package"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && packages.map(pkg => (
          <div key={pkg.id} onClick={() => setSelected(pkg)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{pkg.name}</span>
                <p className="text-xs text-slate-500 mt-0.5">{projectName(pkg.projectId)}</p>
                <p className="text-xs text-slate-400 mt-1">{versionsFor(pkg.id).length} version{versionsFor(pkg.id).length !== 1 ? 's' : ''}</p>
              </div>
              <StatusBadge status={pkg.status} />
            </div>
          </div>
        ))}

        {!isLoading && packages.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">🎨</p>
            <p className="text-sm">No design packages found</p>
          </div>
        )}
      </div>

      {/* Design Package Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showVersion} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">{projectName(selected.projectId)}</p>
                <StatusBadge status={selected.status} />
              </div>
              {canUpload && (
                <button onClick={openVersionUpload}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  + Add Version
                </button>
              )}
            </div>

            {selected.notes && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-xs text-slate-600">{selected.notes}</p>
              </div>
            )}

            {(canApprove || canRequestRevision) && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.filter(opt => opt.value !== 'revision_requested' || canRequestRevision)
                    .filter(opt => opt.value === 'revision_requested' || canApprove)
                    .map(opt => (
                    <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold active:opacity-80 ${
                        selected.status === opt.value ? 'border-brand-primary bg-slate-50 text-slate-800' : 'border-slate-200 text-slate-600'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Version History</p>
              <div className="space-y-2.5">
                {versionsFor(selected.id).map(v => (
                  <div key={v.id} className="bg-white border border-slate-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Version {v.versionNumber}</span>
                      <span className="text-[11px] text-slate-400">{fmtDateTime(v.createdAt)}</span>
                    </div>
                    {v.note && <p className="text-[11px] text-slate-500 mt-1">{v.note}</p>}
                    <p className="text-[11px] text-slate-400 mt-1 mb-1.5">by {v.createdBy}</p>
                    <MultiFileUploadField label="" files={v.files} onChange={() => {}} />
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

      {/* New Design Package Sheet */}
      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="New Design Package" height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project *</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Select a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Package Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Living Room Moodboard"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleCreatePackage}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}>
            Create Package
          </button>
        </div>
      </BottomSheet>

      {/* Add Version Sheet */}
      <BottomSheet isOpen={showVersion} onClose={() => setShowVersion(false)} title="Add Design Version" height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <MultiFileUploadField
            label="Design Files"
            files={versionFiles}
            onChange={setVersionFiles}
            required
            uploadButtonLabel="Upload Design Files"
          />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Note</label>
            <textarea value={versionNote} onChange={e => setVersionNote(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleAddVersion}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}>
            Add Version
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
