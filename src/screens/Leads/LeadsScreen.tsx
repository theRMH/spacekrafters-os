import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Phone, Trash2, CheckSquare, Square, X, ListChecks, ChevronDown, MapPin } from 'lucide-react'
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
import { ROLE_LABELS, getRoleDisplayLabel } from '../../data/permissions'
import {
  BUSINESS_DIVISION_OPTIONS, BUSINESS_DIVISION_LABEL,
  DIVISIONS_WITH_CATEGORY, BUSINESS_CATEGORY_OPTIONS, BUSINESS_CATEGORY_LABEL,
  DIVISIONS_WITH_BRAND, BUSINESS_BRAND_OPTIONS, BUSINESS_BRAND_LABEL,
} from '../../data/businessDivisions'
import { getManagedUsersDirectory } from '../../services/userService'
import { getNextLeadNumber } from '../../services/leadService'
import { hasRole } from '../../utils/permissions'
import { LeadStatusSheet, LEAD_STATUS_LABEL, ROLE_FOR_LEAD_STATUS } from './LeadStatusSheet'
import type { Lead, LeadSource, LeadInterest, LeadStatus, ManagedUser, BusinessDivision, BusinessCategory, BusinessBrand, UserRole, LeadCodePrefix } from '../../types'

type Filter = 'all' | LeadStatus

const ASSIGNABLE_LEAD_OWNER_ROLES: UserRole[] = ['project_coordinator', 'qs', 'designer']
// Sentinel <select> value for "type a name that isn't any existing account" —
// the client sometimes provides a Lead Owner name that was never one of our
// own Project Coordinator/QS/Designer accounts (e.g. an external referral
// contact). That lead has no real owner_id to tie to, so it falls back to
// the same "owner_id IS NULL" visibility RLS already grants unassigned leads.
const CUSTOM_OWNER_VALUE = '__custom__'

const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',                    label: 'All'          },
  { value: 'new',                    label: 'New'          },
  { value: 'contacted',              label: 'Contacted'    },
  { value: 'qualified',              label: 'Qualified'    },
  { value: 'site_visit_scheduled',   label: 'Site Visit'   },
  { value: 'site_visit_done',        label: LEAD_STATUS_LABEL.site_visit_done       },
  { value: 'requirements_captured',  label: 'Requirements' },
  { value: 'quotation_drafted',      label: LEAD_STATUS_LABEL.quotation_drafted     },
  { value: 'internally_approved',    label: LEAD_STATUS_LABEL.internally_approved   },
  { value: 'design_in_progress',     label: LEAD_STATUS_LABEL.design_in_progress    },
  { value: 'design_approved',        label: LEAD_STATUS_LABEL.design_approved       },
  { value: 'sent_to_client',         label: LEAD_STATUS_LABEL.sent_to_client        },
  { value: 'negotiating',            label: LEAD_STATUS_LABEL.negotiating           },
  { value: 'client_approved',        label: LEAD_STATUS_LABEL.client_approved       },
  { value: 'won',                    label: 'Won'          },
  { value: 'lost',                   label: 'Lost'         },
]

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'existing_client',  label: 'Existing Client'  },
  { value: 'md_reference',     label: 'MD Reference'     },
  { value: 'ed_reference',     label: 'ED Reference'     },
  { value: 'google',           label: 'Google'           },
  { value: 'instagram',        label: 'Instagram'        },
  { value: 'facebook',         label: 'Facebook'         },
  { value: 'walk_in',          label: 'Walk In'          },
  { value: 'client_reference', label: 'Client Reference' },
  { value: 'cold_call',        label: 'Cold Call'        },
  { value: 'bni',              label: 'BNI'              },
  { value: 'referral',         label: 'Referral'         },
  { value: 'whatsapp',         label: 'WhatsApp'         },
  { value: 'online',           label: 'Online'           },
  { value: 'website',          label: 'Website'          },
  { value: 'social_media',     label: 'Social Media'     },
  { value: 'exhibition',       label: 'Exhibition'       },
  { value: 'other',            label: 'Other'            },
]
const SOURCE_LABEL: Record<LeadSource, string> = Object.fromEntries(SOURCE_OPTIONS.map(o => [o.value, o.label])) as Record<LeadSource, string>

