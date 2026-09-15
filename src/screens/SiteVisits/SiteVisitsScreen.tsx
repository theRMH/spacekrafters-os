import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllSiteVisits, upsertSiteVisit, deleteSiteVisit } from '../../services/siteVisitService'
import { getAllAppointments } from '../../services/appointmentService'
import { addAuditLog } from '../../services/auditLogService'
import type { SiteVisit, SiteVisitRoom, SiteVisitChecklistItem, Appointment, AuditLog } from '../../types'

const DEFAULT_CHECKLIST_LABELS = [
  'Electrical points marked',
  'Plumbing points marked',
  'Existing layout photographed',
  'Client requirements discussed',
]

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function newRoom(): SiteVisitRoom {
  return { id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', measurements: '', lengthFt: '', widthFt: '', notes: '' }
}

function parseMeasurements(val?: string): { length: string; width: string } {
  const match = val?.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/)
  return { length: match?.[1] ?? '', width: match?.[2] ?? '' }
}

function formatMeasurements(length: string, width: string): string {
  if (!length && !width) return ''
  if (length && width) return `${length}ft x ${width}ft`
  return `${length || width}ft`
}

function defaultChecklist(): SiteVisitChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label, i) => ({ id: `chk_${Date.now()}_${i}`, label, checked: false }))
}

