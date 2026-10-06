import { useEffect, useState } from 'react'
import { Plus, Check, X as XIcon, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllLeaveApplications, upsertLeaveApplication, deleteLeaveApplication } from '../../services/leaveService'
import { addAuditLog } from '../../services/auditLogService'
import { getManagedUsersDirectory } from '../../services/userService'
import { sendNotification } from '../../utils/notifications'
import { hasPermission } from '../../utils/permissions'
import type { LeaveApplication, AuditLog, ManagedUser } from '../../types'

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-primary'
const lbl = 'text-xs font-semibold text-slate-500 mb-1.5 block'

export default function LeaveScreen() {
  const { user, can } = useAuth()
  const canApprove = can('approve_leave')

  const [leaves, setLeaves] = useState<LeaveApplication[]>([])
  const [team, setTeam] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LeaveApplication | null>(null)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [targetUserId, setTargetUserId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    setIsLoading(true)
    const [lv, dir] = await Promise.all([
      getAllLeaveApplications(),
      canApprove ? getManagedUsersDirectory() : Promise.resolve([]),
    ])
    setLeaves(lv)
    setTeam(dir)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [canApprove])

  const visibleLeaves = canApprove ? leaves : leaves.filter(l => l.userId === user?.id)

  function todayStr(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  function resetForm() {
    setTargetUserId(user?.id ?? ''); setFromDate(todayStr()); setToDate(''); setReason(''); setNotes(''); setError('')
  }

  async function handleCreate() {
    if (!fromDate || !toDate || !reason.trim()) {
      setError('Dates and reason are required.')
      return
    }
    if (toDate < fromDate) {
      setError('Leave To Date must be on or after Leave From Date.')
      return
    }
    if (!user) return
    const target = targetUserId === user.id || !targetUserId
      ? { id: user.id, name: user.name }
      : team.find(m => m.id === targetUserId)
    if (!target) { setError('Select who this leave is for.'); return }
    const now = new Date().toISOString()
    const leave: LeaveApplication = {
      id: `leave_${Date.now()}`,
      userId: target.id,
      userName: 'name' in target ? target.name : target.fullName,
      fromDate, toDate,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertLeaveApplication(leave)
    if (!result.ok) { setError(result.error ?? 'Could not save leave application.'); return }
    setLeaves(prev => [leave, ...prev])
    setShowNew(false)
    resetForm()
    setSnack({ open: true, msg: 'Leave application submitted!', type: 'success' })
    notifyApprovers(leave)
  }

  // Alerts everyone who can approve leave (MD/Admin) the moment a request
  // comes in, across every notification channel (push + SMS + WhatsApp) —
  // best-effort, same convention as syncManagedUserAuth: never blocks or
  // fails the actual leave submission, which has already succeeded by the
  // time this runs.
  async function notifyApprovers(leave: LeaveApplication) {
    if (!user) return
    const directory = canApprove ? team : await getManagedUsersDirectory()
    const approverIds = directory
      .filter(m => m.id !== user.id && hasPermission(m.roles ?? m.role, 'approve_leave'))
      .map(m => m.id)
    if (approverIds.length === 0) return
    await sendNotification(
      approverIds,
      'New Leave Request',
      `${leave.userName} requested leave: ${leave.fromDate} → ${leave.toDate}`,
      '/leave',
    )
  }

  async function handleDecide(target: LeaveApplication, status: 'approved' | 'rejected') {
    const updated: LeaveApplication = { ...target, status, updatedAt: new Date().toISOString() }
    const result = await upsertLeaveApplication(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not update leave.', type: 'error' }); return }
    setLeaves(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSnack({ open: true, msg: `Leave ${status}.`, type: 'success' })
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: `leave_${status}`,
        description: `Leave application for ${updated.userName} (${updated.fromDate} → ${updated.toDate}) ${status}.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const result = await deleteLeaveApplication(deleteTarget.id)
    setDeleteTarget(null)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete leave application.', type: 'error' }); return }
    setLeaves(prev => prev.filter(l => l.id !== deleteTarget.id))
    setSnack({ open: true, msg: 'Leave application deleted.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-slate-800">Leave</h1>
            <p className="text-xs text-slate-500">{visibleLeaves.length} {canApprove ? 'total' : 'of your'} application{visibleLeaves.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowNew(true) }}
            className="flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl active:opacity-90"
            style={{ background: '#0F2A4A' }}
          >
            <Plus size={14} /> New Leave
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && visibleLeaves.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">🗓️</p>
            <p className="text-sm">No leave applications yet</p>
          </div>
        )}
        {visibleLeaves.map(l => (
          <div key={l.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{l.userName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{l.fromDate} → {l.toDate}</p>
                <p className="text-xs text-slate-600 mt-1">{l.reason}</p>
                {l.notes && <p className="text-[12px] text-slate-400 mt-1">Notes: {l.notes}</p>}
              </div>
              <StatusBadge status={l.status} size="xs" />
            </div>
            {l.status === 'pending' && canApprove && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => handleDecide(l, 'approved')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold active:bg-emerald-100">
                  <Check size={13} /> Approve
                </button>
                <button onClick={() => handleDecide(l, 'rejected')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold active:bg-red-100">
                  <XIcon size={13} /> Reject
                </button>
              </div>
            )}
            {user?.role === 'owner' && (
              <div className="flex justify-end mt-2 pt-2 border-t border-slate-50">
                <button onClick={() => setDeleteTarget(l)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 active:text-red-600">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="New Leave Application" height="full">
        <div className="space-y-4">
          {canApprove && (
            <div>
              <label className={lbl}>For</label>
              <SearchableSelect value={targetUserId} onChange={setTargetUserId} options={[
                ...(user ? [{ value: user.id, label: `${user.name} (Me)` }] : []),
                ...team.filter(m => m.id !== user?.id).map(m => ({ value: m.id, label: `${m.fullName} — ${m.displayRole}` })),
              ]} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Leave From Date *</label>
              <DateField value={fromDate} min={todayStr()} onChange={setFromDate} />
            </div>
            <div>
              <label className={lbl}>Leave To Date *</label>
              <DateField value={toDate} min={fromDate || todayStr()} onChange={setToDate} />
            </div>
          </div>
          <div>
            <label className={lbl}>Reason *</label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Reason for leave…" className={`${inp} resize-none`} />
          </div>
          <div>
            <label className={lbl}>Notes <span className="text-slate-300 font-normal">(optional)</span></label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes…" className={`${inp} resize-none`} />
          </div>
          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
          <button onClick={handleCreate}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            Submit Leave Application
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Leave Application"
        message={`This permanently deletes ${deleteTarget?.userName ?? 'this'}'s leave application. This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
