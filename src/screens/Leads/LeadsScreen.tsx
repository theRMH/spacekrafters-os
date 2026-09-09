import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Phone } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { ROLE_LABELS } from '../../data/permissions'
import { LeadStatusSheet, LEAD_STATUS_LABEL, ROLE_FOR_LEAD_STATUS } from './LeadStatusSheet'
import type { Lead, LeadSource, LeadInterest, LeadStatus } from '../../types'

type Filter = 'all' | LeadStatus

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',                    label: 'All'          },
  { value: 'new',                    label: 'New'          },
  { value: 'contacted',              label: 'Contacted'    },
  { value: 'qualified',              label: 'Qualified'    },
  { value: 'site_visit_scheduled',   label: 'Site Visit'   },
  { value: 'requirements_captured',  label: 'Requirements' },
  { value: 'won',                    label: 'Won'          },
  { value: 'lost',                   label: 'Lost'         },
]

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'referral',      label: 'Referral'      },
  { value: 'walk_in',       label: 'Walk In'       },
  { value: 'website',       label: 'Website'       },
  { value: 'social_media',  label: 'Social Media'  },
  { value: 'cold_call',     label: 'Cold Call'     },
  { value: 'exhibition',    label: 'Exhibition'    },
  { value: 'other',         label: 'Other'         },
]
const SOURCE_LABEL: Record<LeadSource, string> = Object.fromEntries(SOURCE_OPTIONS.map(o => [o.value, o.label])) as Record<LeadSource, string>

const INTEREST_OPTIONS: { value: LeadInterest; label: string; badge: string }[] = [
  { value: 'hot',    label: '🔥 Hot',    badge: 'bg-red-100 text-red-700'     },
  { value: 'medium', label: '🌡️ Medium', badge: 'bg-amber-100 text-amber-700' },
  { value: 'cold',   label: '❄️ Cold',   badge: 'bg-blue-100 text-blue-700'   },
]

