import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllAppointments, upsertAppointment } from '../../services/appointmentService'
import { sendNotification } from '../../utils/notifications'
import type { Appointment } from '../../types'

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MDTasksScreen() {
  const { user } = useAuth()
  const { leads, updateLead } = useCRM()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [mdNotes, setMdNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function load() {
    setIsLoading(true)
    setAppointments(await getAllAppointments())
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  const pending = appointments.filter(a => a.rescheduleRequestStatus === 'requested')

  function leadFor(appt: Appointment) {
    return leads.find(l => l.id === appt.leadId)
  }

  async function handleDecision(approved: boolean) {
    if (!selected) return
    const lead = leadFor(selected)
    setSaving(true)
    const now = new Date().toISOString()
    const updated: Appointment = {
      ...selected,
      status: approved ? 'scheduled' : selected.status,
      scheduledAt: approved ? (selected.rescheduledDate || selected.scheduledAt) : selected.scheduledAt,
      rescheduleRequestStatus: approved ? 'accepted' : 'rejected',
      rescheduleAcceptedBy: approved ? user?.name : undefined,
      rescheduleAcceptedAt: approved ? now : undefined,
      rescheduleMdNotes: mdNotes.trim() || undefined,
      updatedAt: now,
    }
    const result = await upsertAppointment(updated)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Could not record decision.', type: 'error' })
      setSaving(false)
      return
    }
    setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)))
    if (lead) {
      const note = approved
        ? 'MD accepted the appointment reschedule' + (mdNotes.trim() ? `: ${mdNotes.trim()}` : '')
        : `MD rejected the appointment reschedule${mdNotes.trim() ? `: ${mdNotes.trim()}` : ''}`
      await updateLead(lead.id, {}, note)
      if (lead.ownerId) {
        await sendNotification(
          [lead.ownerId],
          approved ? 'Reschedule Accepted' : 'Reschedule Rejected',
          `${lead.name} (${lead.leadNumber ?? lead.id}) — ${approved ? 'MD accepted the reschedule.' : 'MD rejected the reschedule.'}${mdNotes.trim() ? ` Notes: ${mdNotes.trim()}` : ''}`,
        )
      }
    }
    setSelected(null)
    setMdNotes('')
    setSaving(false)
    setSnack({ open: true, msg: approved ? 'Reschedule accepted.' : 'Reschedule rejected.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Task</h1>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#DBEAFE' }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#1D4ED8' }}>Rescheduled Appointments</p>
            <p className="text-3xl font-extrabold" style={{ color: '#1D4ED8' }}>{pending.length}</p>
            <p className="text-xs" style={{ color: '#1D4ED8' }}>waiting for your review</p>
          </div>
          <Wrench size={28} style={{ color: '#3B82F6' }} />
        </div>

        {!isLoading && pending.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No pending tasks.</p>
        )}

        {pending.map(appt => {
          const lead = leadFor(appt)
          return (
            <div key={appt.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-slate-800">Rescheduled Appointment</h3>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
                  Reschedule Request
                </span>
              </div>
              <p className="text-sm text-slate-700 font-semibold">{lead?.name ?? appt.clientName}</p>
              <p className="text-xs text-slate-500">Lead ID: {lead?.leadNumber ?? '—'}</p>
              <p className="text-xs text-slate-500">Contact: {lead?.phone ?? '—'}</p>
              <p className="text-xs text-slate-500">Appointment: {fmtDateTime(appt.scheduledAt)}</p>
              <p className="text-xs text-slate-500 mt-1">Reason: {appt.rescheduleReason}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Pending</span>
                <button onClick={() => setSelected(appt)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white active:opacity-90" style={{ background: '#4F46E5' }}>
                  Update Status
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <BottomSheet isOpen={!!selected} onClose={() => { setSelected(null); setMdNotes('') }} title="Review Reschedule Request">
        {selected && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-sm">
              <p className="font-bold text-slate-800">{leadFor(selected)?.name ?? selected.clientName} {leadFor(selected)?.leadNumber ? `(${leadFor(selected)?.leadNumber})` : ''}</p>
              <p className="text-slate-600">Contact: {leadFor(selected)?.phone ?? '—'}</p>
              <p className="text-slate-600">Appointment: {fmtDateTime(selected.scheduledAt)} — {selected.location}</p>
              {selected.rescheduledDate && <p className="text-slate-600">Requested new date: {fmtDateTime(selected.rescheduledDate)}</p>}
              <p className="text-slate-600">Reason: {selected.rescheduleReason}</p>
              <p className="text-[11px] text-slate-400">Requested by {selected.rescheduleRequestedBy} · {selected.rescheduleRequestedAt ? fmtDateTime(selected.rescheduleRequestedAt) : ''}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">MD Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea value={mdNotes} onChange={e => setMdNotes(e.target.value)} rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="flex gap-2">
              <button disabled={saving} onClick={() => handleDecision(true)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#059669' }}>
                Accept
              </button>
              <button disabled={saving} onClick={() => handleDecision(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold border border-red-200 bg-red-50 text-red-700 active:opacity-90 disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
