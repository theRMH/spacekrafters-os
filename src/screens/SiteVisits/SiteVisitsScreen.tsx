import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllSiteVisits, upsertSiteVisit, deleteSiteVisit } from '../../services/siteVisitService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getRoleDisplayLabel } from '../../data/permissions'
import { addAuditLog } from '../../services/auditLogService'
import { LeadStatusSheet } from '../Leads/LeadStatusSheet'
import type { SiteVisit, SiteVisitRoom, SiteVisitChecklistItem, SiteChecklistItem, AuditLog, ManagedUser } from '../../types'

const CUSTOMER_PRESENCE_OPTIONS: { value: NonNullable<SiteVisit['customerPresence']>; label: string }[] = [
  { value: 'with_customer', label: 'With customer' },
  { value: 'without_customer', label: 'Without customer' },
]

const DEFAULT_CHECKLIST_LABELS = [
  'Electrical points marked',
  'Plumbing points marked',
  'Existing layout photographed',
  'Client requirements discussed',
]

// Standard Yes/No site-condition questions, asked on every visit — distinct
// from the plain done/not-done Checklist above.
const SITE_CHECKLIST_LABELS = [
  'Site accessible?',
  'Power available?',
  'Water available?',
  'Lighting available?',
  'Working area clear?',
  'Material storage available?',
  'Workers allowed inside?',
  'Other contractors present?',
  'Site safe for work?',
]

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function newRoom(): SiteVisitRoom {
  return { id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', measurements: '', lengthFt: '', widthFt: '', heightFt: '', calculatedTotal: '', notes: '' }
}

function parseMeasurements(val?: string): { length: string; width: string } {
  const match = val?.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/)
  return { length: match?.[1] ?? '', width: match?.[2] ?? '' }
}

function formatMeasurements(length: string, width: string, height: string): string {
  return [length, width, height].filter(Boolean).map(v => `${v}ft`).join(' x ')
}

// Total = Length × Width in sq.ft. Height is NOT part of the calculation — it is
// only recorded and shown under the total (see HeightLine below).
function calcRoomTotal(length?: string, width?: string): string {
  const l = parseFloat(length ?? ''), w = parseFloat(width ?? '')
  if (isNaN(l) || isNaN(w)) return ''
  return `${(l * w).toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft`
}

function heightLabel(height?: string): string {
  const h = parseFloat(height ?? '')
  return !isNaN(h) && h > 0 ? `Height: ${h} ft` : ''
}

function defaultChecklist(): SiteVisitChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label, i) => ({ id: `chk_${Date.now()}_${i}`, label, checked: false }))
}

function defaultSiteChecklist(): SiteChecklistItem[] {
  return SITE_CHECKLIST_LABELS.map((label, i) => ({ id: `sitechk_${Date.now()}_${i}`, label, answer: null }))
}

