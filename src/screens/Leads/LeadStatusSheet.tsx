import { lazy, Suspense, useEffect, useState } from 'react'
import { Phone, MessageCircle } from 'lucide-react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { MdOverrideCard, withReason } from '../../components/forms/MdOverrideCard'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_DIVISION_LABEL, BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getRoleDisplayLabel } from '../../data/permissions'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllRequirements } from '../../services/requirementService'
import { QuotationStatusCard } from '../Quotations/QuotationStatusCard'
import { sendNotification } from '../../utils/notifications'
import { DateField } from '../../components/forms/DateField'
import { convertLeadToProject, projectNumberForLead } from '../Projects/convertLeadToProject'
import { PIPELINE, coreStatus, statusToSyncFromQuotation } from './leadPipeline'
import type { Lead, LeadStatus, ManagedUser, Quotation, SiteVisit } from '../../types'

// Lazy: these screens import LeadStatusSheet themselves, so a static import would be circular.
const SiteVisitsScreen = lazy(() => import('../SiteVisits/SiteVisitsScreen'))
const RequirementsScreen = lazy(() => import('../Requirements/RequirementsScreen'))
const QuotationsScreen = lazy(() => import('../Quotations/QuotationsScreen'))

// Same wa.me pattern already established in ProductSaleDetailScreen.tsx /
// OutstandingProjectDetailScreen.tsx / MyProjectDetailScreen.tsx — reused
// here rather than inventing a new one.
function waLink(lead: Lead): string | null {
  const digits = lead.phone.replace(/\D/g, '')
  if (!digits) return null
  const intl = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(`Hi ${lead.name}, this is regarding your enquiry with SpaceKrafters.`)}`
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new:                    'New',
  contacted:              'Contacted',
  qualified:              'Qualified',
  site_visit_scheduled:   'Site Visit Planned',
  site_visit_done:        'Site Visit Done',
  requirements_captured:  'Requirements Done',
  quotation_drafted:      'Quotation Created',
  sent_to_md:             'Waiting for MD Approval',
  md_rejected:            'MD Rejected',
  client_rejected:        'Client Rejected',
  internally_approved:    'MD Approved',
  design_in_progress:     'Design In Progress',
  design_approved:        'Design Approved',
  sent_to_client:         'Waiting for Client Approval',
  negotiating:            'Negotiating',
  client_approved:        'Client Approved',
  won:                    'Project Created',
  lost:                   'Lost',
}

// What to show for a lead: the label of its status, except at Payment where it says whether the advance has come in.
export function leadStatusLabel(lead: Pick<Lead, 'status' | 'advanceStatus' | 'advancePaymentAmount'>): string {
  if (lead.status === 'client_approved') {
    if (lead.advanceStatus === 'without_advance') return 'Proceeding Without Advance'
    if (lead.advancePaymentAmount) return 'Advance Received'
  }
  return LEAD_STATUS_LABEL[lead.status]
}

// The statuses the MD can force a lead to (the 7 stages + Lost).
const OVERRIDE_STATUSES: LeadStatus[] = [...PIPELINE.map(p => p.status), 'lost']

interface Props {
  isOpen: boolean
  onClose: () => void
  lead: Lead
  onDone: (msg: string) => void
  // Fired after a status change was saved, with the new status — lets the host
  // (the Leads list) follow the lead to its new sort bucket.
  onStatusChanged?: (status: LeadStatus) => void
}

export function LeadStatusSheet({ isOpen, onClose, lead, onDone, onStatusChanged }: Props) {
  const { user, can } = useAuth()
  const { updateLead } = useCRM()

  const [users, setUsers] = useState<ManagedUser[]>([])
  // The lead's latest site visit: planned (date + team, nothing recorded yet) or recorded.
  const [siteVisit, setSiteVisit] = useState<SiteVisit | null>(null)
  const [hasRequirement, setHasRequirement] = useState(false)
  const [quotation, setQuotation] = useState<Quotation | null>(null)

  const [showConvert, setShowConvert] = useState(false)
  const [convertName, setConvertName] = useState('')
  const [convertDue, setConvertDue] = useState('')
  const [convertError, setConvertError] = useState('')
  const [converting, setConverting] = useState(false)
  const [showLostReason, setShowLostReason] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  // Which form is open over the current page (no navigation).
  const [embed, setEmbed] = useState<'site' | 'req' | 'quote' | 'site-edit' | 'req-edit' | 'quote-edit' | null>(null)

  const stage = coreStatus(lead.status)

  function closeEmbed(msg?: string) {
    setEmbed(null)
    onClose()
    if (msg) onDone(msg)
  }

  useEffect(() => {
    if (!isOpen) return
    setShowReassign(false)
    setReassignTo('')
    setShowLostReason(false)
    getManagedUsersDirectory().then(setUsers)
    getAllSiteVisits().then(v => setSiteVisit(v.filter(sv => sv.leadId === lead.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null))
    getAllRequirements().then(async reqs => {
      const visits = await getAllSiteVisits()
      const myVisitIds = new Set(visits.filter(v => v.leadId === lead.id).map(v => v.id))
      setHasRequirement(reqs.some(r => myVisitIds.has(r.siteVisitId)))
    })
    getAllQuotations().then(qs => {
      const mine = qs.filter(q => q.leadId === lead.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
      setQuotation(mine)
      // Self-healing catch-up: keep the lead's status in step with its quotation (e.g. the client approved it but
      // the lead still says Sent to Client). Never moves a lead backwards, never touches Won/Lost or an MD override.
      const sync = lead.mdStatusOverride ? null : statusToSyncFromQuotation(lead.status, mine)
      if (sync) updateLead(lead.id, { status: sync }, `Synced to the quotation: ${LEAD_STATUS_LABEL[sync]}`)
    })
  }, [isOpen, lead.id])

  // Advancing a lead's status never reassigns it — the current assignee stays
  // responsible until they, or the MD, explicitly hand it to someone else.
  async function save(status: LeadStatus, note: string, extra?: Partial<Lead>) {
    setSaving(true)
    const result = await updateLead(lead.id, { status, mdStatusOverride: false, ...extra }, note)
    setSaving(false)
    if (result.ok) {
      onStatusChanged?.(status)
      onDone(note)
      onClose()
    } else {
      onDone(result.error ?? 'Could not update status.')
    }
  }

  function openConvert() {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setConvertName(`${lead.name} - ${lead.city} Project`)
    setConvertDue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    setConvertError('')
    setShowConvert(true)
  }

  // Creates the project from the popup, then marks the lead Project Created.
  async function submitConvert() {
    setConverting(true)
    setConvertError('')
    const result = await convertLeadToProject({ lead, quotation, name: convertName, dueDate: convertDue, user })
    setConverting(false)
    if (!result.ok) { setConvertError(result.error ?? 'Could not create the project.'); return }
    setShowConvert(false)
    await save('won', `Converted to a project: ${convertName.trim()}`)
  }

  // MD-only: force the lead to any stage (forward or back). The reason is mandatory and goes into the activity log.
  async function submitMdOverride(value: string, reason: string) {
    const status = value as LeadStatus
    await save(
      status,
      `MD override: ${LEAD_STATUS_LABEL[lead.status]} → ${LEAD_STATUS_LABEL[status]}${withReason(reason)}`,
      { mdStatusOverride: true, ...(status === 'lost' ? { lostReason: reason || 'MD override' } : {}) },
    )
  }

  // Explicit hand-off — the only way assignedToId/Name/Role ever changes.
  async function submitReassign(personId: string) {
    const person = users.find(u => u.id === personId)
    if (!person) return
    setSaving(true)
    const result = await updateLead(lead.id, {
      assignedToId: person.id, assignedToName: person.fullName, assignedRole: person.role,
    }, `Assigned to ${person.fullName}`)
    setSaving(false)
    if (!result.ok) { onDone(result.error ?? 'Could not reassign.'); return }
    await sendNotification(
      [person.id],
      'New Lead Task',
      `${lead.name} (${lead.leadNumber ?? lead.id}) — ${leadStatusLabel(lead)}. Assigned by ${user?.name ?? 'System'}.`,
      `/tasks?leadId=${lead.id}`,
    )
    setShowReassign(false)
    setReassignTo('')
    onDone(`Assigned to ${person.fullName}.`)
  }

  // The lead's current, actually-assigned person — assignedToId/Name if an
  // explicit hand-off has happened, otherwise the lead's own Owner.
  const effectiveAssigneeId = lead.assignedToId ?? lead.ownerId
  const effectiveAssigneeName = lead.assignedToName ?? lead.ownerName
  // Full managers (edit_lead) always act; otherwise only the actual assignee.
  const canAct = can('edit_lead') || user?.id === effectiveAssigneeId

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`
  const navy = { background: '#0F2A4A' }

  // "Edit this stage": reopen the record behind the current stage (e.g. after the MD overrides the lead back to it).
  const editOptions: { kind: 'site-edit' | 'req-edit' | 'quote-edit'; label: string }[] = []
  if (siteVisit && siteVisit.status !== 'scheduled' && can('edit_site_visit') && (stage === 'contacted' || stage === 'site_visit_done')) editOptions.push({ kind: 'site-edit', label: 'Edit Site Visit' })
  if (hasRequirement && can('add_requirements') && (stage === 'site_visit_done' || stage === 'requirements_captured')) editOptions.push({ kind: 'req-edit', label: 'Edit Requirements' })
  if (quotation && can('create_quotation') && ['requirements_captured', 'quotation_drafted', 'client_approved'].includes(stage)) editOptions.push({ kind: 'quote-edit', label: 'Edit Quotation' })

  // One step per stage: the form opens right here (no page change) and submitting it moves the lead on by
  // itself. The "Mark … done" fallbacks only show when the record already exists but the lead never advanced.
  function renderBody() {
    if (!canAct) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {effectiveAssigneeName ?? 'Not Assigned'}.
        </p>
      )
    }

    switch (stage) {
      case 'new':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm this lead has been contacted.</p>
            <button disabled={saving} onClick={() => save('contacted', 'Lead contacted')} className={primaryBtn} style={navy}>
              Mark Contacted
            </button>
          </div>
        )
      case 'contacted':
        return (
          <div className="space-y-3">
            {/* Two steps: PLAN the visit (date + team), then RECORD it (rooms, measurements, checklist). */}
            {!siteVisit ? (
              <>
                <p className="text-sm text-slate-600">Step 1 — plan the site visit: pick the date and who is going.</p>
                <button onClick={() => setEmbed('site')} className={primaryBtn} style={navy}>Plan Site Visit</button>
              </>
            ) : siteVisit.status === 'scheduled' ? (
              <>
                <p className="text-sm text-slate-600">Site visit planned for <span className="font-bold text-slate-800">{new Date(siteVisit.visitDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>{siteVisit.teamMemberNames?.length ? ` · ${siteVisit.teamMemberNames.join(', ')}` : ''}.</p>
                <p className="text-xs text-slate-400">Step 2 — after the visit, record the rooms, measurements and checklist.</p>
                <button onClick={() => setEmbed('site-edit')} className={primaryBtn} style={navy}>Record Site Visit</button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Site visit is on record.</p>
                <button disabled={saving} onClick={() => save('site_visit_done', 'Site visit completed')} className={primaryBtn} style={navy}>
                  Mark Site Visit Done
                </button>
              </>
            )}
          </div>
        )
      case 'site_visit_done':
        return (
          <div className="space-y-3">
            {hasRequirement ? (
              <>
                <p className="text-sm text-slate-600">Requirements are on record.</p>
                <button disabled={saving} onClick={() => save('requirements_captured', 'Requirements captured')} className={primaryBtn} style={navy}>
                  Mark Requirements Captured
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Fill in the requirements — submitting them completes this step.</p>
                <button onClick={() => setEmbed('req')} className={primaryBtn} style={navy}>Add Requirements</button>
              </>
            )}
          </div>
        )
      case 'requirements_captured':
        return (
          <div className="space-y-3">
            {quotation ? (
              <>
                <p className="text-sm text-slate-600">A quotation has been created.</p>
                <button disabled={saving} onClick={() => save('quotation_drafted', 'Quotation created')} className={primaryBtn} style={navy}>
                  Confirm Quotation Created
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Create the quotation — submitting it completes this step.</p>
                <button onClick={() => setEmbed('quote')} className={primaryBtn} style={navy}>Create Quotation</button>
              </>
            )}
          </div>
        )
      // Quotation stage: the whole approval chain (PC sends to MD → MD approves → PC sends to client →
      // client decision) is on the quotation card; the lead moves on by itself when the client approves.
      case 'quotation_drafted':
        return quotation
          ? <QuotationStatusCard quotation={quotation} can={can} user={user} lead={lead} updateLead={updateLead} onChanged={setQuotation} />
          : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">No quotation yet — create one.</p>
              <button onClick={() => setEmbed('quote')} className={primaryBtn} style={navy}>Create Quotation</button>
            </div>
          )
      // Client approved: choose to proceed with or without an advance (with = enter the advance), then Convert to Project.
      case 'client_approved':
        return quotation
          ? (
            <div className="space-y-3">
              <QuotationStatusCard quotation={quotation} can={can} user={user} lead={lead} updateLead={updateLead} onChanged={setQuotation} />
              {(quotation.advancePaymentReceived || quotation.advanceStatus === 'without_advance') && (
                <button disabled={saving} onClick={openConvert} className={primaryBtn} style={navy}>
                  Convert to Project
                </button>
              )}
            </div>
          )
          : <p className="text-sm text-slate-400 py-6 text-center">No quotation found for this lead.</p>
      default:
        return <p className="text-sm text-slate-400 py-6 text-center">No action available at this stage.</p>
    }
  }

  const wa = waLink(lead)
  // The early stages only ever need a phone call — WhatsApp is hidden and
  // Call takes the full row, solid green.
  const soloCall = stage === 'new' || stage === 'contacted' || stage === 'site_visit_done'
  const canLose = canAct && stage !== 'won' && stage !== 'lost'
  // A planned visit already counts as being in the Site Visit stage.
  const currentIdx = PIPELINE.findIndex(p => p.status === (lead.status === 'site_visit_scheduled' ? 'site_visit_done' : stage))

  return (
    <>
    {isOpen && embed && (
      <Suspense fallback={null}>
        {embed?.startsWith('site') && <SiteVisitsScreen embed={{ leadId: lead.id, edit: embed === 'site-edit', onClose: closeEmbed }} />}
        {embed?.startsWith('req') && <RequirementsScreen embed={{ leadId: lead.id, edit: embed === 'req-edit', onClose: closeEmbed }} />}
        {embed?.startsWith('quote') && <QuotationsScreen embed={{ leadId: lead.id, edit: embed === 'quote-edit', onClose: closeEmbed }} />}
      </Suspense>
    )}
    <BottomSheet isOpen={isOpen && !embed} onClose={onClose} title={`Update Status — ${leadStatusLabel(lead)}`} height="full">
      <div className="space-y-4">
        {user?.role === 'owner' && (
          <MdOverrideCard noun="status" title="lead status" saving={saving} onApply={submitMdOverride}
            options={OVERRIDE_STATUSES.filter(s => s !== lead.status).map(s => ({ value: s, label: LEAD_STATUS_LABEL[s] }))} />
        )}

        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Lead Details</p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-800 leading-tight truncate">{lead.name}</h3>
              {lead.leadNumber && <p className="text-xs text-slate-400 mt-0.5">{lead.leadNumber}</p>}
            </div>
            <StatusBadge status={lead.status} label={leadStatusLabel(lead)} />
          </div>
          <div className="space-y-0.5 text-sm text-slate-600 pt-1">
            <p>{lead.phone}</p>
            <p>{lead.city}</p>
            <p>Owner: {lead.ownerName}</p>
            {lead.businessDivision && (
              <p>{BUSINESS_DIVISION_LABEL[lead.businessDivision]}{lead.businessBrand ? ` (${BUSINESS_BRAND_LABEL[lead.businessBrand]})` : ''}</p>
            )}
            {lead.assignedToName && lead.assignedToName !== lead.ownerName && <p>Assigned to: {lead.assignedToName}</p>}
          </div>
          {currentIdx !== -1 && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 pt-2 border-t border-slate-200">
              {PIPELINE.map((p, i) => (
                <span key={p.status} className={`text-[11px] font-semibold ${i < currentIdx ? 'text-emerald-600' : i === currentIdx ? 'text-indigo-700 underline underline-offset-4' : 'text-slate-300'}`}>
                  {i < currentIdx ? '✓ ' : ''}{p.label}{i < PIPELINE.length - 1 ? ' ›' : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Explicit hand-off — the only way the current assignee changes. */}
        {canAct && (
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Currently assigned to: <span className="font-bold text-slate-700">{effectiveAssigneeName ?? 'Not Assigned'}</span>
              </p>
              <button type="button" onClick={() => { setShowReassign(s => !s); setReassignTo('') }} className="text-xs font-bold text-indigo-600 shrink-0">
                {showReassign ? 'Cancel' : 'Reassign'}
              </button>
            </div>
            {showReassign && (
              <div className="space-y-2">
                <SearchableSelect value={reassignTo} onChange={setReassignTo}
                  options={users.filter(u => u.status === 'active').map(u => ({ value: u.id, label: `${u.fullName} – ${getRoleDisplayLabel(u.role, u.displayRole)}` }))}
                  placeholder="Select a person…" searchPlaceholder="Search team…" />
                <button type="button" disabled={!reassignTo || saving} onClick={() => submitReassign(reassignTo)}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={navy}>
                  Assign
                </button>
              </div>
            )}
          </div>
        )}

        <div className={soloCall ? '' : 'grid grid-cols-2 gap-2.5'}>
          <a href={`tel:${lead.phone}`}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${
              soloCall ? 'bg-emerald-700 text-white active:bg-emerald-800' : 'bg-emerald-50 text-emerald-700 active:bg-emerald-100'
            }`}>
            <Phone size={15} /> Call
          </a>
          {!soloCall && (
            <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${wa ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}>
              <MessageCircle size={15} /> WhatsApp
            </a>
          )}
        </div>

        {renderBody()}

        {/* Edit the record behind the current stage (e.g. after the MD overrides the lead back to it). */}
        {canAct && editOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Edit this stage</p>
            {editOptions.map(o => (
              <button key={o.kind} onClick={() => setEmbed(o.kind)} className={secondaryBtn}>{o.label}</button>
            ))}
          </div>
        )}

        {canLose && (showLostReason ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 block">Reason for loss *</label>
            <textarea value={lostReason} onChange={e => setLostReason(e.target.value)} rows={3} placeholder="Why was this lost?"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
            <button disabled={saving || !lostReason.trim()} onClick={() => save('lost', `Marked Lost: ${lostReason.trim()}`, { lostReason: lostReason.trim() })}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 active:bg-red-600 disabled:opacity-40">
              Confirm — Mark Lost
            </button>
            <button onClick={() => setShowLostReason(false)} className={secondaryBtn}>Back</button>
          </div>
        ) : (
          <button onClick={() => { setLostReason(''); setShowLostReason(true) }} className="block mx-auto text-xs font-semibold text-slate-400 underline">
            Mark as Lost
          </button>
        ))}

        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>

    {/* Convert to Project popup: just the project name and the date, then the project is created right here. */}
    <BottomSheet isOpen={showConvert} onClose={() => !converting && setShowConvert(false)}>
      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 space-y-4">
        <p className="text-xs font-extrabold text-emerald-700 uppercase tracking-wide">Convert to Project</p>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Project ID</label>
          <input value={projectNumberForLead(lead)} readOnly
            className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Project Name <span className="text-red-500">*</span></label>
          <input value={convertName} onChange={e => setConvertName(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Project Due Date <span className="text-red-500">*</span></label>
          <DateField value={convertDue} onChange={setConvertDue} />
        </div>
        {convertError && <p className="text-xs text-red-600 font-semibold">{convertError}</p>}
        <button disabled={converting || !convertName.trim() || !convertDue} onClick={submitConvert}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white bg-emerald-700 active:bg-emerald-800 disabled:opacity-50">
          {converting ? "Converting…" : "Continue"}
        </button>
      </div>
    </BottomSheet>
    </>
  )
}
