import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllMRFs, upsertMRF } from '../../services/mrfService'
import { MRF_STATUS_LABEL, fmtDate, MRFDetailBody, noteWithExtras, notifyQsNewMrf } from './MRFPanel'
import type { Project, MaterialRequestForm, StatusHistoryItem } from '../../types'

export default function MRFScreen() {
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MaterialRequestForm | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [formError, setFormError] = useState('')
  const [materialDetails, setMaterialDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false) // synchronous guard — see MRFPanel's savingRef

  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function refresh() {
    setIsLoading(true)
    const [projs, allMrfs] = await Promise.all([getAllProjects(), getAllMRFs()])
    setProjects(projs)
    setMrfs(allMrfs)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function projectName(id: string): string {
    return projects.find(p => p.id === id)?.name ?? id
  }

  function projectLeadId(id: string): string | undefined {
    return projects.find(p => p.id === id)?.leadId
  }

  function openNew() {
    setProjectId(''); setMaterialDetails(''); setNotes(''); setFormError('')
    setShowNew(true)
  }

  async function handleCreate() {
    if (!user || creatingRef.current) return
    if (!projectId) { setFormError('Select a project.'); return }
    creatingRef.current = true
    setIsCreating(true)
    const now = new Date().toISOString()
    const history: StatusHistoryItem = {
      stage: 'pending_qs', note: noteWithExtras('Raised, sent to QS', [{ label: 'Notes', value: notes }]),
      updatedBy: user.name, updatedRole: user.role, updatedAt: now,
    }
    const mrf: MaterialRequestForm = {
      id: `mrf_${Date.now()}`,
      projectId,
      status: 'pending_qs',
      materialDetails: materialDetails.trim() || undefined,
      notes: notes.trim() || undefined,
      history: [history],
      createdBy: user.name,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertMRF(mrf)
    creatingRef.current = false
    setIsCreating(false)
    if (!result.ok) { setFormError(result.error ?? 'Could not create MRF.'); return }
    setMrfs(prev => [mrf, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Sent to QS for MRF.', type: 'success' })
    notifyQsNewMrf(mrf, projectName(projectId), user.name)
  }

  function handleSaved(updated: MaterialRequestForm) {
    setMrfs(prev => prev.map(m => (m.id === updated.id ? updated : m)))
    setSelected(updated)
  }

  const filtered = mrfs.filter(m => !search || projectName(m.projectId).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">MRF</h1>
          <PermissionGate permission="create_mrf">
            <button onClick={openNew} aria-label="New MRF request"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by project name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(mrf => (
          <div key={mrf.id} onClick={() => setSelected(mrf)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{projectName(mrf.projectId)}</span>
                <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(mrf.createdAt)}</p>
                {mrf.requestingDate && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Req: {fmtDate(mrf.requestingDate)} · Delivery: {fmtDate(mrf.expectedDeliveryDate)}
                  </p>
                )}
              </div>
              <StatusBadge status={mrf.status} label={MRF_STATUS_LABEL[mrf.status]} size="xs" />
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No MRFs found</p>
          </div>
        )}
      </div>

      {/* MRF Detail Sheet */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected ? projectName(selected.projectId) : ''} height="full">
        {selected && (
          <MRFDetailBody mrf={selected} projectName={projectName(selected.projectId)} leadId={projectLeadId(selected.projectId)} onSaved={handleSaved}
            notify={(msg, type) => setSnack({ open: true, msg, type })} />
        )}
      </BottomSheet>

      {/* New MRF */}
      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="New MRF">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project *</label>
            <SearchableSelect
              value={projectId} onChange={setProjectId}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select a project…"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Material / Request Details</label>
            <textarea value={materialDetails} onChange={e => setMaterialDetails(e.target.value)} rows={4}
              placeholder="List the materials/items required… (QS can also fill this in)"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Optional notes"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleCreate} disabled={isCreating} className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90 disabled:opacity-60" style={{ background: '#C9A24B' }}>
            Send to QS
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
