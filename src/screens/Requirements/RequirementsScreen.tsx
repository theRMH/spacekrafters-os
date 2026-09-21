import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllRequirements, upsertRequirement, deleteRequirement } from '../../services/requirementService'
import { getAllProjects } from '../../services/projectService'
import { addAuditLog } from '../../services/auditLogService'
import type { SiteVisit, Requirement, RequirementLineItem, Project, AuditLog } from '../../types'

const UNIT_OPTIONS = ['sqft', 'nos', 'rft', 'sft', 'lot', 'set']

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function newLineItem(roomName = ''): RequirementLineItem {
  return { id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, roomName, description: '', unit: 'sqft', quantity: 0 }
}

function lineItemsFromSiteVisit(visit: SiteVisit): RequirementLineItem[] {
  return visit.rooms.map(room => ({
    id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    roomName: room.name,
    description: room.measurements ? `${room.name} — ${room.measurements}` : room.name,
    unit: 'sqft',
    quantity: 0,
  }))
}

export default function RequirementsScreen() {
  const { user } = useAuth()
  const { leads } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Requirement | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [siteVisitId, setSiteVisitId] = useState('')
  const [lineItems, setLineItems] = useState<RequirementLineItem[]>([newLineItem()])
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [visits, reqs, projs] = await Promise.all([getAllSiteVisits(), getAllRequirements(), getAllProjects()])
    setSiteVisits(visits)
    setRequirements(reqs)
    setProjects(projs)
    setIsLoading(false)
  }

  // Best-effort: a Project usually doesn't exist yet when a Requirement is captured
  // (see ProjectWorkspaceScreen's read-time siteVisit->lead join for the common case).
  // When one already does, set projectId directly so the FK is correct going forward.
  function resolveProjectId(visitId: string): string | undefined {
    const visit = siteVisits.find(v => v.id === visitId)
    if (!visit) return undefined
    return projects.find(p => p.leadId === visit.leadId)?.id
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const state = routerLocation.state as { leadId?: string } | null
    if (!state?.leadId || isLoading) return
    const visit = siteVisits.find(v => v.leadId === state.leadId)
    if (visit) {
      handleSiteVisitPick(visit.id)
      setShowNew(true)
    }
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading])

  function visitLabel(visit: SiteVisit): string {
    const leadName = leads.find(l => l.id === visit.leadId)?.name ?? visit.leadId
    return `${leadName} — ${fmtDate(visit.visitDate)}`
  }

  function requirementLeadName(req: Requirement): string {
    const visit = siteVisits.find(v => v.id === req.siteVisitId)
    if (!visit) return req.siteVisitId
    return leads.find(l => l.id === visit.leadId)?.name ?? visit.leadId
  }

  function resetForm() {
    setSiteVisitId(''); setLineItems([newLineItem()]); setNotes(''); setFiles([]); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(req: Requirement) {
    setSiteVisitId(req.siteVisitId)
    setLineItems(req.lineItems.length ? req.lineItems : [newLineItem()])
    setNotes(req.notes ?? '')
    setFiles(req.files ?? [])
    setFormError('')
    setShowEdit(true)
  }

  function handleSiteVisitPick(id: string) {
    setSiteVisitId(id)
    const visit = siteVisits.find(v => v.id === id)
    if (visit && visit.rooms.length > 0) setLineItems(lineItemsFromSiteVisit(visit))
    if (visit?.notes) setNotes(visit.notes)
  }

  function updateLineItem(id: string, patch: Partial<RequirementLineItem>) {
    setLineItems(prev => prev.map(li => (li.id === id ? { ...li, ...patch } : li)))
  }

  function removeLineItem(id: string) {
    setLineItems(prev => prev.filter(li => li.id !== id))
  }

  async function handleAddRequirement() {
    const validItems = lineItems.filter(li => li.description.trim() && li.quantity > 0)
    if (!siteVisitId || validItems.length === 0) {
      setFormError('Site visit and at least one line item (with description and quantity > 0) are required.')
      return
    }
    const now = new Date().toISOString()
    const req: Requirement = {
      id: `req_${Date.now()}`,
      siteVisitId, projectId: resolveProjectId(siteVisitId), lineItems: validItems, notes: notes.trim() || undefined,
      files: files.length ? files : undefined,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertRequirement(req)
    if (!result.ok) { setFormError(result.error ?? 'Could not save requirement.'); return }
    setRequirements(prev => [req, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Requirement captured!', type: 'success' })
  }

  async function handleUpdateRequirement() {
    if (!selected) return
    const validItems = lineItems.filter(li => li.description.trim() && li.quantity > 0)
    if (validItems.length === 0) {
      setFormError('At least one line item (with description and quantity > 0) is required.')
      return
    }
    const updated: Requirement = {
      ...selected, siteVisitId, projectId: selected.projectId ?? resolveProjectId(siteVisitId), lineItems: validItems, notes: notes.trim() || undefined,
      files: files.length ? files : undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertRequirement(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update requirement.'); return }
    setRequirements(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Requirement updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteRequirement(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete requirement.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: selected.projectId,
        action: 'requirement_deleted',
        description: `Requirement for "${requirementLeadName(selected)}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setRequirements(prev => prev.filter(r => r.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Requirement deleted.', type: 'success' })
  }

  const filtered = requirements.filter(r => !search || requirementLeadName(r).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Requirements</h1>
          <PermissionGate permission="add_requirements">
            <button onClick={openNew} aria-label="Add new requirement"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by lead name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(req => (
          <div key={req.id} onClick={() => setSelected(req)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{requirementLeadName(req)}</span>
                <p className="text-xs text-slate-600 mt-1">{req.lineItems.length} line item{req.lineItems.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No requirements found</p>
          </div>
        )}
      </div>

      {/* Requirement Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected ? requirementLeadName(selected) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <PermissionGate permission="add_requirements">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  Edit
                </button>
              </PermissionGate>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Line Items</p>
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                {selected.lineItems.map((item, i) => (
                  <div key={item.id} className={`p-3.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">{item.roomName}</span>
                      <span className="text-xs font-semibold text-slate-600">{item.quantity} {item.unit}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {selected.notes && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                <p className="text-xs text-slate-600">{selected.notes}</p>
              </div>
            )}

            {selected.files && selected.files.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attachments</p>
                <MultiFileUploadField label="" files={selected.files} onChange={() => {}} readOnly />
              </div>
            )}

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Requirement
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Requirement Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Requirement' : 'New Requirement'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Site Visit *</label>
            <select value={siteVisitId} onChange={e => handleSiteVisitPick(e.target.value)} disabled={showEdit}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-60">
              <option value="">Select a site visit…</option>
              {siteVisits.map(v => <option key={v.id} value={v.id}>{visitLabel(v)}</option>)}
            </select>
            {!showEdit && <p className="text-[10px] text-slate-400 mt-1">Selecting a site visit pre-fills one line item per room measured.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500">Line Items *</label>
              <button onClick={() => setLineItems(prev => [...prev, newLineItem()])}
                className="text-xs font-semibold text-indigo-600">+ Add Item</button>
            </div>
            <div className="space-y-2.5">
              {lineItems.map(item => (
                <div key={item.id} className="bg-slate-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={item.roomName} onChange={e => updateLineItem(item.id, { roomName: e.target.value })}
                      placeholder="Room"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <button onClick={() => removeLineItem(item.id)} className="text-red-400 p-1.5">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <input value={item.description} onChange={e => updateLineItem(item.id, { description: e.target.value })}
                    placeholder="Description"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="0.01" value={item.quantity || ''}
                      onChange={e => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                      placeholder="Qty"
                      className="w-1/2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <select value={item.unit} onChange={e => updateLineItem(item.id, { unit: e.target.value })}
                      className="w-1/2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          <MultiFileUploadField label="Attachments" files={files} onChange={setFiles} uploadButtonLabel="Upload Photo/File" />

          <button
            onClick={showEdit ? handleUpdateRequirement : handleAddRequirement}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {showEdit ? 'Save Changes' : 'Capture Requirement'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Requirement"
        message="Are you sure you want to delete this requirement? This cannot be undone."
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