function isSlaOverdue(lead: Lead): boolean {
  if (lead.status !== 'new') return false
  return new Date(lead.slaDueAt).getTime() < Date.now()
}

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function LeadsScreen() {
  const navigate = useNavigate()
  const { leads, addLead, updateLead, deleteLead } = useCRM()
  const { user, can } = useAuth()

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [requirement, setRequirement] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState<LeadSource>('walk_in')
  const [interest, setInterest] = useState<LeadInterest>('medium')
  const [status, setStatus] = useState<LeadStatus>('new')
  const [formError, setFormError] = useState('')

  function resetForm() {
    setName(''); setPhone(''); setEmail(''); setCity('')
    setRequirement(''); setNotes(''); setSource('walk_in'); setInterest('medium'); setStatus('new')
    setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(lead: Lead) {
    setName(lead.name); setPhone(lead.phone); setEmail(lead.email ?? ''); setCity(lead.city)
    setRequirement(lead.requirement ?? ''); setNotes(lead.notes ?? '')
    setSource(lead.source); setInterest(lead.interest); setStatus(lead.status)
    setFormError('')
    setShowEdit(true)
  }

  async function handleAddLead() {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setFormError('Name, phone, and city are required.')
      return
    }
    const now = new Date()
    const slaDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const result = await addLead({
      name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, city: city.trim(),
      requirement: requirement.trim() || undefined, notes: notes.trim() || undefined,
      source, interest, status: 'new', ownerId: user?.id, ownerName: user?.name ?? 'Unassigned', slaDueAt,
    })
    if (!result.ok) { setFormError(result.error ?? 'Could not save lead.'); return }
    setShowNew(false)
    setSnack({ open: true, msg: 'Lead created successfully!', type: 'success' })
  }

  async function handleUpdateLead() {
    if (!selected) return
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setFormError('Name, phone, and city are required.')
      return
    }
    const statusChanged = status !== selected.status
    const result = await updateLead(selected.id, {
      name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, city: city.trim(),
      requirement: requirement.trim() || undefined, notes: notes.trim() || undefined,
      source, interest, status,
    }, statusChanged ? `Status changed to ${status.replace(/_/g, ' ')}` : undefined)
    if (!result.ok) { setFormError(result.error ?? 'Could not update lead.'); return }
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Lead updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteLead(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete lead.', type: 'error' }); return }
    setSelected(null)
    setSnack({ open: true, msg: 'Lead deleted.', type: 'success' })
  }

  const liveSelected = selected ? leads.find(l => l.id === selected.id) ?? null : null

  const filtered = leads.filter(l => {
    const matchSearch = !search
      || l.name.toLowerCase().includes(search.toLowerCase())
      || l.phone.includes(search)
      || l.city.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || l.status === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Leads</h1>
          <PermissionGate permission="add_lead">
            <button onClick={openNew} aria-label="Add new lead"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search leads…" className="mb-3" />
        <FilterChips chips={CHIPS} active={filter} onChange={setFilter} />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {filtered.map(lead => {
          const overdue = isSlaOverdue(lead)
          const interestOpt = INTEREST_OPTIONS.find(o => o.value === lead.interest)
          return (
            <div key={lead.id} onClick={() => setSelected(lead)}
              className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{lead.name}</span>
                    <span className="text-slate-300 text-xs">|</span>
                    <span className="text-xs text-slate-500">{lead.city}</span>
                    {interestOpt && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${interestOpt.badge}`}>{interestOpt.label}</span>
                    )}
                  </div>
                  {lead.requirement && <p className="text-xs text-slate-600 truncate mb-1">{lead.requirement}</p>}
                  <p className="text-[11px] text-slate-400">{SOURCE_LABEL[lead.source] ?? lead.source} · {lead.ownerName}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={lead.status} size="xs" />
                  {overdue && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
                      ⚠ SLA overdue
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No leads found</p>
          </div>
        )}
      </div>

      {/* Lead Detail Sheet */}
      <BottomSheet isOpen={!!selected && !showEdit} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {(() => {
          const selected = liveSelected
          if (!selected) return null
          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={selected.status} size="md" />
                {isSlaOverdue(selected) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    ⚠ SLA overdue — due {fmtDateTime(selected.slaDueAt)}
                  </span>
                )}
              </div>
              <PermissionGate permission="edit_lead">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  Edit
                </button>
              </PermissionGate>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
              {[
                { label: 'Phone',       value: selected.phone },
                { label: 'Email',       value: selected.email ?? '—' },
                { label: 'City',        value: selected.city },
                { label: 'Source',      value: SOURCE_LABEL[selected.source] ?? selected.source },
                { label: 'Owner',       value: selected.ownerName },
                { label: 'Requirement', value: selected.requirement ?? '—' },
                { label: 'Notes',       value: selected.notes ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
                  <span className="text-xs font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Activity Log</p>
              <div className="space-y-3 divide-y divide-slate-100">
                {[...selected.activity].reverse().map((entry, i) => (
                  <div key={entry.id} className={i > 0 ? 'pt-3' : ''}>
                    <div className="flex gap-2.5">
                      <div className="flex flex-col items-center pt-1 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#0F2A4A' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase mb-0.5" style={{ color: '#0F2A4A' }}>{entry.label}</p>
                        {entry.note && <p className="text-xs text-slate-700 leading-relaxed">{entry.note}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{entry.updatedBy} · {fmtDateTime(entry.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a href={`tel:${selected.phone}`}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white rounded-xl py-3.5 text-sm font-bold active:bg-teal-700">
              <Phone size={16} /> Call {selected.name.split(' ')[0]}
            </a>

            {can('edit_lead') && selected.status !== 'won' && selected.status !== 'lost' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current Action Needed</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{LEAD_STATUS_LABEL[selected.status]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Responsible: {selected.assignedToName ?? (ROLE_FOR_LEAD_STATUS[selected.status] ? ROLE_LABELS[ROLE_FOR_LEAD_STATUS[selected.status]!] : '—')}
                  </p>
                </div>
                <button onClick={() => setShowStatusSheet(true)}
                  className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90"
                  style={{ background: '#0F2A4A' }}>
                  Update Status →
                </button>
              </div>
            )}

            <button onClick={() => navigate(`/leads/${selected.id}`)}
              className="w-full text-center text-sm font-bold py-3 rounded-xl border border-slate-200 text-slate-700 active:bg-slate-50">
              View Full Details →
            </button>

            {can('delete_lead') && (
              <button onClick={() => setShowDeleteDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Lead
              </button>
            )}
          </div>
          )
        })()}
      </BottomSheet>

      {liveSelected && (
        <LeadStatusSheet
          isOpen={showStatusSheet}
          onClose={() => setShowStatusSheet(false)}
          lead={liveSelected}
          onDone={(msg) => setSnack({ open: true, msg, type: 'success' })}
        />
      )}

      {/* New / Edit Lead Sheet */}
      <BottomSheet
        isOpen={showNew || showEdit}
        onClose={() => { setShowNew(false); setShowEdit(false) }}
        title={showEdit ? 'Edit Lead' : 'New Lead'}
        height="full"
      >
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Phone *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">City *</label>
            <input value={city} onChange={e => setCity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Requirement</label>
            <input value={requirement} onChange={e => setRequirement(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Source</label>
            <select value={source} onChange={e => setSource(e.target.value as LeadSource)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Interest</label>
            <select value={interest} onChange={e => setInterest(e.target.value as LeadInterest)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              {INTEREST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {showEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as LeadStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                {CHIPS.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button
            onClick={showEdit ? handleUpdateLead : handleAddLead}
            className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90"
            style={{ background: '#C9A24B' }}
          >
            {showEdit ? 'Save Changes' : 'Create Lead'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Lead"
        message="Are you sure you want to delete this lead? This cannot be undone."
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
