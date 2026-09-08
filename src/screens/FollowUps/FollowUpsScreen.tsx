import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllFollowUps, upsertFollowUp, deleteFollowUp } from '../../services/followUpService'
import type { FollowUp, FollowUpStatus } from '../../types'

type Filter = 'all' | FollowUpStatus

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',     label: 'All'     },
  { value: 'pending', label: 'Pending' },
  { value: 'done',    label: 'Done'    },
  { value: 'overdue', label: 'Overdue' },
]

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isOverdue(followUp: FollowUp): boolean {
  if (followUp.status !== 'pending') return false
  return new Date(followUp.dueDate).getTime() < Date.now()
}

export default function FollowUpsScreen() {
  const { user } = useAuth()
  const { leads } = useCRM()

  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FollowUp | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [leadId, setLeadId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<FollowUpStatus>('pending')
  const [outcomeNote, setOutcomeNote] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    setFollowUps(await getAllFollowUps())
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function resetForm() {
    setLeadId(''); setDueDate(''); setStatus('pending'); setOutcomeNote(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(followUp: FollowUp) {
    setLeadId(followUp.leadId); setDueDate(followUp.dueDate.slice(0, 10))
    setStatus(followUp.status); setOutcomeNote(followUp.outcomeNote ?? '')
    setFormError('')
    setShowEdit(true)
  }

  function leadName(id: string): string {
    return leads.find(l => l.id === id)?.name ?? id
  }

  async function handleAddFollowUp() {
    if (!leadId || !dueDate) {
      setFormError('Lead and due date are required.')
      return
    }
    const now = new Date().toISOString()
    const followUp: FollowUp = {
      id: `fu_${Date.now()}`,
      leadId, dueDate: new Date(dueDate).toISOString(),
      ownerId: user?.id, ownerName: user?.name ?? 'Unassigned',
      status: 'pending', outcomeNote: outcomeNote.trim() || undefined,
      createdAt: now, updatedAt: now,
    }
    const result = await upsertFollowUp(followUp)
    if (!result.ok) { setFormError(result.error ?? 'Could not save follow-up.'); return }
    setFollowUps(prev => [followUp, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Follow-up created!', type: 'success' })
  }

  async function handleUpdateFollowUp() {
    if (!selected) return
    if (!dueDate) {
      setFormError('Due date is required.')
      return
    }
    const updated: FollowUp = {
      ...selected, leadId, dueDate: new Date(dueDate).toISOString(),
      status, outcomeNote: outcomeNote.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = await upsertFollowUp(updated)
    if (!result.ok) { setFormError(result.error ?? 'Could not update follow-up.'); return }
    setFollowUps(prev => prev.map(f => (f.id === updated.id ? updated : f)))
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Follow-up updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteFollowUp(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete follow-up.', type: 'error' }); return }
    setFollowUps(prev => prev.filter(f => f.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Follow-up deleted.', type: 'success' })
  }

  const filtered = followUps.filter(f => {
    const matchSearch = !search || leadName(f.leadId).toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all'
      || (filter === 'overdue' ? isOverdue(f) : f.status === filter)
    return matchSearch && matchFilter
  })

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Follow-Ups</h1>
          {/* No dedicated add_follow_up permission exists yet; add_appointment has the same owner/project_coordinator role set as sks_follow_ups' RLS insert policy. */}
          <PermissionGate permission="add_appointment">
            <button onClick={openNew} aria-label="Add new follow-up"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by lead name…" className="mb-3" />
        <FilterChips chips={CHIPS} active={filter} onChange={setFilter} />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(followUp => {
          const overdue = isOverdue(followUp)
          return (
            <div key={followUp.id} onClick={() => setSelected(followUp)}
              className={`w-full text-left bg-white rounded-2xl shadow-card border p-4 active:scale-[0.98] transition-transform cursor-pointer ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{leadName(followUp.leadId)}</span>
                    <span className="text-slate-300 text-xs">|</span>
                    <span className="text-xs text-slate-500">Due {fmtDate(followUp.dueDate)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{followUp.ownerName}</p>
                  {followUp.outcomeNote && <p className="text-xs text-slate-600 truncate mt-1">{followUp.outcomeNote}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={followUp.status} size="xs" />
                  {overdue && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
                      ⚠ Overdue
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm">No follow-ups found</p>
          </div>
        )}
      </div>

      {/* Follow-Up Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected ? leadName(selected.leadId) : ''} height="full">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={selected.status} size="md" />
                {isOverdue(selected) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    ⚠ Overdue — due {fmtDate(selected.dueDate)}
                  </span>
                )}
              </div>
              <PermissionGate permission="edit_appointment">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  Edit
                </button>
              </PermissionGate>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
              {[
                { label: 'Lead',     value: leadName(selected.leadId) },
                { label: 'Due Date', value: fmtDate(selected.dueDate) },
                { label: 'Owner',    value: selected.ownerName },
                { label: 'Outcome',  value: selected.outcomeNote ?? '—' },
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
                Delete Follow-Up
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* New / Edit Follow-Up Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Follow-Up' : 'New Follow-Up'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead *</label>
            <select value={leadId} onChange={e => setLeadId(e.target.value)} disabled={showEdit}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-60">
              <option value="">Select a lead…</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Due Date *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          {showEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as FollowUpStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                {CHIPS.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Outcome Note</label>
            <textarea value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button
            onClick={showEdit ? handleUpdateFollowUp : handleAddFollowUp}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {showEdit ? 'Save Changes' : 'Create Follow-Up'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Follow-Up"
        message="Are you sure you want to delete this follow-up? This cannot be undone."
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
