import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { getAllProjects } from '../../services/projectService'
import { getAllDiaryEntries, upsertDiaryEntry, deleteDiaryEntry } from '../../services/dailyDiaryService'
import { addAuditLog } from '../../services/auditLogService'
import type { Project, DailyDiaryEntry } from '../../types'

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyDiaryScreen() {
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [entries, setEntries] = useState<DailyDiaryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DailyDiaryEntry | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [workDone, setWorkDone] = useState('')
  const [blockers, setBlockers] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [formError, setFormError] = useState('')
  // MD-only: editing an existing entry reuses the New Entry form; delete asks first.
  const [editingEntry, setEditingEntry] = useState<DailyDiaryEntry | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  async function refresh() {
    setIsLoading(true)
    const [projs, ents] = await Promise.all([getAllProjects(), getAllDiaryEntries()])
    setProjects(projs)
    setEntries(ents)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function projectName(id: string): string {
    return projects.find(p => p.id === id)?.name ?? id
  }

  function resetForm() {
    setProjectId(projects[0]?.id ?? '')
    setDate(todayISO())
    setWorkDone('')
    setBlockers('')
    setPhotos([])
    setFormError('')
  }

  function openNew() {
    resetForm()
    setEditingEntry(null)
    setShowNew(true)
  }

  function openEdit(entry: DailyDiaryEntry) {
    setEditingEntry(entry)
    setProjectId(entry.projectId); setDate(entry.date); setWorkDone(entry.workDone)
    setBlockers(entry.blockers ?? ''); setPhotos(entry.photos); setFormError('')
    setShowNew(true)
  }

  function mdAudit(action: string, description: string, projectIdForLog: string) {
    if (!user) return
    addAuditLog({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: projectIdForLog, action, description,
      createdBy: user.name, createdByRole: user.role, createdAt: new Date().toISOString(),
    })
  }

  async function confirmDelete() {
    if (!selected) return
    setShowDeleteDialog(false)
    const result = await deleteDiaryEntry(selected.id)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete diary entry.', type: 'error' }); return }
    mdAudit('diary_entry_deleted', `Daily diary entry for "${projectName(selected.projectId)}" on ${fmtDate(selected.date)} deleted by MD.`, selected.projectId)
    setEntries(prev => prev.filter(e => e.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Diary entry deleted.', type: 'success' })
  }

  async function handleAddEntry() {
    if (!projectId || !workDone.trim()) {
      setFormError('Project and work done are required.')
      return
    }
    const now = new Date().toISOString()
    const entry: DailyDiaryEntry = {
      id: editingEntry?.id ?? `diary_${Date.now()}`,
      projectId,
      date,
      workDone: workDone.trim(),
      blockers: blockers.trim() || undefined,
      photos,
      createdBy: editingEntry?.createdBy ?? user?.id ?? '',
      createdByName: editingEntry?.createdByName ?? user?.name ?? '',
      createdAt: editingEntry?.createdAt ?? now,
      updatedAt: now,
    }
    const result = await upsertDiaryEntry(entry)
    if (!result.ok) { setFormError(result.error ?? 'Could not save diary entry.'); return }
    if (editingEntry) {
      setEntries(prev => prev.map(e => (e.id === entry.id ? entry : e)))
      setSelected(prev => (prev?.id === entry.id ? entry : prev))
      mdAudit('diary_entry_edited', `Daily diary entry for "${projectName(entry.projectId)}" on ${fmtDate(entry.date)} edited by MD.`, entry.projectId)
    } else {
      setEntries(prev => [entry, ...prev])
    }
    setShowNew(false)
    setSnack({ open: true, msg: editingEntry ? 'Diary entry updated.' : 'Diary entry saved!', type: 'success' })
  }

  const filtered = entries.filter(e => !search || projectName(e.projectId).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Daily Diary</h1>
          <PermissionGate permission="view_tasks">
            <button onClick={openNew} aria-label="Add diary entry"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by project name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(entry => (
          <div key={entry.id} onClick={() => setSelected(entry)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{projectName(entry.projectId)}</span>
                <p className="text-xs text-slate-500 mt-0.5">{fmtDate(entry.date)}</p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{entry.workDone}</p>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📓</p>
            <p className="text-sm">No diary entries found</p>
          </div>
        )}
      </div>

      {/* Entry Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showNew} onClose={() => setSelected(null)} title={selected ? `${projectName(selected.projectId)} — ${fmtDate(selected.date)}` : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Work Done</p>
              <p className="text-sm text-slate-700">{selected.workDone}</p>
            </div>
            {selected.blockers && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Blockers</p>
                <p className="text-sm text-slate-700">{selected.blockers}</p>
              </div>
            )}
            {selected.photos.length > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Photos</p>
                <MultiFileUploadField label="" files={selected.photos} onChange={() => {}} readOnly />
              </div>
            )}
            <p className="text-[12px] text-slate-400">Logged by {selected.createdByName}</p>
            {user?.role === 'owner' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => openEdit(selected)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 active:bg-slate-50">
                  Edit Entry (MD)
                </button>
                <button onClick={() => setShowDeleteDialog(true)}
                  className="flex-1 py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-600 active:bg-red-100">
                  Delete Entry
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* New Entry Sheet */}
      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title={editingEntry ? 'Edit Diary Entry' : 'New Diary Entry'} height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project *</label>
            <SearchableSelect
              value={projectId} onChange={setProjectId}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select a project…" searchPlaceholder="Search projects…"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date *</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Work Done *</label>
            <textarea value={workDone} onChange={e => setWorkDone(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Blockers</label>
            <textarea value={blockers} onChange={e => setBlockers(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <MultiFileUploadField label="Site Photos" files={photos} onChange={setPhotos} accept="image/*" uploadButtonLabel="Upload Photo" />
          <button
            onClick={handleAddEntry}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {editingEntry ? 'Save Changes' : 'Save Entry'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Diary Entry"
        message="Delete this diary entry? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar
        isOpen={snack.open}
        message={snack.msg}
        type={snack.type}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
