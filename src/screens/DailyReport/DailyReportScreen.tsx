import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllProjects } from '../../services/projectService'
import { getAllDailyReports, upsertDailyReport } from '../../services/dailyReportService'
import type { Project, DailyReport, DailyReportAreaEntry, DailyReportEditHistoryItem } from '../../types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function newArea(): DailyReportAreaEntry {
  return { id: `area_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, areaName: '', laborCount: 0 }
}

export default function DailyReportScreen() {
  const { user, can } = useAuth()
  const { leads } = useCRM()

  const [projects, setProjects] = useState<Project[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<DailyReport | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isEditingApproved, setIsEditingApproved] = useState(false)
  const [showRequestEdit, setShowRequestEdit] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [showLoDecision, setShowLoDecision] = useState(false)
  const [loNotes, setLoNotes] = useState('')

  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [totalLabourCount, setTotalLabourCount] = useState(0)
  const [natureOfWork, setNatureOfWork] = useState('')
  const [areas, setAreas] = useState<DailyReportAreaEntry[]>([newArea()])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function refresh() {
    setIsLoading(true)
    const [projs, reps] = await Promise.all([getAllProjects(), getAllDailyReports()])
    setProjects(projs)
    setReports(reps)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function projectName(id: string): string {
    return projects.find(p => p.id === id)?.name ?? id
  }

  function resolveLO(project?: Project): { id?: string; name: string } {
    if (!project) return { name: '—' }
    const lead = project.leadId ? leads.find(l => l.id === project.leadId) : undefined
    if (lead?.ownerId) return { id: lead.ownerId, name: lead.ownerName }
    if (lead?.ownerName) return { id: undefined, name: lead.ownerName }
    return { id: project.coordinatorId, name: project.coordinatorName }
  }

  function resetForm() {
    setProjectId(''); setDate(todayISO()); setTotalLabourCount(0); setNatureOfWork('')
    setAreas([newArea()]); setNotes(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setIsEditingApproved(false)
    setShowForm(true)
  }

  function openEditApproved(report: DailyReport) {
    setProjectId(report.projectId); setDate(report.date)
    setTotalLabourCount(report.totalLabourCount); setNatureOfWork(report.natureOfWork)
    setAreas(report.areas.length ? report.areas : [newArea()])
    setNotes(report.notes ?? '')
    setFormError('')
    setIsEditingApproved(true)
    setShowForm(true)
  }

  function updateArea(id: string, patch: Partial<DailyReportAreaEntry>) {
    setAreas(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeArea(id: string) {
    setAreas(prev => prev.filter(a => a.id !== id))
  }

  async function handleSubmitNew() {
    if (!user) return
    if (!projectId || !date || !natureOfWork.trim()) {
      setFormError('Project, date, and nature of work are required.')
      return
    }
    const validAreas = areas.filter(a => a.areaName.trim() && a.laborCount > 0)
    const now = new Date().toISOString()
    const history: DailyReportEditHistoryItem = { action: 'submitted', updatedBy: user.name, updatedAt: now }
    const report: DailyReport = {
      id: `dr_${Date.now()}`,
      projectId, date, totalLabourCount, natureOfWork: natureOfWork.trim(),
      areas: validAreas, notes: notes.trim() || undefined,
      locked: true, editRequestStatus: 'none', editHistory: [history],
      createdBy: user.id, createdByName: user.name,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertDailyReport(report)
    if (!result.ok) { setFormError(result.error ?? 'Could not submit report.'); return }
    setReports(prev => [report, ...prev])
    setShowForm(false)
    setSnack({ open: true, msg: 'Daily report submitted and locked.', type: 'success' })
  }

  async function handleSaveApprovedEdit() {
    if (!user || !selected) return
    if (!natureOfWork.trim()) { setFormError('Nature of work is required.'); return }
    const validAreas = areas.filter(a => a.areaName.trim() && a.laborCount > 0)
    const changed: string[] = []
    if (selected.date !== date) changed.push('date')
    if (selected.totalLabourCount !== totalLabourCount) changed.push('total labour count')
    if (selected.natureOfWork !== natureOfWork.trim()) changed.push('nature of work')
    if (JSON.stringify(selected.areas) !== JSON.stringify(validAreas)) changed.push('area breakdown')
    if ((selected.notes ?? '') !== notes.trim()) changed.push('notes')
    const now = new Date().toISOString()
    const historyEntry: DailyReportEditHistoryItem = {
      action: 'edited',
      note: changed.length > 0 ? `Changed: ${changed.join(', ')}` : 'No fields changed',
      updatedBy: user.name, updatedAt: now,
    }
    const updated: DailyReport = {
      ...selected, date, totalLabourCount, natureOfWork: natureOfWork.trim(),
      areas: validAreas, notes: notes.trim() || undefined,
      locked: true, editRequestStatus: 'none',
      editHistory: [...selected.editHistory, historyEntry],
      updatedAt: now,
    }
    const result = await upsertDailyReport(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not save changes.'); return }
    setReports(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    setSelected(updated)
    setShowForm(false)
    setSnack({ open: true, msg: 'Report updated and re-locked.', type: 'success' })
  }

  async function handleRequestEdit() {
    if (!user || !selected) return
    if (!editReason.trim()) { setSnack({ open: true, msg: 'Enter a reason for the edit request.', type: 'error' }); return }
    const now = new Date().toISOString()
    const historyEntry: DailyReportEditHistoryItem = { action: 'edit_requested', note: editReason.trim(), updatedBy: user.name, updatedAt: now }
    const updated: DailyReport = {
      ...selected, editRequestStatus: 'pending', editRequestReason: editReason.trim(),
      editHistory: [...selected.editHistory, historyEntry], updatedAt: now,
    }
    const result = await upsertDailyReport(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not request edit.', type: 'error' }); return }
    setReports(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    setSelected(updated)
    setShowRequestEdit(false)
    setEditReason('')
    setSnack({ open: true, msg: 'Edit request sent to LO.', type: 'success' })
  }

  async function handleLoDecision(approved: boolean) {
    if (!user || !selected) return
    const now = new Date().toISOString()
    const historyEntry: DailyReportEditHistoryItem = {
      action: approved ? 'edit_approved' : 'edit_rejected',
      note: loNotes.trim() || undefined,
      updatedBy: user.name, updatedAt: now,
    }
    const updated: DailyReport = {
      ...selected,
      editRequestStatus: approved ? 'approved' : 'rejected',
      editApprovalNotes: loNotes.trim() || undefined,
      locked: !approved,
      editHistory: [...selected.editHistory, historyEntry], updatedAt: now,
    }
    const result = await upsertDailyReport(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not record decision.', type: 'error' }); return }
    setReports(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    setSelected(updated)
    setShowLoDecision(false)
    setLoNotes('')
    setSnack({ open: true, msg: approved ? 'Edit approved — report is now editable.' : 'Edit request rejected.', type: 'success' })
  }

  const filtered = reports.filter(r => !search || projectName(r.projectId).toLowerCase().includes(search.toLowerCase()))
  const selectedProject = selected ? projects.find(p => p.id === selected.projectId) : undefined
  const lo = resolveLO(selectedProject)
  const isLO = !!selected && (user?.role === 'owner' || (lo.id ? user?.id === lo.id : false))
  const isCreator = !!selected && user?.id === selected.createdBy

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Daily Report</h1>
          <PermissionGate permission="create_daily_report">
            <button onClick={openNew} aria-label="New daily report"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by project name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(report => (
          <div key={report.id} onClick={() => setSelected(report)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{projectName(report.projectId)}</span>
                <p className="text-xs text-slate-500 mt-0.5">{fmtDate(report.date)} · {report.totalLabourCount} labour</p>
                <p className="text-[12px] text-slate-400 mt-0.5">{report.natureOfWork}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {report.locked ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">Locked</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Editable</span>
                )}
                {report.editRequestStatus === 'pending' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Edit Requested</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-sm">No daily reports found</p>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showForm} onClose={() => setSelected(null)} title={selected ? projectName(selected.projectId) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {selected.locked ? (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">Locked</span>
              ) : (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Editable</span>
              )}
              {selected.editRequestStatus === 'pending' && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Edit Requested — Pending LO</span>
              )}
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Date</span><span className="text-xs font-semibold text-slate-700">{fmtDate(selected.date)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Submitted By</span><span className="text-xs font-semibold text-slate-700">{selected.createdByName}</span></div>
              <div className="flex justify-between gap-3"><span className="text-xs text-slate-400">Total Labour</span><span className="text-xs font-semibold text-slate-700">{selected.totalLabourCount}</span></div>
              <div><span className="text-xs text-slate-400 block mb-0.5">Nature of Work</span><p className="text-xs font-semibold text-slate-700">{selected.natureOfWork}</p></div>
              {selected.notes && (
                <div><span className="text-xs text-slate-400 block mb-0.5">Notes</span><p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">{selected.notes}</p></div>
              )}
            </div>

            {selected.areas.length > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Labour by Area</p>
                <div className="space-y-1.5">
                  {selected.areas.map(a => (
                    <div key={a.id} className="flex justify-between text-xs bg-white border border-slate-100 rounded-xl px-3.5 py-2.5">
                      <span className="text-slate-700 font-semibold">{a.areaName}</span>
                      <span className="text-slate-600">{a.laborCount} workers</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SE: request edit */}
            {selected.locked && selected.editRequestStatus !== 'pending' && isCreator && can('create_daily_report') && (
              <button onClick={() => setShowRequestEdit(true)}
                className="w-full py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
                Request Edit
              </button>
            )}

            {/* LO: approve/reject edit request */}
            {selected.editRequestStatus === 'pending' && can('approve_daily_report_edit') && isLO && (
              <button onClick={() => setShowLoDecision(true)}
                className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
                Review Edit Request
              </button>
            )}
            {selected.editRequestStatus === 'pending' && !isLO && (
              <p className="text-xs text-slate-400 text-center py-2">Waiting on {lo.name} to approve or reject this edit request.</p>
            )}

            {/* SE: edit now allowed */}
            {!selected.locked && isCreator && (
              <button onClick={() => openEditApproved(selected)}
                className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#C9A24B' }}>
                Edit Report
              </button>
            )}

            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">History</p>
              <div className="space-y-2.5">
                {[...selected.editHistory].reverse().map((h, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#0F2A4A' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 capitalize">{h.action.replace(/_/g, ' ')}</p>
                      {h.note && <p className="text-[12px] text-slate-500">{h.note}</p>}
                      <p className="text-[12px] text-slate-400">{h.updatedBy} · {fmtDateTime(h.updatedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Report Form */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditingApproved ? 'Edit Daily Report' : 'New Daily Report'} height="full">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project *</label>
            {isEditingApproved ? (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 opacity-60">
                {projectName(projectId)}
              </div>
            ) : (
              <SearchableSelect
                value={projectId} onChange={setProjectId}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder="Select a project…" searchPlaceholder="Search projects…"
              />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date *</label>
            <DateField value={date} max={todayISO()} onChange={setDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">No. of Labour *</label>
            <input type="number" min="0" value={totalLabourCount || ''} onChange={e => setTotalLabourCount(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Nature of Work *</label>
            <input value={natureOfWork} onChange={e => setNatureOfWork(e.target.value)}
              placeholder="e.g. Flooring, Electrical wiring"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500">Labour by Area</label>
              <button onClick={() => setAreas(prev => [...prev, newArea()])} className="text-xs font-semibold text-indigo-600">+ Add Area</button>
            </div>
            <div className="space-y-2">
              {areas.map(a => (
                <div key={a.id} className="flex items-center gap-2">
                  <input value={a.areaName} onChange={e => updateArea(a.id, { areaName: e.target.value })}
                    placeholder="Area (e.g. 2nd Floor)"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                  <input type="number" min="0" value={a.laborCount || ''} onChange={e => updateArea(a.id, { laborCount: parseInt(e.target.value) || 0 })}
                    placeholder="Workers"
                    className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                  {areas.length > 1 && (
                    <button onClick={() => removeArea(a.id)} className="text-red-400 p-1.5"><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          <button onClick={isEditingApproved ? handleSaveApprovedEdit : handleSubmitNew}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90" style={{ background: '#C9A24B' }}>
            {isEditingApproved ? 'Save Changes (Re-locks Report)' : 'Submit Report'}
          </button>
        </div>
      </BottomSheet>

      {/* Request Edit */}
      <BottomSheet isOpen={showRequestEdit} onClose={() => setShowRequestEdit(false)} title="Request Edit">
        <div className="space-y-3 pb-4">
          <p className="text-xs text-slate-500">This report is locked. Explain what needs to change — the Lead Owner must approve before you can edit it.</p>
          <textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={3}
            placeholder="Reason for the edit request"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          <button onClick={handleRequestEdit} className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
            Send Request to LO
          </button>
        </div>
      </BottomSheet>

      {/* LO Decision */}
      <BottomSheet isOpen={showLoDecision} onClose={() => setShowLoDecision(false)} title="Review Edit Request">
        <div className="space-y-3 pb-4">
          {selected?.editRequestReason && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reason for edit</p>
              <p className="text-xs text-slate-700">{selected.editRequestReason}</p>
            </div>
          )}
          <textarea value={loNotes} onChange={e => setLoNotes(e.target.value)} rows={3}
            placeholder="Notes (optional)"
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
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
