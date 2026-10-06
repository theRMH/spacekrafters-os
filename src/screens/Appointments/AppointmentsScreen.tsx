import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, MapPin, CheckSquare, Square } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { TimeField } from '../../components/forms/TimeField'
import { FilterChips } from '../../components/forms/FilterChips'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllAppointments, upsertAppointment, deleteAppointment } from '../../services/appointmentService'
import { addAuditLog } from '../../services/auditLogService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getRoleDisplayLabel } from '../../data/permissions'
import { sendNotification } from '../../utils/notifications'
import { fmtDateTime, toLocalInputValue, todayInputValue, nowTimeInputValue, isPastScheduledAt, toProperIso } from './appointmentDate'
import type { Appointment, AppointmentStatus, AuditLog, ManagedUser } from '../../types'

type Filter = 'all' | AppointmentStatus

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',         label: 'All'         },
  { value: 'scheduled',   label: 'Scheduled'   },
  { value: 'completed',   label: 'Completed'   },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'cancelled',   label: 'Cancelled'   },
]

// Older appointments only ever had a single coordinator — fall back to that
// when assignedToNames isn't there.
function assigneeSummary(appt: Appointment): string {
  const names = appt.assignedToNames && appt.assignedToNames.length > 0 ? appt.assignedToNames : [appt.coordinatorName]
  if (names.length === 1) return `Coordinator: ${names[0]}`
  if (names.length <= 3) return `Assigned to: ${names.join(', ')}`
  return `Assigned to: ${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

export default function AppointmentsScreen() {
  const { user } = useAuth()
  const { leads } = useCRM()
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [leadId, setLeadId] = useState('')
  const [clientName, setClientName] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<AppointmentStatus>('scheduled')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [assignableMembers, setAssignableMembers] = useState<ManagedUser[]>([])
  const [assignedToIds, setAssignedToIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setIsLoading(true)
    setAppointments(await getAllAppointments())
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    getManagedUsersDirectory().then(users => setAssignableMembers(users.filter(u => u.status === 'active')))
  }, [])

  function toggleAssignee(id: string) {
    setAssignedToIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function toggleSelectAllAssignees() {
    setAssignedToIds(prev =>
      prev.length === assignableMembers.length ? [] : assignableMembers.map(m => m.id)
    )
  }

  useEffect(() => {
    const state = routerLocation.state as { leadId?: string } | null
    if (!state?.leadId) return
    handleLeadPick(state.leadId)
    setShowNew(true)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state])

  // Deep-link from the Tasks screen's Appointment Status section — opens this
  // appointment's Detail sheet directly. Waits for the list to actually finish
  // loading (not just a non-empty check — zero appointments is itself a valid
  // loaded state) before searching, and always clears the router state once
  // resolved, found or not, same as the leadId effect above.
  useEffect(() => {
    const state = routerLocation.state as { appointmentId?: string } | null
    if (!state?.appointmentId) return
    if (isLoading) return
    const found = appointments.find(a => a.id === state.appointmentId)
    if (found) setSelected(found)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state, appointments, isLoading])

  function resetForm() {
    setLeadId(''); setClientName(''); setScheduledAt(`${todayInputValue()}T`); setLocation('')
    setStatus('scheduled'); setNotes(''); setFormError('')
    setAssignedToIds(user ? [user.id] : [])
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(appt: Appointment) {
    setLeadId(appt.leadId); setClientName(appt.clientName)
    setScheduledAt(toLocalInputValue(appt.scheduledAt)); setLocation(appt.location)
    setStatus(appt.status); setNotes(appt.notes ?? '')
    setAssignedToIds(appt.assignedToIds ?? (appt.coordinatorId ? [appt.coordinatorId] : []))
    setFormError('')
    setShowEdit(true)
  }

  function namesFor(ids: string[]): string[] {
    return ids.map(id => assignableMembers.find(m => m.id === id)?.fullName ?? (id === user?.id ? user?.name : undefined) ?? 'Unknown')
  }

  function handleLeadPick(id: string) {
    setLeadId(id)
    const lead = leads.find(l => l.id === id)
    if (lead) { setClientName(lead.name); setLocation(lead.city) }
  }

  async function handleAddAppointment() {
    if (saving) return
    if (!leadId || !clientName.trim() || !scheduledAt.split('T')[1] || !location.trim() || assignedToIds.length === 0) {
      setFormError('Lead, client name, date/time, location, and at least one assignee are required.')
      return
    }
    if (isPastScheduledAt(scheduledAt)) {
      setFormError('Please select a date & time that has not already passed.')
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    const assignedToNames = namesFor(assignedToIds)
    const appt: Appointment = {
      id: `appt_${Date.now()}`,
      leadId, clientName: clientName.trim(),
      scheduledAt: toProperIso(scheduledAt),
      location: location.trim(),
      coordinatorId: assignedToIds[0], coordinatorName: assignedToNames[0],
      assignedToIds, assignedToNames,
      status: 'scheduled', notes: notes.trim() || undefined,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertAppointment(appt)
    setSaving(false)
    if (!result.ok) { setFormError(result.error ?? 'Could not save appointment.'); return }
    setAppointments(prev => [appt, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Appointment scheduled!', type: 'success' })

    const notifyIds = assignedToIds.filter(id => id !== user?.id)
    if (notifyIds.length > 0) {
      sendNotification(
        notifyIds,
        'Site Visit Assigned',
        `${clientName.trim()} — ${fmtDateTime(appt.scheduledAt)} at ${appt.location}`,
        '/appointments',
      )
    }
  }

  async function handleUpdateAppointment() {
    if (saving) return
    if (!selected) return
    if (!clientName.trim() || !scheduledAt.split('T')[1] || !location.trim() || assignedToIds.length === 0) {
      setFormError('Client name, date/time, location, and at least one assignee are required.')
      return
    }
    // Only non-owners are blocked from editing the date/time at all (see the
    // read-only field below) — but an owner editing it directly should still
    // be held to the same "not in the past" rule new appointments get. Only
    // checked when the value actually changed, so editing notes/location on
    // an appointment that already happened in the past isn't blocked.
    if (scheduledAt !== toLocalInputValue(selected.scheduledAt) && isPastScheduledAt(scheduledAt)) {
      setFormError('Please select a date & time that has not already passed.')
      return
    }
    setSaving(true)
    const assignedToNames = namesFor(assignedToIds)
    const updated: Appointment = {
      ...selected, leadId, clientName: clientName.trim(),
      scheduledAt: toProperIso(scheduledAt),
      location: location.trim(), status, notes: notes.trim() || undefined,
      coordinatorId: assignedToIds[0], coordinatorName: assignedToNames[0],
      assignedToIds, assignedToNames,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertAppointment(updated)
    setSaving(false)
    if (!result.ok) { setFormError(result.error ?? 'Could not update appointment.'); return }
    setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)))
    setShowEdit(false)
    setSelected(null)

    const previouslyAssigned = new Set(selected.assignedToIds ?? (selected.coordinatorId ? [selected.coordinatorId] : []))
    const newlyAssignedIds = assignedToIds.filter(id => id !== user?.id && !previouslyAssigned.has(id))
    if (newlyAssignedIds.length > 0) {
      sendNotification(
        newlyAssignedIds,
        'Site Visit Assigned',
        `${clientName.trim()} — ${fmtDateTime(updated.scheduledAt)} at ${updated.location}`,
        '/appointments',
      )
    }
    setSnack({ open: true, msg: 'Appointment updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteAppointment(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete appointment.', type: 'error' }); return }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'appointment_deleted',
        description: `Appointment with "${selected.clientName}" on ${fmtDateTime(selected.scheduledAt)} deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setAppointments(prev => prev.filter(a => a.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Appointment deleted.', type: 'success' })
  }

  const filtered = appointments.filter(a => {
    const matchSearch = !search
      || a.clientName.toLowerCase().includes(search.toLowerCase())
      || a.location.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || a.status === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Appointments</h1>
          <PermissionGate permission="add_appointment">
            <button onClick={openNew} aria-label="Add new appointment"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search appointments…" className="mb-3" />
        <FilterChips chips={CHIPS} active={filter} onChange={setFilter} />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(appt => (
          <div key={appt.id} onClick={() => setSelected(appt)}
            className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="text-sm font-bold text-slate-800">{appt.clientName}</span>
                  <span className="text-slate-300 text-xs">|</span>
                  <span className="text-xs text-slate-500">{fmtDateTime(appt.scheduledAt)}</span>
                </div>
                <p className="text-xs text-slate-600 flex items-center gap-1 mb-1">
                  <MapPin size={12} className="text-slate-400" /> {appt.location}
                </p>
                <p className="text-[12px] text-slate-400">{assigneeSummary(appt)}</p>
              </div>
              <StatusBadge status={appt.status} size="xs" />
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm">No appointments found</p>
          </div>
        )}
      </div>

      {/* Appointment Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected?.clientName ?? ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={selected.status} size="md" />
              <PermissionGate permission="edit_appointment">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  Edit
                </button>
              </PermissionGate>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
              {[
                { label: 'Lead',        value: leads.find(l => l.id === selected.leadId)?.name ?? selected.leadId },
                { label: 'Date & Time', value: fmtDateTime(selected.scheduledAt) },
                { label: 'Location',    value: selected.location },
                { label: 'Assigned To', value: (selected.assignedToNames && selected.assignedToNames.length > 0 ? selected.assignedToNames : [selected.coordinatorName]).join(', ') },
                { label: 'Notes',       value: selected.notes ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
                  <span className="text-xs font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>

            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Appointment
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Appointment Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Appointment' : 'New Appointment'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead *</label>
            {showEdit ? (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 opacity-60">
                {leads.find(l => l.id === leadId)?.name ?? leadId}
              </div>
            ) : (
              <SearchableSelect
                value={leadId} onChange={handleLeadPick}
                options={leads.map(l => ({ value: l.id, label: `${l.name} — ${l.city}` }))}
                placeholder="Select a lead…" searchPlaceholder="Search leads…"
              />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Client Name *</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-500 block">Assign To *</label>
              <button type="button" onClick={toggleSelectAllAssignees}
                className="text-[11px] font-semibold text-indigo-600 active:opacity-70">
                {assignedToIds.length === assignableMembers.length && assignableMembers.length > 0 ? 'Clear all' : 'Select Everyone'}
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-56 overflow-y-auto">
              {assignableMembers.map(m => {
                const isChecked = assignedToIds.includes(m.id)
                return (
                  <button type="button" key={m.id} onClick={() => toggleAssignee(m.id)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-slate-100">
                    {isChecked ? <CheckSquare size={17} className="text-indigo-600 shrink-0" /> : <Square size={17} className="text-slate-300 shrink-0" />}
                    <span className="text-sm text-slate-700 truncate w-40 sm:w-64 shrink-0">{m.fullName}</span>
                    <span className="text-[12px] text-slate-400 truncate">{getRoleDisplayLabel(m.role, m.displayRole)}</span>
                  </button>
                )
              })}
              {assignableMembers.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No active team members found</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date & Time *</label>
            {showEdit && user?.role !== 'owner' ? (
              <>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 opacity-60">
                  {fmtDateTime(selected?.scheduledAt ?? '')}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  To change the date/time, use "Rescheduled" on the lead — the MD needs to approve it.
                </p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <DateField value={scheduledAt.split('T')[0] || ''} min={todayInputValue()}
                  onChange={date => {
                    let time = scheduledAt.split('T')[1] || '09:00'
                    if (date === todayInputValue() && time < nowTimeInputValue()) time = nowTimeInputValue()
                    setScheduledAt(`${date}T${time}`)
                  }} />
                <TimeField value={scheduledAt.split('T')[1] || ''}
                  min={(scheduledAt.split('T')[0] || todayInputValue()) === todayInputValue() ? nowTimeInputValue() : undefined}
                  onChange={time => {
                    const date = scheduledAt.split('T')[0] || todayInputValue()
                    if (date === todayInputValue() && time < nowTimeInputValue()) time = nowTimeInputValue()
                    setScheduledAt(`${date}T${time}`)
                  }} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Location *</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          {showEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
              {/* 'Rescheduled' is deliberately not selectable here — that status only
                  ever comes from the "Rescheduled" lead action + MD approval flow
                  (see LeadStatusSheet.submitReschedule); picking it directly here
                  would set status='rescheduled' with none of the reason/approval
                  fields that flow needs, a dead end no one could act on. */}
              <SearchableSelect value={status} onChange={v => setStatus(v as AppointmentStatus)}
                options={CHIPS.filter(c => c.value !== 'all' && (c.value !== 'rescheduled' || status === 'rescheduled'))} />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button
            onClick={showEdit ? handleUpdateAppointment : handleAddAppointment}
            disabled={saving}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90 disabled:opacity-60"
            style={{ background: '#C9A24B' }}
          >
            {saving ? 'Saving…' : showEdit ? 'Save Changes' : 'Schedule Appointment'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Appointment"
        message="Are you sure you want to delete this appointment? This cannot be undone."
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
