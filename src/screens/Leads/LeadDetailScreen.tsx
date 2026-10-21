import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Phone } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllFollowUps } from '../../services/followUpService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { BUSINESS_DIVISION_LABEL, BUSINESS_CATEGORY_LABEL, BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import type { FollowUp, SiteVisit } from '../../types'
import { LeadStatusSheet, leadStatusLabel } from './LeadStatusSheet'
import { LeadActivityHistory } from './LeadActivityHistory'

type Tab = 'overview' | 'follow-ups' | 'site-visits' | 'activity'

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview',     label: 'Overview'    },
  { value: 'follow-ups',   label: 'Follow-Ups'  },
  { value: 'site-visits',  label: 'Site Visits' },
  { value: 'activity',     label: 'Activity'    },
]

function fmtDateTime(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LeadDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { leads, updateLead } = useCRM()
  const { can, user } = useAuth()
  const lead = leads.find(l => l.id === id)

  const [tab, setTab] = useState<Tab>('overview')
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showLostDialog, setShowLostDialog] = useState(false)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [fus, visits] = await Promise.all([getAllFollowUps(), getAllSiteVisits()])
      setFollowUps(fus.filter(f => f.leadId === id))
      setSiteVisits(visits.filter(v => v.leadId === id))
      setIsLoading(false)
    }
    if (id) load()
  }, [id])

  async function handleMarkLost() {
    if (!lead || !lostReason.trim()) return
    const result = await updateLead(lead.id, { status: 'lost', lostReason: lostReason.trim() }, `Marked Lost: ${lostReason.trim()}`)
    setShowLostDialog(false)
    setLostReason('')
    setSnack(result.ok
      ? { open: true, msg: 'Lead marked lost.', type: 'success' }
      : { open: true, msg: result.error ?? 'Could not update status.', type: 'error' })
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">Lead not found</p>
          <button onClick={() => navigate('/leads')} className="text-xs font-semibold text-indigo-600 mt-2">
            Back to Leads
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('/leads')} className="p-1.5 -ml-1.5 text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold text-slate-800 truncate">{lead.name}</h1>
            <p className="text-xs text-slate-500">{lead.city}</p>
          </div>
          <StatusBadge status={lead.status} label={leadStatusLabel(lead)} size="sm" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${tab === t.value ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
              style={tab === t.value ? { background: '#0F2A4A' } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2.5">
              {[
                { label: 'Lead ID',     value: lead.leadNumber ?? '—' },
                { label: 'Site No.',    value: lead.siteNo ?? '—' },
                { label: 'Phone',       value: lead.phone },
                { label: 'Email',       value: lead.email ?? '—' },
                { label: 'City',        value: lead.city },
                { label: 'Business Division', value: lead.businessDivision
                    ? BUSINESS_DIVISION_LABEL[lead.businessDivision]
                      + (lead.businessCategory ? ` (${BUSINESS_CATEGORY_LABEL[lead.businessCategory]})` : '')
                      + (lead.businessBrand ? ` (${BUSINESS_BRAND_LABEL[lead.businessBrand]})` : '')
                    : '—' },
                { label: 'Requirement', value: lead.requirement ?? '—' },
                { label: 'Owner',       value: lead.ownerName },
                { label: 'Notes',       value: lead.notes ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
                  <span className="text-xs font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>
            <a href={`tel:${lead.phone}`}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white rounded-xl py-3.5 text-sm font-bold active:bg-teal-700">
              <Phone size={16} /> Call {lead.name.split(' ')[0]}
            </a>

            {can('convert_lead') && lead.status === 'won' && (
              <button onClick={() => navigate(`/projects?leadId=${lead.id}`)}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-bold active:bg-indigo-700">
                Convert to Project
              </button>
            )}

            {(can('edit_lead') || lead.assignedToId === user?.id || lead.ownerId === user?.id) && lead.status !== 'won' && lead.status !== 'lost' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Current Action Needed</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{leadStatusLabel(lead)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Responsible: {lead.assignedToName ?? lead.ownerName ?? 'Not Assigned'}
                  </p>
                </div>
                <button onClick={() => setShowStatusSheet(true)}
                  className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90"
                  style={{ background: '#0F2A4A' }}>
                  Update Status →
                </button>
                <button onClick={() => setShowLostDialog(true)}
                  className="w-full py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100">
                  Mark Lost
                </button>
              </div>
            )}
            {lead.status === 'lost' && lead.lostReason && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <p className="text-[12px] font-bold text-red-400 uppercase tracking-wider mb-1">Lost Reason</p>
                <p className="text-sm text-red-700">{lead.lostReason}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'follow-ups' && (
          <div className="space-y-2.5">
            {!isLoading && followUps.map(f => (
              <div key={f.id} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Due {fmtDate(f.dueDate)}</p>
                    <p className="text-[12px] text-slate-400 mt-0.5">{f.ownerName}</p>
                    {f.outcomeNote && <p className="text-xs text-slate-600 mt-1">{f.outcomeNote}</p>}
                  </div>
                  <StatusBadge status={f.status} size="xs" />
                </div>
              </div>
            ))}
            {!isLoading && followUps.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-10">No follow-ups yet</p>
            )}
          </div>
        )}

        {tab === 'site-visits' && (
          <div className="space-y-2.5">
            {!isLoading && siteVisits.map(v => (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-100 p-4">
                <p className="text-sm font-bold text-slate-800">{fmtDate(v.visitDate)}</p>
                <p className="text-xs text-slate-600 mt-1">{v.rooms.length} room{v.rooms.length !== 1 ? 's' : ''} measured</p>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  {v.checklist.filter(c => c.checked).length}/{v.checklist.length} checklist items done
                </p>
              </div>
            ))}
            {!isLoading && siteVisits.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-10">No site visits yet</p>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4">
            <LeadActivityHistory activity={lead.activity} />
          </div>
        )}
      </div>

      <Dialog
        isOpen={showLostDialog}
        onClose={() => { setShowLostDialog(false); setLostReason('') }}
        title="Mark Lead as Lost"
        variant="danger"
        confirmLabel="Mark Lost"
        cancelLabel="Cancel"
        confirmDisabled={!lostReason.trim()}
        onConfirm={handleMarkLost}>
        <textarea value={lostReason} onChange={e => setLostReason(e.target.value)}
          placeholder="Reason for losing this lead…" rows={3}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
      </Dialog>

      <LeadStatusSheet
        isOpen={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        lead={lead}
        onDone={msg => setSnack({ open: true, msg, type: msg.toLowerCase().includes('could not') || msg.toLowerCase().includes('enter a valid') ? 'error' : 'success' })}
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