function sourceLabel(lead: Lead): string {
  const base = SOURCE_LABEL[lead.source] ?? lead.source
  return lead.source === 'other' && lead.subSource ? `${base} — ${lead.subSource}` : base
}

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
  const { leads, addLead, updateLead, deleteLead, bulkDeleteLeads } = useCRM()
  const { can, user } = useAuth()
  // Roles without full CRM access (edit_lead) only ever act on leads currently
  // assigned to them — scope their list down instead of showing the whole pipeline.
  const assignedOnly = !can('edit_lead')

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)

  const [name, setName] = useState('')
  const [leadCodePrefix, setLeadCodePrefix] = useState<LeadCodePrefix | ''>('')
  const [previewLeadNumber, setPreviewLeadNumber] = useState<string | null>(null)
  const [siteNo, setSiteNo] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [businessDivision, setBusinessDivision] = useState<BusinessDivision | ''>('')
  const [businessCategory, setBusinessCategory] = useState<BusinessCategory | ''>('')
  const [businessBrand, setBusinessBrand] = useState<BusinessBrand | ''>('')
  const [requirement, setRequirement] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState<LeadSource>('walk_in')
  const [subSource, setSubSource] = useState('')
  const [interest, setInterest] = useState<LeadInterest>('medium')
  const [status, setStatus] = useState<LeadStatus>('new')
  const [ownerId, setOwnerId] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [isCustomOwner, setIsCustomOwner] = useState(false)
  const [formError, setFormError] = useState('')
  const [assignableMembers, setAssignableMembers] = useState<ManagedUser[]>([])

  // Lead ownership is limited to the roles that actually work leads —
  // Project Coordinator, QS, Designer — not every active team member.
  useEffect(() => {
    getManagedUsersDirectory().then(users => setAssignableMembers(
      users.filter(u => u.status === 'active' && ASSIGNABLE_LEAD_OWNER_ROLES.some(r => hasRole(u, r)))
    ))
  }, [])

  useEffect(() => {
    if (!sourceMenuOpen) return
    const close = () => setSourceMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [sourceMenuOpen])

  useEffect(() => {
    setPreviewLeadNumber(null)
    if (!leadCodePrefix) return
    let cancelled = false
    getNextLeadNumber(leadCodePrefix).then(n => { if (!cancelled) setPreviewLeadNumber(n) })
    return () => { cancelled = true }
  }, [leadCodePrefix])

  function onOwnerChange(id: string) {
    if (id === CUSTOM_OWNER_VALUE) {
      setIsCustomOwner(true)
      setOwnerId('')
      setOwnerName('')
      return
    }
    setIsCustomOwner(false)
    const member = assignableMembers.find(m => m.id === id)
    setOwnerId(id)
    setOwnerName(member?.fullName ?? '')
  }

  function onBusinessDivisionChange(value: string) {
    const division = value as BusinessDivision | ''
    setBusinessDivision(division)
    if (!DIVISIONS_WITH_CATEGORY.includes(division as BusinessDivision)) setBusinessCategory('')
    if (!DIVISIONS_WITH_BRAND.includes(division as BusinessDivision)) setBusinessBrand('')
  }

  function onSourceChange(value: LeadSource) {
    setSource(value)
    if (value !== 'other') setSubSource('')
  }

  function resetForm() {
    setName(''); setLeadCodePrefix(''); setSiteNo(''); setPhone(''); setEmail(''); setCity('')
    setBusinessDivision(''); setBusinessCategory(''); setBusinessBrand('')
    setRequirement(''); setNotes(''); setSource('walk_in'); setSubSource(''); setInterest('medium'); setStatus('new')
    setOwnerId(''); setOwnerName(''); setIsCustomOwner(false)
    setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  function openEdit(lead: Lead) {
    setName(lead.name); setSiteNo(lead.siteNo ?? ''); setPhone(lead.phone); setEmail(lead.email ?? ''); setCity(lead.city)
    setBusinessDivision(lead.businessDivision ?? ''); setBusinessCategory(lead.businessCategory ?? '')
    setBusinessBrand(lead.businessBrand ?? '')
    setRequirement(lead.requirement ?? ''); setNotes(lead.notes ?? '')
    setSource(lead.source); setSubSource(lead.subSource ?? ''); setInterest(lead.interest); setStatus(lead.status)
    setOwnerId(lead.ownerId ?? ''); setOwnerName(lead.ownerName)
    setIsCustomOwner(!lead.ownerId)
    setFormError('')
    setShowEdit(true)
  }

  async function handleAddLead() {
    if (!name.trim() || !phone.trim() || !city.trim() || !ownerName.trim() || !leadCodePrefix) {
      setFormError('Name, phone, city, lead owner, and type (SK/FGD) are required.')
      return
    }
    const now = new Date()
    const slaDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const result = await addLead({
      name: name.trim(), leadCodePrefix,
      siteNo: siteNo.trim() || undefined, phone: phone.trim(), email: email.trim() || undefined, city: city.trim(),
      businessDivision: businessDivision || undefined, businessCategory: businessCategory || undefined,
      businessBrand: businessBrand || undefined,
      requirement: requirement.trim() || undefined, notes: notes.trim() || undefined,
      source, subSource: source === 'other' ? (subSource.trim() || undefined) : undefined,
      interest, status: 'new', ownerId: ownerId || undefined, ownerName: ownerName.trim(), slaDueAt,
    })
    if (!result.ok) { setFormError(result.error ?? 'Could not save lead.'); return }
    setShowNew(false)
    setSnack({ open: true, msg: result.leadNumber ? `Lead ${result.leadNumber} created successfully!` : 'Lead created successfully!', type: 'success' })
  }

  async function handleUpdateLead() {
    if (!selected) return
    if (!name.trim() || !phone.trim() || !city.trim() || !ownerName.trim()) {
      setFormError('Name, phone, city, and lead owner are required.')
      return
    }
    const statusChanged = status !== selected.status
    const result = await updateLead(selected.id, {
      name: name.trim(), siteNo: siteNo.trim() || undefined, phone: phone.trim(), email: email.trim() || undefined, city: city.trim(),
      businessDivision: businessDivision || undefined, businessCategory: businessCategory || undefined,
      businessBrand: businessBrand || undefined,
      requirement: requirement.trim() || undefined, notes: notes.trim() || undefined,
      source, subSource: source === 'other' ? (subSource.trim() || undefined) : undefined,
      interest, status, ownerId: ownerId || undefined, ownerName: ownerName.trim(),
    }, statusChanged ? `Status changed to ${status.replace(/_/g, ' ')}` : undefined)
    if (!result.ok) { setFormError(result.error ?? 'Could not update lead.'); return }
    setShowEdit(false)
    setSelected(null)
    setSnack({ open: true, msg: 'Lead updated.', type: 'success' })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const result = await deleteLead(deleteTarget.id)
    const deletedId = deleteTarget.id
    setDeleteTarget(null)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete lead.', type: 'error' }); return }
    if (selected?.id === deletedId) setSelected(null)
    setSnack({ open: true, msg: 'Lead deleted.', type: 'success' })
  }

  function toggleSelectMode() {
    setSelectMode(prev => !prev)
    setSelectedIds(new Set())
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(prev => (prev.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id))))
  }

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    const result = await bulkDeleteLeads(ids)
    setShowBulkDeleteConfirm(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete selected leads.', type: 'error' }); return }
    if (selected && ids.includes(selected.id)) setSelected(null)
    setSelectMode(false)
    setSelectedIds(new Set())
    setSnack({ open: true, msg: `${ids.length} lead${ids.length === 1 ? '' : 's'} deleted.`, type: 'success' })
  }

  const liveSelected = selected ? leads.find(l => l.id === selected.id) ?? null : null

  const filtered = leads.filter(l => {
    if (assignedOnly && l.assignedToId !== user?.id) return false
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
          <div className="flex items-center gap-2">
            <PermissionGate permission="delete_lead">
              <button onClick={toggleSelectMode} aria-label={selectMode ? 'Cancel selection' : 'Select leads'}
                className={`h-10 px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold active:opacity-90 ${
                  selectMode ? 'bg-slate-100 text-slate-600' : 'border border-slate-200 bg-white text-slate-600'
                }`}>
                {selectMode ? <X size={15} /> : <ListChecks size={15} />}
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            </PermissionGate>
            <PermissionGate permission="add_lead">
              <button onClick={openNew} aria-label="Add new lead"
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
                style={{ background: '#0F2A4A' }}>
                <Plus size={19} className="text-white" strokeWidth={2.5} />
              </button>
            </PermissionGate>
          </div>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search leads…" className="mb-3" />
        <FilterChips chips={CHIPS} active={filter} onChange={setFilter} />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {filtered.map(lead => {
          const overdue = isSlaOverdue(lead)
          const interestOpt = INTEREST_OPTIONS.find(o => o.value === lead.interest)
          const isChecked = selectedIds.has(lead.id)
          return (
            <div key={lead.id} onClick={() => (selectMode ? toggleSelected(lead.id) : setSelected(lead))}
              className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                {selectMode && (
                  <button onClick={e => { e.stopPropagation(); toggleSelected(lead.id) }}
                    aria-label={isChecked ? `Deselect ${lead.name}` : `Select ${lead.name}`}
                    className="shrink-0 mt-0.5 text-slate-300">
                    {isChecked ? <CheckSquare size={19} className="text-indigo-600" /> : <Square size={19} />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {lead.leadNumber && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{lead.leadNumber}</span>
                    )}
                    <span className="text-sm font-bold text-slate-800">{lead.name}</span>
                    {lead.siteNo && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{lead.siteNo}</span>
                    )}
                    <span className="text-slate-300 text-xs">|</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={12} className="text-slate-400" /> {lead.city}
                    </span>
                    {interestOpt && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${interestOpt.badge}`}>{interestOpt.label}</span>
                    )}
                  </div>
                  {lead.requirement && <p className="text-xs text-slate-600 truncate mb-1">{lead.requirement}</p>}
                  {lead.businessDivision && (
                    <p className="text-[11px] text-indigo-500 font-medium truncate mb-1">
                      {BUSINESS_DIVISION_LABEL[lead.businessDivision]}
                      {lead.businessCategory ? ` · ${BUSINESS_CATEGORY_LABEL[lead.businessCategory]}` : ''}
                      {lead.businessBrand ? ` · ${BUSINESS_BRAND_LABEL[lead.businessBrand]}` : ''}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">{sourceLabel(lead)} · {lead.ownerName}</p>
                </div>
                {!selectMode && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={lead.status} size="xs" />
                    {overdue && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
                        ⚠ SLA overdue
                      </span>
                    )}
                  </div>
                )}
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

      {selectMode && (
        <div className="fixed bottom-16 left-0 w-full z-30 lg:left-[260px] lg:w-[calc(100%-260px)] lg:bottom-0">
          <div className="bg-red-50 border-t border-red-100 px-5 py-3 flex items-center justify-between gap-3">
            <button onClick={toggleSelectAll} className="text-xs font-semibold text-red-600 active:opacity-70">
              {selectedIds.size === filtered.length && filtered.length > 0 ? 'Clear all' : `Select all (${filtered.length})`}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-red-600">{selectedIds.size} selected</span>
              <button onClick={() => setShowBulkDeleteConfirm(true)} disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-red-500 active:opacity-90 disabled:opacity-40">
                <Trash2 size={13} /> Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

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
                { label: 'Lead ID',     value: selected.leadNumber ?? '—' },
                { label: 'Site No.',    value: selected.siteNo ?? '—' },
                { label: 'Phone',       value: selected.phone },
                { label: 'Email',       value: selected.email ?? '—' },
                { label: 'City',        value: selected.city },
                { label: 'Business Division', value: selected.businessDivision
                    ? BUSINESS_DIVISION_LABEL[selected.businessDivision]
                      + (selected.businessCategory ? ` (${BUSINESS_CATEGORY_LABEL[selected.businessCategory]})` : '')
                      + (selected.businessBrand ? ` (${BUSINESS_BRAND_LABEL[selected.businessBrand]})` : '')
                    : '—' },
                { label: 'Source',      value: sourceLabel(selected) },
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

            {(can('edit_lead') || selected.assignedToId === user?.id) && selected.status !== 'won' && selected.status !== 'lost' && (
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
              <button onClick={() => setDeleteTarget(selected)}
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
        {/* spellCheck is inherited — turns off the browser's red "misspelled" underline for every field in this form (names/places aren't in a dictionary). */}
        <div className="space-y-3" spellCheck={false}>
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          {!showEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Type *</label>
              <select value={leadCodePrefix} onChange={e => setLeadCodePrefix(e.target.value as LeadCodePrefix | '')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">— Select —</option>
                <option value="SK">SK</option>
                <option value="FGD">FGD</option>
              </select>
              {leadCodePrefix && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Lead ID: <span className="font-bold text-slate-700">{previewLeadNumber ?? '…'}</span> (auto-generated when you save)
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Client Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rajesh Kumar"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Site No. <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={siteNo} onChange={e => setSiteNo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Phone Number *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Email <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="optional"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Location / City *</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Anna Nagar, Chennai"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Company / Business Division <span className="font-normal text-slate-400">(optional)</span></label>
            <select value={businessDivision} onChange={e => onBusinessDivisionChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">— Select —</option>
              {BUSINESS_DIVISION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {DIVISIONS_WITH_CATEGORY.includes(businessDivision as BusinessDivision) && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Category</label>
              <select value={businessCategory} onChange={e => setBusinessCategory(e.target.value as BusinessCategory)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">— Select —</option>
                {BUSINESS_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {DIVISIONS_WITH_BRAND.includes(businessDivision as BusinessDivision) && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Brand</label>
              <select value={businessBrand} onChange={e => setBusinessBrand(e.target.value as BusinessBrand)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">— Select —</option>
                {BUSINESS_BRAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Assign To *</label>
            <select value={isCustomOwner ? CUSTOM_OWNER_VALUE : ownerId} onChange={e => onOwnerChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">— Select —</option>
              {assignableMembers.map(m => (
                <option key={m.id} value={m.id}>{m.fullName} – {getRoleDisplayLabel(m.role, m.displayRole)}</option>
              ))}
              <option value={CUSTOM_OWNER_VALUE}>Other — type a name…</option>
            </select>
            {isCustomOwner && (
              <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Lead Owner name"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm mt-2 focus:outline-none focus:border-indigo-400" />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Requirement <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={requirement} onChange={e => setRequirement(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="relative">
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead Source *</label>
            <button type="button" onClick={e => { e.stopPropagation(); setSourceMenuOpen(o => !o) }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-indigo-400">
              <span>{SOURCE_OPTIONS.find(o => o.value === source)?.label ?? 'Select…'}</span>
              <ChevronDown size={15} className="text-slate-400 shrink-0" />
            </button>
            {sourceMenuOpen && (
              <div onClick={e => e.stopPropagation()}
                className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-sheet border border-slate-100 max-h-60 overflow-y-auto">
                {SOURCE_OPTIONS.map(o => (
                  <button key={o.value} type="button"
                    onClick={() => { onSourceChange(o.value); setSourceMenuOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm active:bg-slate-100 ${
                      o.value === source ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {source === 'other' && (
              <input value={subSource} onChange={e => setSubSource(e.target.value)}
                placeholder="Type the source…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm mt-2 focus:outline-none focus:border-indigo-400" />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Lead Interest *</label>
            <div className="grid grid-cols-3 gap-2">
              {INTEREST_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setInterest(o.value)}
                  className={`rounded-xl border px-2 py-3 text-xs font-bold active:opacity-90 ${
                    interest === o.value
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
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
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional notes…"
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
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Lead"
        message={`Delete ${deleteTarget?.name ?? 'this lead'}? This also removes its linked appointments, follow-ups, site visits, requirements, and quotations. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Dialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        title="Delete Selected Leads"
        message={`Delete ${selectedIds.size} selected lead${selectedIds.size === 1 ? '' : 's'}? This also removes their linked appointments, follow-ups, site visits, requirements, and quotations. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
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
