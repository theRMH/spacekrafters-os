import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, MessageCircle } from 'lucide-react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { MdOverrideCard, withReason } from '../../components/forms/MdOverrideCard'
import { DateField } from '../../components/forms/DateField'
import { TimeField } from '../../components/forms/TimeField'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_DIVISION_LABEL, BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getRoleDisplayLabel } from '../../data/permissions'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllRequirements } from '../../services/requirementService'
import { getAllDesignPackages } from '../../services/designService'
import { DESIGN_STATUS_LABEL, designWorkflowInfo } from '../Design/DesignCenterScreen'
import { DesignStatusCard } from '../Design/DesignStatusCard'
import { QUOTATION_STATUS_LABEL, quotationWorkflowInfo } from '../Quotations/QuotationsScreen'
import { QuotationStatusCard } from '../Quotations/QuotationStatusCard'
import { getAllAppointments, updateAppointment } from '../../services/appointmentService'
import { decideRescheduleAndAdvanceLead } from '../Appointments/appointmentActions'
import { toProperIso } from '../Appointments/appointmentDate'
import { sendNotification } from '../../utils/notifications'
import type { Appointment, DesignPackage, Lead, LeadStatus, ManagedUser, Quotation } from '../../types'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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
  site_visit_scheduled:   'Site Visit Scheduled',
  site_visit_done:        'Site Visit Done',
  requirements_captured:  'Requirements Captured',
  quotation_drafted:      'Quotation Drafted',
  internally_approved:    'Internally Approved',
  design_in_progress:     'Design In Progress',
  design_approved:        'Design Approved',
  sent_to_client:         'Sent To Client',
  negotiating:            'Negotiating',
  client_approved:        'Client Approved',
  won:                    'Won',
  lost:                   'Lost',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  lead: Lead
  onDone: (msg: string) => void
  // Fired after a status change was saved, with the new status — lets the host
  // (the Leads list) follow the lead to its new sort bucket.
  onStatusChanged?: (status: LeadStatus) => void
}

// The mechanical portion of the Lead pipeline — everything up to "sent to
// the client", which is purely a consequence of real Quotation/Design
// progress. Negotiating/Client Approved/Won/Lost are deliberate human
// decisions and are never touched by the catch-up below.
const LEAD_STATUS_ORDER: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visit_done',
  'requirements_captured', 'quotation_drafted', 'internally_approved',
  'design_in_progress', 'design_approved', 'sent_to_client',
]

// Each individual status-change handler (changeQuotationStatus/
// changeDesignStatus) already advances the Lead on the exact transition that
// matters — but that only works if the Lead's status was correct going in.
// If anything ever breaks that chain (a transition made before this existed,
// a race, directly-edited data), the Lead can get permanently stuck showing
// a stage far behind the quotation/design's real progress, with every later
// auto-advance silently never firing because its own "previous status"
// precondition never matched. This recomputes the Lead's true minimum stage
// straight from the real records every time the sheet opens, and catches it
// up if it's behind — a self-healing resync, not just a one-shot trigger.
export function impliedMinLeadStatus(quotation: Quotation | null, designPackage: DesignPackage | null): LeadStatus | null {
  let min: LeadStatus | null = null
  const consider = (status: LeadStatus) => {
    if (!min || LEAD_STATUS_ORDER.indexOf(status) > LEAD_STATUS_ORDER.indexOf(min)) min = status
  }
  if (quotation) {
    if (quotation.status === 'internally_approved') consider('internally_approved')
    else if (['sent_to_client', 'client_approved', 'revision_requested', 'rejected'].includes(quotation.status)) {
      // Sent-to-client only means the LEAD is ready for the client once
      // nothing else (Design) still needs to happen first.
      consider(designPackage ? 'internally_approved' : 'sent_to_client')
    } else consider('quotation_drafted')
  }
  if (designPackage) {
    if (designPackage.status === 'internally_approved') consider('design_approved')
    else if (['sent_to_client', 'client_approved', 'revision_requested', 'rejected', 'client_review'].includes(designPackage.status)) consider('sent_to_client')
    else consider('design_in_progress')
  }
  return min
}