export default function SiteVisitsScreen() {
  const { user } = useAuth()
  const { leads } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SiteVisit | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [leadId, setLeadId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [rooms, setRooms] = useState<SiteVisitRoom[]>([newRoom()])
  const [checklist, setChecklist] = useState<SiteVisitChecklistItem[]>(defaultChecklist())
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [v, a] = await Promise.all([getAllSiteVisits(), getAllAppointments()])
    setVisits(v)
    setAppointments(a)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const state = routerLocation.state as { leadId?: string } | null
    if (!state?.leadId || isLoading) return
    handleLeadChange(state.leadId)
    const appt = appointmentsForLead(state.leadId).find(a => a.status === 'scheduled')
    if (appt) handleAppointmentPick(appt.id)
    setShowNew(true)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, isLoading])

  function leadName(id: string): string {
    return leads.find(l => l.id === id)?.name ?? id
  }

  function resetForm() {
    setLeadId(''); setAppointmentId(''); setVisitDate(''); setRooms([newRoom()]); setChecklist(defaultChecklist())
    setNotes(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(visit: SiteVisit) {
    setLeadId(visit.leadId); setAppointmentId(visit.appointmentId ?? ''); setVisitDate(visit.visitDate.slice(0, 10))
    // Backfill lengthFt/widthFt for rooms saved before the two-box measurement
    // input existed — they only have the combined "12ft x 14ft" string.
    const roomsWithFt = visit.rooms.map(r => {
      if (r.lengthFt !== undefined || r.widthFt !== undefined) return r
      const { length, width } = parseMeasurements(r.measurements)
      return { ...r, lengthFt: length, widthFt: width }
    })
    setRooms(roomsWithFt.length ? roomsWithFt : [newRoom()])
    setChecklist(visit.checklist.length ? visit.checklist : defaultChecklist())
    setNotes(visit.notes ?? '')
    setFormError('')
    setShowEdit(true)
  }

  function handleLeadChange(id: string) {
    setLeadId(id)
    setAppointmentId('')
  }

  function handleAppointmentPick(id: string) {
    setAppointmentId(id)
    const appt = appointments.find(a => a.id === id)
    if (appt) setVisitDate(appt.scheduledAt.slice(0, 10))
  }

  function appointmentsForLead(id: string): Appointment[] {
    return appointments.filter(a => a.leadId === id)
  }

  function updateRoom(id: string, patch: Partial<SiteVisitRoom>) {
    setRooms(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRoom(id: string) {
    setRooms(prev => prev.filter(r => r.id !== id))
  }

  function toggleChecklistItem(id: string) {
    setChecklist(prev => prev.map(c => (c.id === id ? { ...c, checked: !c.checked } : c)))
  }

  async function handleAddVisit() {
    const validRooms = rooms.filter(r => r.name.trim())
    if (!leadId || !visitDate || validRooms.length === 0) {
      setFormError('Lead, visit date, and at least one named room are required.')
      return
    }
    const now = new Date().toISOString()
    const visit: SiteVisit = {
      id: `sv_${Date.now()}`,
      leadId, appointmentId: appointmentId || undefined, visitDate: new Date(visitDate).toISOString(),
      rooms: validRooms, checklist, notes: notes.trim() || undefined,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertSiteVisit(visit)
    if (!result.ok) { setFormError(result.error ?? 'Could not save site visit.'); return }
    setVisits(prev => [visit, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Site visit recorded!', type: 'success' })
  }

  async function handleUpdateVisit() {
    if (!selected) return
    const validRooms = rooms.filter(r => r.name.trim())
    if (!visitDate || validRooms.length === 0) {
      setFormError('Visit date and at least one named room are required.')
      return
    }
    const updated: SiteVisit = {
      ...selected, leadId, appointmentId: appointmentId || undefined, visitDate: new Date(visitDate).toISOString(),
      rooms: validRooms, checklist, notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertSiteVisit(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update site visit.'); return }
    setVisits(prev => prev.map(v => (v.id === updated.id ? updated : v)))
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Site visit updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteSiteVisit(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete site visit.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'site_visit_deleted',
        description: `Site visit for "${leadName(selected.leadId)}" on ${fmtDate(selected.visitDate)} deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setVisits(prev => prev.filter(v => v.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Site visit deleted.', type: 'success' })
  }

  const filtered = visits.filter(v => !search || leadName(v.leadId).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Site Visits</h1>
          <PermissionGate permission="add_site_visit">
            <button onClick={openNew} aria-label="Add new site visit"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by lead name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(visit => {
          const checked = visit.checklist.filter(c => c.checked).length
          return (
            <div key={visit.id} onClick={() => setSelected(visit)}
              className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{leadName(visit.leadId)}</span>
                    <span className="text-slate-300 text-xs">|</span>
                    <span className="text-xs text-slate-500">{fmtDate(visit.visitDate)}</span>
                  </div>
                  <p className="text-xs text-slate-600">{visit.rooms.length} room{visit.rooms.length !== 1 ? 's' : ''} measured</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{checked}/{visit.checklist.length} checklist items done</p>
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📐</p>
            <p className="text-sm">No site visits found</p>
          </div>
        )}
      </div>

      {/* Site Visit Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected ? leadName(selected.leadId) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">{fmtDate(selected.visitDate)}</span>
              <PermissionGate permission="edit_site_visit">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  Edit
                </button>
              </PermissionGate>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rooms</p>
              <div className="space-y-2">
                {selected.rooms.map(room => (
                  <div key={room.id} className="bg-slate-50 rounded-2xl p-3.5">
                    <p className="text-sm font-bold text-slate-800 mb-1">{room.name}</p>
                    {room.measurements && <p className="text-xs text-slate-600 mb-1">📏 {room.measurements}</p>}
                    {room.notes && <p className="text-xs text-slate-500">{room.notes}</p>}
                    {room.photos && room.photos.length > 0 && (
                      <MultiFileUploadField label="Room Photos" files={room.photos} onChange={() => {}} accept="image/*" uploadButtonLabel="Upload Photo" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</p>
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 space-y-2">
                {selected.checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={`text-sm ${item.checked ? 'text-emerald-600' : 'text-slate-300'}`}>{item.checked ? '✓' : '○'}</span>
                    <span className={`text-xs ${item.checked ? 'text-slate-700' : 'text-slate-400'}`}>{item.label}</span>
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

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Site Visit
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Site Visit Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Site Visit' : 'New Site Visit'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead *</label>
            <select value={leadId} onChange={e => handleLeadChange(e.target.value)} disabled={showEdit}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-60">
              <option value="">Select a lead…</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
            </select>
          </div>
          {leadId && appointmentsForLead(leadId).length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Linked Appointment</label>
              <select value={appointmentId} onChange={e => handleAppointmentPick(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">None</option>
                {appointmentsForLead(leadId).map(a => (
                  <option key={a.id} value={a.id}>{fmtDate(a.scheduledAt)} — {a.status}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Visit Date *</label>
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500">Rooms *</label>
              <button onClick={() => setRooms(prev => [...prev, newRoom()])}
                className="text-xs font-semibold text-indigo-600">+ Add Room</button>
            </div>
            <div className="space-y-2.5">
              {rooms.map(room => (
                <div key={room.id} className="bg-slate-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={room.name} onChange={e => updateRoom(room.id, { name: e.target.value })}
                      placeholder="Room name (e.g. Living Room)"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    {rooms.length > 1 && (
                      <button onClick={() => removeRoom(room.id)} className="text-red-400 p-1.5">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="0.01" value={room.lengthFt ?? ''}
                      onChange={e => updateRoom(room.id, { lengthFt: e.target.value, measurements: formatMeasurements(e.target.value, room.widthFt ?? '') })}
                      placeholder="Length (ft)"
                      className="w-1/2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <span className="text-slate-400 text-sm">×</span>
                    <input type="number" min="0" step="0.01" value={room.widthFt ?? ''}
                      onChange={e => updateRoom(room.id, { widthFt: e.target.value, measurements: formatMeasurements(room.lengthFt ?? '', e.target.value) })}
                      placeholder="Width (ft)"
                      className="w-1/2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <input value={room.notes ?? ''} onChange={e => updateRoom(room.id, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  <MultiFileUploadField label="Room Photos" files={room.photos ?? []} onChange={files => updateRoom(room.id, { photos: files })} accept="image/*" uploadButtonLabel="Upload Photo" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-2 block">Checklist</label>
            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2.5">
              {checklist.map(item => (
                <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={item.checked} onChange={() => toggleChecklistItem(item.id)}
                    className="w-4 h-4 accent-indigo-600" />
                  <span className="text-xs text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button
            onClick={showEdit ? handleUpdateVisit : handleAddVisit}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {showEdit ? 'Save Changes' : 'Record Site Visit'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Site Visit"
        message="Are you sure you want to delete this site visit? This cannot be undone."
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