// `embed` = opened from a lead's Update Status sheet: shows only the New Site Visit form over the
// page the user is already on (no page change), and closes itself when the form is dismissed/saved.
export default function SiteVisitsScreen({ embed }: { embed?: { leadId: string; edit?: boolean; onClose: (msg?: string) => void } } = {}) {
  const { user } = useAuth()
  const { leads, updateLead } = useCRM()
  const routerLocation = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SiteVisit | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  // Set (together with returnTo) when this screen was opened via a Lead's
  // leadId deep link that explicitly asked for a return destination. While
  // set, every dismissal of the New/Edit/Detail sheet (X, backdrop tap, or a
  // successful save) returns there instead of leaving the bare Site Visits
  // list showing underneath.
  const [fromLeadId, setFromLeadId] = useState('')
  const [returnTo, setReturnTo] = useState('')
  const [leadId, setLeadId] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])
  const [customerPresence, setCustomerPresence] = useState<NonNullable<SiteVisit['customerPresence']>>('with_customer')
  const [rooms, setRooms] = useState<SiteVisitRoom[]>([newRoom()])
  const [checklist, setChecklist] = useState<SiteVisitChecklistItem[]>(defaultChecklist())
  const [siteChecklist, setSiteChecklist] = useState<SiteChecklistItem[]>(defaultSiteChecklist())
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [assignableMembers, setAssignableMembers] = useState<ManagedUser[]>([])
  // Site Visit completion is a Lead-level action (LeadStatusSheet's
  // canCompleteSiteVisit) — this just surfaces that sheet inline from here,
  // rather than inventing a separate SiteVisit-level status control.
  const [quickStatusLeadId, setQuickStatusLeadId] = useState<string | null>(null)

  async function refresh() {
    setIsLoading(true)
    setVisits(await getAllSiteVisits())
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    getManagedUsersDirectory().then(users => setAssignableMembers(users.filter(u => u.status === 'active')))
  }, [])

  function toggleTeamMember(id: string) {
    setTeamMemberIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function namesFor(ids: string[]): string[] {
    return ids.map(id => assignableMembers.find(m => m.id === id)?.fullName ?? (id === user?.id ? user?.name : undefined) ?? 'Unknown')
  }

  // Site Visits schedules independently of Appointments — this only carries
  // the lead forward from a "Log Site Visit" deep link elsewhere in the app
  // (e.g. Leads), it doesn't touch or depend on any appointment record.
  useEffect(() => {
    const state = routerLocation.state as { leadId?: string; returnTo?: string } | null
    if (!state?.leadId) return
    setLeadId(state.leadId)
    setShowNew(true)
    // returnTo is only sent when this came from LeadStatusSheet's "Go to Site
    // Visits →" — not when reached some other way (e.g. direct sidebar nav).
    if (state.returnTo) { setFromLeadId(state.leadId); setReturnTo(state.returnTo) }
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state])

  function leadName(id: string): string {
    return leads.find(l => l.id === id)?.name ?? id
  }

  useEffect(() => {
    if (!embed || isLoading) return
    if (embed.edit) {
      const visit = visits.filter(v => v.leadId === embed.leadId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      if (!visit) { embed.onClose('No site visit to edit.'); return }
      setSelected(visit)
      openEdit(visit)
      return
    }
    resetForm()
    setLeadId(embed.leadId)
    setShowNew(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  // Closes a sheet normally, unless this screen was entered via a Lead deep
  // link carrying returnTo — then every dismissal (X, backdrop, Cancel, or a
  // completed save) returns to that origin page instead.
  function dismiss(closeLocally: () => void, doneMsg?: string) {
    if (embed) {
      embed.onClose(doneMsg)
    } else if (returnTo) {
      const id = fromLeadId
      const to = returnTo
      setFromLeadId(''); setReturnTo('')
      navigate(to, { state: { leadId: id } })
    } else {
      closeLocally()
    }
  }

  function resetForm() {
    setLeadId(''); setVisitDate(''); setCustomerPresence('with_customer'); setTeamMemberIds(user ? [user.id] : []); setRooms([newRoom()]); setChecklist(defaultChecklist())
    setSiteChecklist(defaultSiteChecklist())
    setNotes(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(visit: SiteVisit) {
    setLeadId(visit.leadId); setVisitDate(visit.visitDate.slice(0, 10))
    setCustomerPresence(visit.customerPresence ?? 'with_customer')
    setTeamMemberIds(visit.teamMemberIds ?? [])
    // Backfill lengthFt/widthFt for rooms saved before the two-box measurement
    // input existed — they only have the combined "12ft x 14ft" string.
    const roomsWithFt = visit.rooms.map(r => {
      const hasFt = r.lengthFt !== undefined || r.widthFt !== undefined
      const { length, width } = hasFt ? { length: r.lengthFt, width: r.widthFt } : parseMeasurements(r.measurements)
      return { ...r, lengthFt: length, widthFt: width, calculatedTotal: calcRoomTotal(length, width) || r.calculatedTotal }
    })
    setRooms(roomsWithFt.length ? roomsWithFt : [newRoom()])
    setChecklist(visit.checklist.length ? visit.checklist : defaultChecklist())
    setSiteChecklist(visit.siteChecklist?.length ? visit.siteChecklist : defaultSiteChecklist())
    setNotes(visit.notes ?? '')
    setFormError('')
    setShowEdit(true)
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

  // Ticked = Yes; unticked = not answered (null), so an untouched item still
  // never reads as a confirmed "No".
  function toggleSiteChecklistItem(id: string) {
    setSiteChecklist(prev => prev.map(c => (c.id === id ? { ...c, answer: c.answer === 'yes' ? null : 'yes' } : c)))
  }

  async function handleAddVisit() {
    const validRooms = rooms.filter(r => r.name.trim())
    if (!leadId || !visitDate || validRooms.length === 0 || teamMemberIds.length === 0) {
      setFormError('Lead, visit date, team members, and at least one named room are required.')
      return
    }
    if (visitDate < todayStr()) {
      setFormError('Cannot log a site visit for a past date.')
      return
    }
    const now = new Date().toISOString()
    const visit: SiteVisit = {
      id: `sv_${Date.now()}`,
      leadId, visitDate: new Date(visitDate).toISOString(), customerPresence,
      teamMemberIds, teamMemberNames: namesFor(teamMemberIds),
      rooms: validRooms, checklist, siteChecklist, notes: notes.trim() || undefined,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertSiteVisit(visit)
    if (!result.ok) { setFormError(result.error ?? 'Could not save site visit.'); return }
    setVisits(prev => [visit, ...prev])
    // Submitting the visit is the confirmation — move the lead on to Site Visit Done by itself.
    const lead = leads.find(l => l.id === leadId)
    if (lead && (lead.status === 'qualified' || lead.status === 'site_visit_scheduled')) {
      await updateLead(lead.id, { status: 'site_visit_done' }, 'Site visit recorded')
    }
    dismiss(() => setShowNew(false), 'Site visit recorded — lead moved to Site Visit Done.')
    setSnack({ open: true, msg: 'Site visit recorded!', type: 'success' })
  }

  async function handleUpdateVisit() {
    if (!selected) return
    const validRooms = rooms.filter(r => r.name.trim())
    if (!visitDate || validRooms.length === 0 || teamMemberIds.length === 0) {
      setFormError('Visit date, team members, and at least one named room are required.')
      return
    }
    const updated: SiteVisit = {
      ...selected, leadId, visitDate: new Date(visitDate).toISOString(), customerPresence,
      teamMemberIds, teamMemberNames: namesFor(teamMemberIds),
      rooms: validRooms, checklist, siteChecklist, notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertSiteVisit(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update site visit.'); return }
    setVisits(prev => prev.map(v => (v.id === updated.id ? updated : v)))
    dismiss(() => { setShowEdit(false); setSelected(null) }, 'Site visit updated.')
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

  // Sort by status (sidebar "Site Visit Sort" uses ?status=). Scheduled = leads
  // whose status is Site Visit Scheduled and have no recorded visit yet; Done =
  // the recorded visits above.
  const statusParam = searchParams.get('status')
  const view: 'all' | 'scheduled' | 'done' = statusParam === 'scheduled' || statusParam === 'done' ? statusParam : 'all'
  const leadIdsWithVisit = new Set(visits.map(v => v.leadId))
  const scheduledLeads = leads.filter(l =>
    l.status === 'site_visit_scheduled' && !leadIdsWithVisit.has(l.id) &&
    (!search || l.name.toLowerCase().includes(search.toLowerCase())))
  const showScheduled = view !== 'done'
  const showDone = view !== 'scheduled'
  const nothingToShow = (!showScheduled || scheduledLeads.length === 0) && (!showDone || filtered.length === 0)
  const statusChips = [
    { value: 'all' as const, label: 'All', count: scheduledLeads.length + filtered.length },
    { value: 'scheduled' as const, label: 'Scheduled', count: scheduledLeads.length },
    { value: 'done' as const, label: 'Done', count: filtered.length },
  ]

  return (
    <div className={embed ? '' : 'min-h-screen bg-slate-50 pb-24'}>
      {!embed && <>
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
        <FilterChips
          chips={statusChips}
          active={view}
          onChange={v => setSearchParams(v === 'all' ? {} : { status: v }, { replace: true })}
          className="mt-3"
        />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && showScheduled && scheduledLeads.map(lead => (
          <div key={lead.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-sm font-bold text-slate-800">{lead.name}</span>
              <span className="text-slate-300 text-xs">|</span>
              <span className="text-xs text-slate-500">{lead.city}</span>
            </div>
            <p className="text-xs text-slate-600">Site visit scheduled — not recorded yet</p>
            <button onClick={() => setQuickStatusLeadId(lead.id)}
              className="w-full mt-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 active:bg-blue-100">
              Update Status
            </button>
          </div>
        ))}
        {!isLoading && showDone && filtered.map(visit => {
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
                  <p className="text-[12px] text-slate-400 mt-0.5">{checked}/{visit.checklist.length} checklist items done</p>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setQuickStatusLeadId(visit.leadId) }}
                className="w-full mt-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 active:bg-blue-100">
                Update Status
              </button>
            </div>
          )
        })}

        {!isLoading && nothingToShow && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📐</p>
            <p className="text-sm">No site visits found</p>
          </div>
        )}
      </div>

      </>}

      {/* Site Visit Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => dismiss(() => setSelected(null))} title={selected ? leadName(selected.leadId) : ''} height="full">
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

            {selected.customerPresence && (
              <p className="text-xs text-slate-500">{selected.customerPresence === 'with_customer' ? 'With customer' : 'Without customer'}</p>
            )}

            {selected.teamMemberNames && selected.teamMemberNames.length > 0 && (
              <p className="text-xs text-slate-500">Team: {selected.teamMemberNames.join(', ')}</p>
            )}

            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rooms</p>
              <div className="space-y-2">
                {selected.rooms.map(room => (
                  <div key={room.id} className="bg-slate-50 rounded-2xl p-3.5">
                    <p className="text-sm font-bold text-slate-800 mb-1">{room.name}</p>
                    {room.measurements && <p className="text-xs text-slate-600 mb-1">📏 {room.measurements}</p>}
                    {(calcRoomTotal(room.lengthFt, room.widthFt) || room.calculatedTotal) && (
                      <p className="text-xl font-bold text-indigo-600 mb-0.5">Total: {calcRoomTotal(room.lengthFt, room.widthFt) || room.calculatedTotal}</p>
                    )}
                    {heightLabel(room.heightFt) && <p className="text-xs text-slate-500 mb-1">{heightLabel(room.heightFt)}</p>}
                    {room.notes && <p className="text-xs text-slate-500">{room.notes}</p>}
                    {room.photos && room.photos.length > 0 && (
                      <MultiFileUploadField label="Room Photos" files={room.photos} onChange={() => {}} accept="image/*" uploadButtonLabel="Upload Photo" readOnly />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</p>
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 space-y-2">
                {selected.checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={`text-sm ${item.checked ? 'text-emerald-600' : 'text-slate-300'}`}>{item.checked ? '✓' : '○'}</span>
                    <span className={`text-xs ${item.checked ? 'text-slate-700' : 'text-slate-400'}`}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {selected.siteChecklist && selected.siteChecklist.length > 0 && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Site Checklist</p>
                <div className="bg-white border border-slate-100 rounded-2xl p-3.5 space-y-2">
                  {selected.siteChecklist.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">{item.label}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        item.answer === 'yes' ? 'bg-emerald-50 text-emerald-700' : item.answer === 'no' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {item.answer === 'yes' ? 'Yes' : item.answer === 'no' ? 'No' : 'Not answered'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.notes && (
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
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
        onClose={() => dismiss(() => { setShowNew(false); setShowEdit(false) })}
        title={showEdit ? 'Edit Site Visit' : 'New Site Visit'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead *</label>
            {showEdit ? (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 opacity-60">
                {leadName(leadId)}
              </div>
            ) : (
              <SearchableSelect
                value={leadId} onChange={setLeadId}
                options={leads.map(l => ({ value: l.id, label: `${l.name} — ${l.city}` }))}
                placeholder="Select a lead…" searchPlaceholder="Search leads…"
              />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Visit Type *</label>
            <SearchableSelect
              value={customerPresence} onChange={v => setCustomerPresence(v as NonNullable<SiteVisit['customerPresence']>)}
              options={CUSTOMER_PRESENCE_OPTIONS}
              placeholder="With or without customer…" searchPlaceholder="Search…"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Visit Date *</label>
            <DateField value={visitDate} min={showEdit ? undefined : todayStr()}
              onChange={v => setVisitDate(!showEdit && v < todayStr() ? todayStr() : v)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Team Members *</label>
            <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-56 overflow-y-auto">
              {assignableMembers.map(m => {
                const isChecked = teamMemberIds.includes(m.id)
                return (
                  <button type="button" key={m.id} onClick={() => toggleTeamMember(m.id)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-slate-100">
                    {isChecked ? <CheckSquare size={17} className="text-indigo-600 shrink-0" /> : <Square size={17} className="text-slate-300 shrink-0" />}
                    <span className="text-sm text-slate-700 truncate">{m.fullName}</span>
                    <span className="text-[12px] text-slate-400 ml-auto shrink-0">{getRoleDisplayLabel(m.role, m.displayRole)}</span>
                  </button>
                )
              })}
              {assignableMembers.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No active team members found</p>
              )}
            </div>
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
                      onChange={e => updateRoom(room.id, {
                        lengthFt: e.target.value, measurements: formatMeasurements(e.target.value, room.widthFt ?? '', room.heightFt ?? ''),
                        calculatedTotal: calcRoomTotal(e.target.value, room.widthFt),
                      })}
                      placeholder="Length (ft)"
                      className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <span className="text-slate-400 text-sm">×</span>
                    <input type="number" min="0" step="0.01" value={room.widthFt ?? ''}
                      onChange={e => updateRoom(room.id, {
                        widthFt: e.target.value, measurements: formatMeasurements(room.lengthFt ?? '', e.target.value, room.heightFt ?? ''),
                        calculatedTotal: calcRoomTotal(room.lengthFt, e.target.value),
                      })}
                      placeholder="Width (ft)"
                      className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <span className="text-slate-300 text-sm">|</span>
                    <input type="number" min="0" step="0.01" value={room.heightFt ?? ''}
                      onChange={e => updateRoom(room.id, {
                        heightFt: e.target.value, measurements: formatMeasurements(room.lengthFt ?? '', room.widthFt ?? '', e.target.value),
                      })}
                      placeholder="Height (ft)"
                      className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  {room.calculatedTotal && (
                    <p className="text-xl font-bold text-indigo-600">Total: {room.calculatedTotal}</p>
                  )}
                  {heightLabel(room.heightFt) && <p className="text-xs text-slate-500 -mt-1">{heightLabel(room.heightFt)}</p>}
                  <input value={room.notes ?? ''} onChange={e => updateRoom(room.id, { notes: e.target.value })}
                    placeholder="Scope of Works (optional)"
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
              {siteChecklist.map(item => (
                <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={item.answer === 'yes'} onChange={() => toggleSiteChecklistItem(item.id)}
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

      {quickStatusLeadId && (() => {
        const quickStatusLead = leads.find(l => l.id === quickStatusLeadId)
        return quickStatusLead ? (
          <LeadStatusSheet
            isOpen={!!quickStatusLeadId}
            onClose={() => setQuickStatusLeadId(null)}
            lead={quickStatusLead}
            onDone={(msg) => setSnack({ open: true, msg, type: 'success' })}
          />
        ) : null
      })()}
    </div>
  )
}
