import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllMRFs, upsertMRF } from '../../services/mrfService'
import { PROCUREMENT_STATUS_OPTIONS } from '../../data/procurementStatuses'
import type { Project, MaterialRequestForm, MRFStatus, StatusHistoryItem, ProcurementStatusHistoryItem } from '../../types'

const MRF_STATUS_LABEL: Record<MRFStatus, string> = {
  pending_qs:            'Pending QS',
  pending_procurement:   'Pending Procurement',
  pending_lo_approval:   'Pending LO Approval',
  approved:              'Approved',
  rejected:              'Rejected',
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MRFScreen() {
  const { user, can } = useAuth()
  const { leads } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MaterialRequestForm | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [formError, setFormError] = useState('')

  const [materialDetails, setMaterialDetails] = useState('')
  const [requestingDate, setRequestingDate] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [loNotes, setLoNotes] = useState('')
  const [showProcurementStatus, setShowProcurementStatus] = useState(false)
  const [newProcurementStatus, setNewProcurementStatus] = useState('')
  const [procurementIsDelay, setProcurementIsDelay] = useState(false)
  const [procurementNotes, setProcurementNotes] = useState('')

  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function refresh() {
    setIsLoading(true)
    const [projs, allMrfs] = await Promise.all([getAllProjects(), getAllMRFs()])
    setProjects(projs)
    setMrfs(allMrfs)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const state = routerLocation.state as { projectId?: string } | null
    if (!state?.projectId) return
    setProjectId(state.projectId)
    setShowNew(true)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state])

  function projectName(id: string): string {
    return projects.find(p => p.id === id)?.name ?? id
  }

  // Resolves the project's Lead Owner (the actual approver) — falls back to
  // the project coordinator when the originating lead has no owner on file.
  function resolveLO(project: Project): { id?: string; name: string } {
    const lead = project.leadId ? leads.find(l => l.id === project.leadId) : undefined
    if (lead?.ownerId) return { id: lead.ownerId, name: lead.ownerName }
    if (lead?.ownerName) return { id: undefined, name: lead.ownerName }
    return { id: project.coordinatorId, name: project.coordinatorName }
  }

  function openNew() {
    setProjectId(''); setFormError('')
    setShowNew(true)
  }

  function openDetail(mrf: MaterialRequestForm) {
    setMaterialDetails(mrf.materialDetails ?? '')
    setRequestingDate(mrf.requestingDate ?? '')
    setExpectedDeliveryDate(mrf.expectedDeliveryDate ?? '')
    setLoNotes('')
    setSelected(mrf)
  }

  async function handleCreate() {
    if (!user) return
    if (!projectId) { setFormError('Select a project.'); return }
    const project = projects.find(p => p.id === projectId)
    if (!project) { setFormError('Project not found.'); return }
    const lo = resolveLO(project)
    const now = new Date().toISOString()
    const history: StatusHistoryItem = {
      stage: 'pending_qs', note: 'Sent to QS for MRF',
      updatedBy: user.name, updatedRole: user.role, updatedAt: now,
    }
    const mrf: MaterialRequestForm = {
      id: `mrf_${Date.now()}`,
      projectId,
      status: 'pending_qs',
      loId: lo.id, loName: lo.name,
      history: [history],
      createdBy: user.name,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertMRF(mrf)
    if (!result.ok) { setFormError(result.error ?? 'Could not create MRF.'); return }
    setMrfs(prev => [mrf, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Sent to QS for MRF.', type: 'success' })
  }

  async function saveTransition(status: MRFStatus, note: string, extra?: Partial<MaterialRequestForm>) {
    if (!user || !selected) return
    const historyEntry: StatusHistoryItem = { stage: status, note, updatedBy: user.name, updatedRole: user.role, updatedAt: new Date().toISOString() }
    const updated: MaterialRequestForm = {
      ...selected, status,
      history: [...selected.history, historyEntry],
      updatedAt: new Date().toISOString(),
      ...extra,
    }
    const result = await upsertMRF(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update MRF.', type: 'error' }); return }
    setMrfs(prev => prev.map(m => (m.id === updated.id ? updated : m)))
    setSelected(updated)
    setSnack({ open: true, msg: 'MRF updated.', type: 'success' })
  }

  async function handleQsSubmit() {
    if (!materialDetails.trim()) { setSnack({ open: true, msg: 'Enter the required material/request details.', type: 'error' }); return }
    await saveTransition('pending_procurement', 'QS submitted material details', { materialDetails: materialDetails.trim() })
  }

  async function handleProcurementSubmit() {
    if (!requestingDate || !expectedDeliveryDate) { setSnack({ open: true, msg: 'Enter both the Requesting Date and Expected Delivery Date.', type: 'error' }); return }
    await saveTransition('pending_lo_approval', 'Procurement set requesting/delivery dates and sent to LO', { requestingDate, expectedDeliveryDate })
  }

  async function handleLoDecision(approved: boolean) {
    await saveTransition(approved ? 'approved' : 'rejected', approved ? 'LO approved' : 'LO rejected', { loNotes: loNotes.trim() || undefined })
  }

  // Procurement's own execution status, tracked once the MRF is approved —
  // visible to the LO alongside the rest of the MRF (same view_mrf audience).
  async function handleUpdateProcurementStatus() {
    if (!user || !selected) return
    if (!newProcurementStatus) { setSnack({ open: true, msg: 'Select a status.', type: 'error' }); return }
    if (procurementIsDelay && !procurementNotes.trim()) {
      setSnack({ open: true, msg: 'Enter the reason/details for the delay.', type: 'error' })
      return
    }
    const entry: ProcurementStatusHistoryItem = {
      status: newProcurementStatus, isDelay: procurementIsDelay, notes: procurementNotes.trim() || undefined,
      updatedBy: user.name, updatedAt: new Date().toISOString(),
    }
    const updated: MaterialRequestForm = {
      ...selected,
      procurementStatus: newProcurementStatus,
      procurementStatusHistory: [...(selected.procurementStatusHistory ?? []), entry],
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertMRF(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update procurement status.', type: 'error' }); return }
    setMrfs(prev => prev.map(m => (m.id === updated.id ? updated : m)))
    setSelected(updated)
    setShowProcurementStatus(false)
    setNewProcurementStatus(''); setProcurementIsDelay(false); setProcurementNotes('')
    setSnack({ open: true, msg: 'Procurement status updated.', type: 'success' })
  }

  const filtered = mrfs.filter(m => !search || projectName(m.projectId).toLowerCase().includes(search.toLowerCase()))
  // Owner can always act on behalf of the LO — same convention as
  // LeadStatusSheet/ProjectStatusSheet's canAct checks elsewhere in the app.
  const isLO = !!selected && (user?.role === 'owner' || (selected.loId ? user?.id === selected.loId : false))

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
          <div key={mrf.id} onClick={() => openDetail(mrf)}
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
          <div className="space-y-4">
            <StatusBadge status={selected.status} label={MRF_STATUS_LABEL[selected.status]} size="sm" />

            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Lead Owner</span><span className="text-xs font-semibold text-slate-700">{selected.loName ?? '—'}</span></div>
              {selected.materialDetails && (
                <div><span className="text-xs text-slate-400 block mb-0.5">Material / Request Details</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{selected.materialDetails}</p></div>
              )}
              {selected.requestingDate && (
                <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Requesting Date</span><span className="text-xs font-semibold text-slate-700">{fmtDate(selected.requestingDate)}</span></div>
              )}
              {selected.expectedDeliveryDate && (
                <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Expected Delivery</span><span className="text-xs font-semibold text-slate-700">{fmtDate(selected.expectedDeliveryDate)}</span></div>
              )}
              {selected.loNotes && (
                <div><span className="text-xs text-slate-400 block mb-0.5">LO Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{selected.loNotes}</p></div>
              )}
            </div>

            {/* QS: draft material details */}
            {selected.status === 'pending_qs' && can('submit_mrf') && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Material / Request Details *</label>
                <textarea value={materialDetails} onChange={e => setMaterialDetails(e.target.value)} rows={4}
                  placeholder="List the materials/items required…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                <button onClick={handleQsSubmit} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
                  Submit to Procurement
                </button>
              </div>
            )}

            {/* Procurement: set dates */}
            {selected.status === 'pending_procurement' && can('set_mrf_dates') && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Requesting Date *</label>
                  <input type="date" value={requestingDate} onChange={e => setRequestingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Expected Delivery Date *</label>
                  <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <button onClick={handleProcurementSubmit} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
                  Send to LO
                </button>
              </div>
            )}

            {/* LO: approve/reject */}
            {selected.status === 'pending_lo_approval' && can('approve_mrf') && isLO && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Notes</label>
                <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={3}
                  placeholder="Comments / approval notes"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => handleLoDecision(true)} className="flex-1 py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#059669' }}>
                    Approve
                  </button>
                  <button onClick={() => handleLoDecision(false)} className="flex-1 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold active:bg-red-100">
                    Reject
                  </button>
                </div>
              </div>
            )}
            {selected.status === 'pending_lo_approval' && !isLO && (
              <p className="text-xs text-slate-400 text-center py-4">Waiting on {selected.loName ?? 'the Lead Owner'} to approve or reject.</p>
            )}

            {/* Procurement status — post-approval execution tracking, visible to LO */}
            {selected.status === 'approved' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Procurement Status</p>
                  <PermissionGate permission="set_mrf_dates">
                    <button onClick={() => setShowProcurementStatus(true)} className="text-xs font-semibold text-indigo-600">
                      Update
                    </button>
                  </PermissionGate>
                </div>
                {selected.procurementStatus ? (
                  <div className="bg-white border border-slate-100 rounded-2xl p-3.5">
                    <StatusBadge status={selected.procurementStatus} label={selected.procurementStatus} size="xs" />
                    {selected.procurementStatusHistory && selected.procurementStatusHistory.length > 0 && (() => {
                      const latest = selected.procurementStatusHistory[selected.procurementStatusHistory.length - 1]
                      return latest.isDelay && latest.notes ? (
                        <p className="text-xs text-amber-700 mt-2"><span className="font-bold">Delay:</span> {latest.notes}</p>
                      ) : null
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No procurement status recorded yet.</p>
                )}
                {selected.procurementStatusHistory && selected.procurementStatusHistory.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {[...selected.procurementStatusHistory].reverse().map((h, i) => (
                      <div key={i} className="flex gap-2.5">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: h.isDelay ? '#d97706' : '#0F2A4A' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{h.status}{h.isDelay ? ' (Delay)' : ''}</p>
                          {h.notes && <p className="text-[11px] text-slate-500">{h.notes}</p>}
                          <p className="text-[11px] text-slate-400">{h.updatedBy} · {fmtDateTime(h.updatedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">History</p>
              <div className="space-y-2.5">
                {[...selected.history].reverse().map((h, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#0F2A4A' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">{h.note}</p>
                      <p className="text-[11px] text-slate-400">{h.updatedBy} · {fmtDateTime(h.updatedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New MRF */}
      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="Send to QS for MRF">
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
          <button onClick={handleCreate} className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90" style={{ background: '#C9A24B' }}>
            Send to QS
          </button>
        </div>
      </BottomSheet>

      {/* Update Procurement Status */}
      <BottomSheet isOpen={showProcurementStatus} onClose={() => setShowProcurementStatus(false)} title="Update Procurement Status">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Status *</label>
            <select value={newProcurementStatus} onChange={e => setNewProcurementStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Select a status…</option>
              {PROCUREMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={procurementIsDelay} onChange={e => setProcurementIsDelay(e.target.checked)}
              className="w-4 h-4 accent-amber-600" />
            <span className="text-xs font-semibold text-slate-700">This update reports a delay</span>
          </label>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Notes {procurementIsDelay && <span className="text-red-500">* (required for delays)</span>}
            </label>
            <textarea value={procurementNotes} onChange={e => setProcurementNotes(e.target.value)} rows={3}
              placeholder={procurementIsDelay ? 'Reason/details for the delay' : 'Optional notes'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleUpdateProcurementStatus} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
            Save Status
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