export function LeadStatusSheet({ isOpen, onClose, lead, onDone, onStatusChanged }: Props) {
  const { user, can } = useAuth()
  const { updateLead } = useCRM()
  const navigate = useNavigate()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [hasAppointment, setHasAppointment] = useState(false)
  const [latestAppointment, setLatestAppointment] = useState<Appointment | null>(null)
  const [showRescheduleForm, setShowRescheduleForm] = useState(false)
  const [rescheduleReasonText, setRescheduleReasonText] = useState('')
  const [rescheduledDateInput, setRescheduledDateInput] = useState('')
  const [mdDecisionNotes, setMdDecisionNotes] = useState('')
  const [hasSiteVisit, setHasSiteVisit] = useState(false)
  const [hasRequirement, setHasRequirement] = useState(false)
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [designPackage, setDesignPackage] = useState<DesignPackage | null>(null)

  const [showNegotiatingReason, setShowNegotiatingReason] = useState(false)
  const [negotiatingReason, setNegotiatingReason] = useState('')
  const [showLostReason, setShowLostReason] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setShowReassign(false)
    setReassignTo('')
    setShowNegotiatingReason(false)
    setShowLostReason(false)
    getManagedUsersDirectory().then(setUsers)
    getAllAppointments().then(a => {
      const relevant = a.filter(appt => appt.leadId === lead.id && appt.status.trim().toLowerCase() !== 'cancelled')
      setHasAppointment(relevant.length > 0)
      setLatestAppointment(relevant[0] ?? null)
    })
    getAllSiteVisits().then(v => setHasSiteVisit(v.some(sv => sv.leadId === lead.id)))
    getAllRequirements().then(async reqs => {
      const visits = await getAllSiteVisits()
      const myVisitIds = new Set(visits.filter(v => v.leadId === lead.id).map(v => v.id))
      setHasRequirement(reqs.some(r => myVisitIds.has(r.siteVisitId)))
    })
    Promise.all([getAllQuotations(), getAllDesignPackages()]).then(([qs, pkgs]) => {
      const myQuotation = qs.filter(q => q.leadId === lead.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
      const myDesign = pkgs.filter(p => p.leadId === lead.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
      setQuotation(myQuotation)
      setDesignPackage(myDesign)
      // Self-healing catch-up — see impliedMinLeadStatus above. Only ever
      // moves the Lead forward within the mechanical zone, never touches
      // negotiating/client_approved/won/lost.
      const implied = impliedMinLeadStatus(myQuotation, myDesign)
      const curIdx = LEAD_STATUS_ORDER.indexOf(lead.status)
      if (implied && curIdx !== -1 && !lead.mdStatusOverride && LEAD_STATUS_ORDER.indexOf(implied) > curIdx) {
        updateLead(lead.id, { status: implied }, `Synced to actual progress: ${implied.replace(/_/g, ' ')}`)
      }
    })
  }, [isOpen, lead.id])

  // Advancing a lead's status never reassigns it — the current assignee
  // (resolved below via effectiveAssigneeId/Name) stays responsible across
  // every stage until they, or the MD, explicitly hand it to someone else
  // via the "Assign To" control rendered below the Lead Details card. This
  // replaces the old behaviour of silently reassigning to "whichever managed
  // user happens to hold the stage's default role" on every transition,
  // which is what let a lead jump to someone who was never actually told.
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

  // MD-only: force the lead to any status (forward or back), bypassing the
  // stage checks above. The reason is mandatory and goes into the activity log.
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
      `${lead.name} (${lead.leadNumber ?? lead.id}) — ${LEAD_STATUS_LABEL[lead.status]}. Assigned by ${user?.name ?? 'System'}.`,
      `/tasks?leadId=${lead.id}`,
    )
    setShowReassign(false)
    setReassignTo('')
    onDone(`Assigned to ${person.fullName}.`)
  }

  async function submitContacted() {
    await save('contacted', 'Lead contacted')
  }

  async function submitQualified() {
    await save('qualified', 'Lead qualified')
  }

  async function submitConfirmAppointment() {
    await save('site_visit_scheduled', 'Appointment confirmed — site visit scheduled')
  }

  async function submitReschedule() {
    if (!latestAppointment || !rescheduleReasonText.trim()) return
    setSaving(true)
    const now = new Date().toISOString()
    const updated: Appointment = {
      ...latestAppointment,
      status: 'rescheduled',
      rescheduleReason: rescheduleReasonText.trim(),
      // Stored as a proper UTC ISO string (not the bare "YYYY-MM-DDTHH:mm"
      // the date/time fields produce) so it's unambiguous once read back —
      // a bare string is interpreted as local time by whichever device/server
      // reads it, which can silently shift the actual scheduled time.
      rescheduledDate: rescheduledDateInput ? toProperIso(rescheduledDateInput) : undefined,
      rescheduleRequestStatus: 'requested',
      rescheduleRequestedBy: user?.name,
      rescheduleRequestedAt: now,
      updatedAt: now,
    }
    const result = await updateAppointment(updated)
    if (result.ok) {
      setLatestAppointment(updated)
      setShowRescheduleForm(false)
      const mdUsers = users.filter(u => u.role === 'owner')
      const dateLine = rescheduledDateInput ? ` New date requested: ${new Date(rescheduledDateInput).toLocaleString('en-IN')}.` : ''
      await sendNotification(
        mdUsers.map(u => u.id),
        'Appointment Rescheduled',
        `${lead.name} (${lead.leadNumber ?? lead.id}) — ${lead.phone}. Reason: ${rescheduleReasonText.trim()}.${dateLine}`,
        '/approval',
      )
      await updateLead(lead.id, {}, `Appointment rescheduled: ${rescheduleReasonText.trim()}`)
      setRescheduleReasonText('')
      setRescheduledDateInput('')
      onDone('Reschedule reason sent to MD.')
      onClose()
    } else {
      onDone(result.error ?? 'Could not save the reschedule request.')
    }
    setSaving(false)
  }

  // Same decision function the central Approval page uses — one source of
  // truth, so a decision made here is immediately reflected there and vice
  // versa. Deliberately does not touch lead.status either way (see
  // decideRescheduleAndAdvanceLead's own comment) — approval only confirms
  // the appointment's new date; Complete/Rescheduled stay the explicit
  // choices on this same lead afterward.
  async function handleDecideReschedule(approved: boolean) {
    if (!latestAppointment || saving) return
    setSaving(true)
    const result = await decideRescheduleAndAdvanceLead({
      appt: latestAppointment, approved, notes: mdDecisionNotes, lead,
      decidedByName: user?.name ?? 'Unknown', decidedByRole: user?.role,
      updateLead,
    })
    setSaving(false)
    if (!result.ok) { onDone(result.error ?? 'Could not record decision.'); return }
    setLatestAppointment({
      ...latestAppointment,
      rescheduleRequestStatus: approved ? 'accepted' : 'rejected',
      status: approved ? 'scheduled' : latestAppointment.status,
      scheduledAt: approved && latestAppointment.rescheduledDate ? toProperIso(latestAppointment.rescheduledDate) : latestAppointment.scheduledAt,
    })
    setMdDecisionNotes('')
    onDone(approved ? 'Reschedule accepted.' : 'Reschedule rejected.')
  }

  async function submitSiteVisitScheduled() {
    await save('site_visit_done', 'Site visit completed')
  }

  async function submitSiteVisitDone() {
    await save('requirements_captured', 'Requirements captured')
  }

  async function submitQuotationDrafted() {
    await save('quotation_drafted', 'Quotation drafted, pending internal approval')
  }

  async function submitClientApprove() {
    await save('client_approved', 'Client approved')
  }

  async function submitClientNegotiating() {
    await save('negotiating', `Client requested changes: ${negotiatingReason.trim()}`)
  }

  async function submitClientLost() {
    await save('lost', `Marked Lost: ${lostReason.trim()}`, { lostReason: lostReason.trim() })
  }

  // The Advance decision itself (Proceed with/without Advance) now lives on
  // the Quotation, recorded the same way as on the Quotations page — see
  // QuotationStatusCard. This only fires once that's already been made
  // (quotation.advanceStatus/advancePaymentReceived set): it's the later,
  // separate step of actually converting the lead into a project.
  async function submitMarkWon() {
    await save('won', 'Marked Won — converting to a project')
    navigate(`/projects?leadId=${lead.id}`)
  }

  // The lead's current, actually-assigned person — assignedToId/Name if an
  // explicit hand-off has happened, otherwise the lead's own Owner (the
  // original explicit "Assign To" from Leads), otherwise genuinely nobody.
  // Never a role-based guess — see save()'s comment above.
  const effectiveAssigneeId = lead.assignedToId ?? lead.ownerId
  const effectiveAssigneeName = lead.assignedToName ?? lead.ownerName
  // Same gate LeadsScreen.tsx/LeadDetailScreen.tsx already use for their own
  // "Current Action Needed" card — full managers (edit_lead) always act;
  // otherwise only the actual assignee. A lead nobody's assigned to is NOT
  // fair game for just anyone — it stays gated to managers until someone
  // explicitly assigns it.
  const canAct = can('edit_lead') || user?.id === effectiveAssigneeId
  // Wider than canAct, for the 'qualified'/'site_visit_scheduled' stages only
  // — the appointment's own attendee list (Appointment.assignedToIds, set
  // independently in AppointmentsScreen.tsx) is who's actually supposed to
  // confirm/reschedule the appointment and then go log the Site Visit, and
  // that's frequently NOT the Lead's own assignee (e.g. the PC owns the lead
  // but assigns a Designer to attend). Without this, that attendee hits
  // "Waiting on {lead owner}" at both stages with no way to act, even though
  // My Tasks routes them to this exact sheet for exactly that.
  const canActOnAppointment = !!(user && latestAppointment && (latestAppointment.assignedToIds ?? []).includes(user.id))
  const canActViaAppointment = canActOnAppointment && (lead.status === 'qualified' || lead.status === 'site_visit_scheduled')
  // Tighter than canAct — completing the Site Visit step specifically is
  // reserved for the actual Lead assignee (or the MD), deliberately NOT the
  // appointment's own attendee: the user confirmed the Lead stays with its
  // existing owner/PC for this step rather than auto-handing it to whoever
  // attended, and sks_leads' RLS only grants a designer write access at
  // 'internally_approved'/'design_in_progress' anyway — not here — so this
  // also avoids a write that would silently fail for that attendee.
  const canCompleteSiteVisit = user?.id === effectiveAssigneeId || user?.role === 'owner'

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`

  function renderBody() {
    if (!canAct && !canActViaAppointment) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {effectiveAssigneeName ?? 'Not Assigned'}.
        </p>
      )
    }

    switch (lead.status) {
      case 'new':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm this lead has been contacted.</p>
            <button disabled={saving} onClick={submitContacted} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Mark Contacted
            </button>
          </div>
        )
      case 'contacted':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm this lead is qualified and worth pursuing.</p>
            <button disabled={saving} onClick={submitQualified} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Mark Qualified
            </button>
          </div>
        )
      case 'qualified': {
        if (!hasAppointment) {
          return (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">No appointment scheduled yet — schedule one in the Appointments tab first.</p>
              <button onClick={() => { onClose(); navigate('/appointments', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Appointments →
              </button>
            </div>
          )
        }

        const pendingReschedule = latestAppointment?.rescheduleRequestStatus === 'requested'

        if (pendingReschedule && latestAppointment) {
          const appt = latestAppointment
          return (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                <p className="text-xs font-bold text-amber-700">Pending MD Approval</p>
                <p className="text-xs text-amber-600 mt-1">Requested by {appt.rescheduleRequestedBy ?? '—'}</p>
                <p className="text-xs text-amber-600">Reason: {appt.rescheduleReason}</p>
                {appt.rescheduledDate && (
                  <p className="text-xs text-amber-600">Requested new date: {new Date(appt.rescheduledDate).toLocaleString('en-IN')}</p>
                )}
              </div>
              {/* Same decision function the central Approval page uses
                  (decideRescheduleAndAdvanceLead) — one source of truth, two
                  entry points into it, always in sync. */}
              {user?.role === 'owner' ? (
                <>
                  <textarea value={mdDecisionNotes} onChange={e => setMdDecisionNotes(e.target.value)} rows={2}
                    placeholder="Notes (optional)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
                  <div className="flex gap-2.5">
                    <button disabled={saving} onClick={() => handleDecideReschedule(true)}
                      className="flex-1 text-center p-2.5 rounded-2xl bg-emerald-600 active:bg-emerald-700 disabled:opacity-50">
                      <p className="text-base font-bold text-white">Approve</p>
                    </button>
                    <button disabled={saving} onClick={() => handleDecideReschedule(false)}
                      className="flex-1 text-center p-2.5 rounded-2xl bg-red-600 active:bg-red-700 disabled:opacity-50">
                      <p className="text-base font-bold text-white">Reject</p>
                    </button>
                  </div>
                  <button onClick={() => { onClose(); navigate('/approval') }} className={secondaryBtn}>
                    Open in Approval →
                  </button>
                </>
              ) : (
                <p className="text-sm text-slate-500 text-center py-2">Waiting on MD to review.</p>
              )}
            </div>
          )
        }

        if (showRescheduleForm) {
          return (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Reason for rescheduling *</label>
                <textarea value={rescheduleReasonText} onChange={e => setRescheduleReasonText(e.target.value)}
                  placeholder="e.g. Client is not interested / Client requested another date" rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">New date/time <span className="font-normal text-slate-400">(optional)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <DateField value={rescheduledDateInput.split('T')[0] || ''} min={todayStr()}
                    onChange={v => setRescheduledDateInput(`${v}T${rescheduledDateInput.split('T')[1] || '09:00'}`)} />
                  <TimeField value={rescheduledDateInput.split('T')[1] || ''}
                    onChange={v => setRescheduledDateInput(`${rescheduledDateInput.split('T')[0] || new Date().toISOString().slice(0, 10)}T${v}`)} />
                </div>
              </div>
              <button disabled={saving || !rescheduleReasonText.trim()} onClick={submitReschedule} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Submit Reschedule
              </button>
              <button onClick={() => { setShowRescheduleForm(false); setRescheduleReasonText(''); setRescheduledDateInput('') }} className={secondaryBtn}>
                Back
              </button>
            </div>
          )
        }

        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">A site visit appointment is scheduled. Reschedule it for MD approval, or confirm it now to move the lead to Site Visit.</p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={saving} onClick={submitConfirmAppointment} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Complete
              </button>
              <button disabled={saving} onClick={() => setShowRescheduleForm(true)} className={`${btn} border border-amber-200 bg-amber-50 text-amber-700`}>
                Rescheduled
              </button>
            </div>
          </div>
        )
      }
      case 'site_visit_scheduled':
        return (
          <div className="space-y-3">
            {hasSiteVisit && <p className="text-sm text-slate-600">Site visit is on record.</p>}
            {hasSiteVisit ? (
              canCompleteSiteVisit ? (
                <button disabled={saving} onClick={submitSiteVisitScheduled} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                  Mark Site Visit Done
                </button>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  Waiting on {effectiveAssigneeName ?? 'Not Assigned'} to mark the Site Visit done.
                </p>
              )
            ) : (
              <button onClick={() => { onClose(); navigate('/site-visits', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Site Visits →
              </button>
            )}
          </div>
        )
      case 'site_visit_done':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{hasRequirement ? 'Requirements are on record.' : 'No requirements captured yet — add them in the Requirements screen first.'}</p>
            {hasRequirement ? (
              <button disabled={saving} onClick={submitSiteVisitDone} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Mark Requirements Captured
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/requirements', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Requirements →
              </button>
            )}
          </div>
        )
      case 'requirements_captured':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{quotation ? 'A quotation has been drafted.' : 'No quotation drafted yet — draft one in the Quotations screen first.'}</p>
            {quotation ? (
              <button disabled={saving} onClick={submitQuotationDrafted} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Confirm Quotation Drafted
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/quotations', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Quotations →
              </button>
            )}
          </div>
        )
      case 'quotation_drafted': {
        // The actual QS -> PC -> MD approve/reject/resubmit actions are the
        // exact same transition (changeQuotationStatus) QuotationsScreen.tsx's
        // own Detail sheet uses — rendered here inline via QuotationStatusCard
        // for whoever can act (PC/MD), so Update Status never has to leave the
        // Lead page. Everyone else (and anything needing real line-item
        // editing) just sees a read-only reflection + a link to the full screen.
        const canActOnQuotation = quotation && (can('approve_quotation_pc') || can('approve_quotation_internal'))
        if (quotation && canActOnQuotation) {
          return (
            <QuotationStatusCard
              quotation={quotation} can={can} user={user} lead={lead} updateLead={updateLead}
              onChanged={setQuotation}
              onReview={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation.id } }) }}
            />
          )
        }
        return (
          <div className="space-y-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Quotation Status</p>
                  <p className="text-sm font-bold text-indigo-900">{quotation ? QUOTATION_STATUS_LABEL[quotation.status] : 'Not drafted'}</p>
                </div>
                {quotation && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                    <p className="text-sm font-bold text-indigo-900">{quotationWorkflowInfo(quotation).responsible}</p>
                  </div>
                )}
              </div>
              {quotation && <p className="text-xs text-indigo-700 mt-1.5">Next: {quotationWorkflowInfo(quotation).next}</p>}
            </div>
            {quotation?.rejectionReason && (quotation.status === 'pc_rejected' || quotation.status === 'md_rejected') && (
              <p className="text-xs text-red-600">Revision reason: {quotation.rejectionReason}</p>
            )}
            <button onClick={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation?.id } }) }} className={secondaryBtn}>
              Review in Quotations →
            </button>
          </div>
        )
      }
      case 'internally_approved': {
        if (designPackage) {
          return (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Design package started.</p>
              <button disabled={saving} onClick={() => save('design_in_progress', 'Design started')} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Confirm Design Started
              </button>
            </div>
          )
        }
        // MD approving internally is only the first of three quotation steps
        // still ahead of design (Send to Client -> Client Approval -> Proceed
        // with/without Advance — see DesignCenterScreen.tsx's own gate). This
        // used to jump straight to "Go to Design Center" right after internal
        // approval, which just dead-ended there since the New Design Package
        // form blocks creation until the quotation is actually client-approved
        // with an advance decision made. Only offer Design Center once that's
        // genuinely true; otherwise reflect the quotation's real next step.
        const designReady = quotation?.status === 'client_approved' && !!(quotation.advanceStatus || quotation.advancePaymentReceived)
        if (designReady) {
          return (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Quotation complete — start a design package in the Design Center.</p>
              <button onClick={() => { onClose(); navigate('/design', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Design Center →
              </button>
            </div>
          )
        }
        // Same "render the real action inline, else read-only + link" split
        // as the quotation_drafted case above — Send to Client is a plain
        // status transition (changeQuotationStatus), so whoever can send it
        // acts right here instead of being pushed to the full screen.
        if (quotation && can('send_quotation_client')) {
          return (
            <QuotationStatusCard
              quotation={quotation} can={can} user={user} lead={lead} updateLead={updateLead}
              onChanged={setQuotation}
              onReview={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation.id } }) }}
            />
          )
        }
        return (
          <div className="space-y-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Quotation Status</p>
                  <p className="text-sm font-bold text-indigo-900">{quotation ? QUOTATION_STATUS_LABEL[quotation.status] : 'Not drafted'}</p>
                </div>
                {quotation && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                    <p className="text-sm font-bold text-indigo-900">{quotationWorkflowInfo(quotation).responsible}</p>
                  </div>
                )}
              </div>
              {quotation && <p className="text-xs text-indigo-700 mt-1.5">Next: {quotationWorkflowInfo(quotation).next}</p>}
            </div>
            <button onClick={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation?.id } }) }} className={secondaryBtn}>
              Review in Quotations →
            </button>
          </div>
        )
      }
      case 'design_in_progress': {
        // Same reasoning as the quotation_drafted case above — the real
        // transition (changeDesignStatus) renders inline via DesignStatusCard
        // for whoever can act (PC/MD); everyone else gets a read-only
        // reflection + a link to the full screen.
        const canActOnDesign = designPackage && (can('approve_design_pc') || can('approve_design'))
        if (designPackage && canActOnDesign) {
          return (
            <DesignStatusCard
              pkg={designPackage} can={can} user={user} lead={lead} updateLead={updateLead}
              onChanged={setDesignPackage}
              onReview={() => { onClose(); navigate('/design', { state: { packageId: designPackage.id } }) }}
            />
          )
        }
        return (
          <div className="space-y-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Design Status</p>
                  <p className="text-sm font-bold text-indigo-900">{designPackage ? DESIGN_STATUS_LABEL[designPackage.status] : 'Not started'}</p>
                </div>
                {designPackage && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                    <p className="text-sm font-bold text-indigo-900">{designWorkflowInfo(designPackage.status).responsible}</p>
                  </div>
                )}
              </div>
              {designPackage && <p className="text-xs text-indigo-700 mt-1.5">Next: {designWorkflowInfo(designPackage.status).next}</p>}
            </div>
            {designPackage?.rejectionReason && (designPackage.status === 'pc_rejected' || designPackage.status === 'md_rejected') && (
              <p className="text-xs text-red-600">Revision reason: {designPackage.rejectionReason}</p>
            )}
            <button onClick={() => { onClose(); navigate('/design', { state: { packageId: designPackage?.id } }) }} className={secondaryBtn}>
              Review in Design Center →
            </button>
          </div>
        )
      }
      case 'design_approved':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">MD approved the design. Send it to the client from the Design Center — this lead moves on automatically once that's done.</p>
            <button onClick={() => { onClose(); navigate('/design', { state: { packageId: designPackage?.id } }) }} className={secondaryBtn}>
              Go to Design Center →
            </button>
          </div>
        )
      case 'sent_to_client':
      case 'negotiating': {
        // Same Approve/Reject card pair and copy as the Approval page's own
        // Client Approval sheet (ApprovalReviewSheets.tsx's decisionFooter),
        // so recording the client's decision looks identical whether it's
        // done from here or from Approval. "Mark as Lost" is a separate,
        // less common outcome — kept reachable but out of the way as a plain
        // link rather than a third big card.
        if (showNegotiatingReason) {
          return (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 block">What does the client want changed?</label>
              <textarea value={negotiatingReason} onChange={e => setNegotiatingReason(e.target.value)} rows={3} placeholder="What needs to change?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              <button disabled={saving || !negotiatingReason.trim()} onClick={submitClientNegotiating}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 active:bg-red-600 disabled:opacity-40">
                Confirm — Still Negotiating
              </button>
              <button onClick={() => setShowNegotiatingReason(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600">
                Back
              </button>
            </div>
          )
        }
        if (showLostReason) {
          return (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 block">Reason for loss *</label>
              <textarea value={lostReason} onChange={e => setLostReason(e.target.value)} rows={3} placeholder="Why was this lost?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              <button disabled={saving || !lostReason.trim()} onClick={submitClientLost}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 active:bg-red-600 disabled:opacity-40">
                Confirm — Mark Lost
              </button>
              <button onClick={() => setShowLostReason(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-600">
                Back
              </button>
            </div>
          )
        }
        return (
          <div className="space-y-3">
            <div className="flex gap-2.5">
              <button disabled={saving} onClick={submitClientApprove}
                className="flex-1 text-center p-2.5 rounded-2xl bg-emerald-600 active:bg-emerald-700 disabled:opacity-50">
                <p className="text-base font-bold text-white">Approve</p>
                <p className="text-sm text-white/90 mt-0.5">Client approved — move the project forward.</p>
              </button>
              <button disabled={saving} onClick={() => { setNegotiatingReason(''); setShowNegotiatingReason(true) }}
                className="flex-1 text-center p-2.5 rounded-2xl bg-red-600 active:bg-red-700 disabled:opacity-50">
                <p className="text-base font-bold text-white">Reject</p>
                <p className="text-sm text-white/90 mt-0.5">Client requested changes to this quotation.</p>
              </button>
            </div>
            <button onClick={() => { setLostReason(''); setShowLostReason(true) }} className="block mx-auto text-xs font-semibold text-slate-400 underline">
              Mark as Lost instead
            </button>
          </div>
        )
      }
      case 'client_approved': {
        // Mirrors QuotationsScreen.tsx's own Status Actions at this stage: the
        // Advance decision (Proceed with/without Advance) happens on the
        // Quotation first — this used to instead ask for an "Advance Amount
        // Received" directly on the Lead and jump straight to Won, skipping
        // that real decision entirely and duplicating the amount capture.
        const advanceDecided = !!(quotation?.advanceStatus || quotation?.advancePaymentReceived)
        if (quotation && !advanceDecided && can('send_quotation_client')) {
          return (
            <QuotationStatusCard
              quotation={quotation} can={can} user={user} lead={lead} updateLead={updateLead}
              onChanged={setQuotation}
              onReview={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation.id } }) }}
            />
          )
        }
        if (!advanceDecided) {
          return (
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Quotation Status</p>
                    <p className="text-sm font-bold text-indigo-900">{quotation ? QUOTATION_STATUS_LABEL[quotation.status] : 'Not drafted'}</p>
                  </div>
                  {quotation && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                      <p className="text-sm font-bold text-indigo-900">{quotationWorkflowInfo(quotation).responsible}</p>
                    </div>
                  )}
                </div>
                {quotation && <p className="text-xs text-indigo-700 mt-1.5">Next: {quotationWorkflowInfo(quotation).next}</p>}
              </div>
              <button onClick={() => { onClose(); navigate('/quotations', { state: { quotationId: quotation?.id } }) }} className={secondaryBtn}>
                Review in Quotations →
              </button>
            </div>
          )
        }
        // Advance decided — Design is next, same as the 'internally_approved'
        // case's designReady branch. Lead.status itself never leaves
        // 'client_approved' once a human sets it (it's outside
        // LEAD_STATUS_ORDER, so the self-healing resync skips it — see
        // impliedMinLeadStatus above), so every remaining real-world stage
        // from here (no design yet / design in progress / design approved by
        // client) has to be reflected inside this one case, not a separate one.
        if (!designPackage) {
          return (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Quotation complete — start a design package in the Design Center.</p>
              <button onClick={() => { onClose(); navigate('/design', { state: { leadId: lead.id, returnTo: '/leads' } }) }} className={secondaryBtn}>
                Go to Design Center →
              </button>
            </div>
          )
        }
        if (designPackage.status !== 'client_approved') {
          const canActOnDesign = can('approve_design_pc') || can('approve_design')
          if (canActOnDesign) {
            return (
              <DesignStatusCard
                pkg={designPackage} can={can} user={user} lead={lead} updateLead={updateLead}
                onChanged={setDesignPackage}
                onReview={() => { onClose(); navigate('/design', { state: { packageId: designPackage.id } }) }}
              />
            )
          }
          return (
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Design Status</p>
                    <p className="text-sm font-bold text-indigo-900">{DESIGN_STATUS_LABEL[designPackage.status]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Responsible</p>
                    <p className="text-sm font-bold text-indigo-900">{designWorkflowInfo(designPackage.status).responsible}</p>
                  </div>
                </div>
                <p className="text-xs text-indigo-700 mt-1.5">Next: {designWorkflowInfo(designPackage.status).next}</p>
              </div>
              {designPackage.rejectionReason && (designPackage.status === 'pc_rejected' || designPackage.status === 'md_rejected') && (
                <p className="text-xs text-red-600">Revision reason: {designPackage.rejectionReason}</p>
              )}
              <button onClick={() => { onClose(); navigate('/design', { state: { packageId: designPackage.id } }) }} className={secondaryBtn}>
                Review in Design Center →
              </button>
            </div>
          )
        }
        return (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5">
              <p className="text-xs font-bold text-emerald-700">Design approved by the client.</p>
              <p className="text-[12px] text-emerald-600 mt-1">Ready to convert this lead to a project.</p>
            </div>
            <button disabled={saving} onClick={submitMarkWon} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Mark Won → Create Project
            </button>
          </div>
        )
      }
      default:
        return <p className="text-sm text-slate-400 py-6 text-center">No action available at this stage.</p>
    }
  }

  const wa = waLink(lead)
  // These early stages only ever need a phone call — WhatsApp is hidden and
  // Call takes the full row, solid green.
  const soloCall = lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified' || lead.status === 'site_visit_done'

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Update Status — ${LEAD_STATUS_LABEL[lead.status]}`} height="full">
      <div className="space-y-4">
        {user?.role === 'owner' && (
          <MdOverrideCard noun="status" title="lead status" saving={saving} onApply={submitMdOverride}
            options={(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).filter(s => s !== lead.status).map(s => ({ value: s, label: LEAD_STATUS_LABEL[s] }))} />
        )}

        {/* Lead details card — compact, light card (not a full-bleed dark
            header) matching the reference app's own "Customer Details" card:
            label, name + status badge, then phone/location/owner/company in
            plain text, Call/WhatsApp below. Every stage's action screen
            shares this, so whoever's acting on it always sees who they're
            calling and where, without leaving this sheet. */}
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Lead Details</p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-800 leading-tight truncate">{lead.name}</h3>
              {lead.leadNumber && <p className="text-xs text-slate-400 mt-0.5">{lead.leadNumber}</p>}
            </div>
            <StatusBadge status={lead.status} label={LEAD_STATUS_LABEL[lead.status]} />
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
        </div>

        {/* Explicit hand-off — the only way the current assignee changes.
            Shown to whoever can currently act (the assignee themself, or the
            MD), so they can pass this lead to the next person only once
            they're ready to, instead of it happening automatically. */}
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
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
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

        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
