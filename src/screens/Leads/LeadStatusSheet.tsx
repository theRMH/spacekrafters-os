import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllRequirements } from '../../services/requirementService'
import { getAllDesignPackages } from '../../services/designService'
import { getAllAppointments } from '../../services/appointmentService'
import type { Lead, LeadStatus, ManagedUser, UserRole } from '../../types'

export const ROLE_FOR_LEAD_STATUS: Partial<Record<LeadStatus, UserRole>> = {
  new:                    'project_coordinator',
  contacted:              'project_coordinator',
  qualified:              'project_coordinator',
  site_visit_scheduled:  'site_engineer',
  site_visit_done:       'project_coordinator',
  requirements_captured: 'project_coordinator',
  quotation_drafted:     'owner',
  internally_approved:   'designer',
  design_in_progress:    'designer',
  design_approved:       'project_coordinator',
  sent_to_client:        'project_coordinator',
  negotiating:           'project_coordinator',
  client_approved:       'accounts',
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
}

export function LeadStatusSheet({ isOpen, onClose, lead, onDone }: Props) {
  const { user } = useAuth()
  const { updateLead } = useCRM()
  const navigate = useNavigate()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [hasAppointment, setHasAppointment] = useState(false)
  const [hasSiteVisit, setHasSiteVisit] = useState(false)
  const [hasRequirement, setHasRequirement] = useState(false)
  const [hasApprovedQuotation, setHasApprovedQuotation] = useState(false)
  const [hasDesignPackage, setHasDesignPackage] = useState(false)

  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [clientOutcome, setClientOutcome] = useState<'client_approved' | 'negotiating' | 'lost'>('client_approved')
  const [lostReason, setLostReason] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceRef, setAdvanceRef] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    getManagedUsersDirectory().then(setUsers)
    getAllAppointments().then(a => setHasAppointment(a.some(appt => appt.leadId === lead.id && appt.status === 'scheduled')))
    getAllSiteVisits().then(v => setHasSiteVisit(v.some(sv => sv.leadId === lead.id)))
    getAllRequirements().then(async reqs => {
      const visits = await getAllSiteVisits()
      const myVisitIds = new Set(visits.filter(v => v.leadId === lead.id).map(v => v.id))
      setHasRequirement(reqs.some(r => myVisitIds.has(r.siteVisitId)))
    })
    getAllQuotations().then(qs => setHasApprovedQuotation(qs.some(q => q.leadId === lead.id && q.status === 'client_approved')))
    getAllDesignPackages().then(pkgs => setHasDesignPackage(pkgs.some(p => p.leadId === lead.id)))
  }, [isOpen, lead.id])

  function nextResponsible(status: LeadStatus): { role?: UserRole; id?: string; name?: string } {
    const role = ROLE_FOR_LEAD_STATUS[status]
    if (!role) return {}
    const person = users.find(u => u.role === role)
    return { role, id: person?.id, name: person?.fullName }
  }

  async function save(status: LeadStatus, note: string, extra?: Partial<Lead>) {
    setSaving(true)
    const { role, id, name } = nextResponsible(status)
    const result = await updateLead(lead.id, {
      status,
      assignedRole: role,
      assignedToId: id,
      assignedToName: name,
      ...extra,
    }, note)
    setSaving(false)
    if (result.ok) {
      onDone(note)
      onClose()
    } else {
      onDone(result.error ?? 'Could not update status.')
    }
  }

  async function submitContacted() {
    await save('contacted', 'Lead contacted')
  }

  async function submitQualified() {
    await save('qualified', 'Lead qualified')
  }

  async function submitSiteVisitScheduling() {
    await save('site_visit_scheduled', 'Site visit scheduled')
  }

  async function submitSiteVisitScheduled() {
    await save('site_visit_done', 'Site visit completed')
  }

  async function submitSiteVisitDone() {
    await save('requirements_captured', 'Requirements captured')
  }

  async function submitQuotationDrafted() {
    await save('internally_approved', 'Quotation drafted, pending internal approval')
  }

  async function submitInternalApproval(approved: boolean) {
    if (approved) {
      await save('design_in_progress', 'Internally approved')
    } else {
      await save('quotation_drafted', `Internal approval rejected: ${rejectReason.trim()}`)
      setShowReject(false)
      setRejectReason('')
    }
  }

  async function submitDesignApproval(approved: boolean) {
    if (approved) {
      await save('design_approved', 'Design approved')
    } else {
      await save('design_in_progress', `Revision requested: ${rejectReason.trim()}`)
      setShowReject(false)
      setRejectReason('')
    }
  }

  async function submitSendToClient() {
    await save('sent_to_client', 'Quotation and design sent to client')
  }

  async function submitClientDecision() {
    if (clientOutcome === 'lost') {
      await save('lost', `Marked Lost: ${lostReason.trim()}`, { lostReason: lostReason.trim() })
    } else if (clientOutcome === 'negotiating') {
      await save('negotiating', 'Client negotiating')
    } else {
      await save('client_approved', 'Client approved')
    }
  }

  async function submitAdvancePayment() {
    const amount = Number(advanceAmount)
    if (!amount || amount <= 0) {
      onDone('Enter a valid advance payment amount.')
      return
    }
    await save('won', `Advance payment received: ₹${amount.toLocaleString('en-IN')}`, {
      advancePaymentAmount: amount,
      advancePaymentRef: advanceRef.trim() || undefined,
    })
    navigate(`/projects?leadId=${lead.id}`)
  }

  const { role: respRole, name: respName } = { role: ROLE_FOR_LEAD_STATUS[lead.status], name: lead.assignedToName }
  const canAct = !respRole || user?.role === respRole || user?.role === 'owner'

  const btn = 'w-full py-3 rounded-xl text-sm font-bold active:opacity-90 disabled:opacity-50'
  const primaryBtn = `${btn} text-white`
  const secondaryBtn = `${btn} border border-slate-200 bg-white text-slate-600`

  function renderBody() {
    if (!canAct) {
      return (
        <p className="text-sm text-slate-500 py-6 text-center">
          Waiting on {respName ?? (respRole ? respRole.replace('_', ' ') : 'the next step')}.
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
      case 'qualified':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{hasAppointment ? 'A site visit appointment is scheduled.' : 'No appointment scheduled yet — schedule one in the Appointments tab first.'}</p>
            {hasAppointment ? (
              <button disabled={saving} onClick={submitSiteVisitScheduling} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Confirm Site Visit Scheduled
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/appointments') }} className={secondaryBtn}>
                Go to Appointments →
              </button>
            )}
          </div>
        )
      case 'site_visit_scheduled':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{hasSiteVisit ? 'Site visit is on record.' : 'No site visit logged yet — capture it in the Site Visits tab first.'}</p>
            {hasSiteVisit ? (
              <button disabled={saving} onClick={submitSiteVisitScheduled} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Mark Site Visit Done
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/site-visits') }} className={secondaryBtn}>
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
              <button onClick={() => { onClose(); navigate('/requirements') }} className={secondaryBtn}>
                Go to Requirements →
              </button>
            )}
          </div>
        )
      case 'requirements_captured':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Draft the quotation in the Quotations screen, then confirm here.</p>
            <button disabled={saving} onClick={submitQuotationDrafted} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Quotation Drafted
            </button>
          </div>
        )
      case 'quotation_drafted':
        return (
          <div className="space-y-3">
            {!showReject ? (
              <div className="flex gap-2">
                <button disabled={saving} onClick={() => submitInternalApproval(true)} className={`${btn} flex-1 text-white`} style={{ background: '#059669' }}>
                  Approve
                </button>
                <button disabled={saving} onClick={() => setShowReject(true)} className={`${btn} flex-1 border border-red-200 bg-red-50 text-red-700`}>
                  Reject
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" rows={3} />
                <button disabled={!rejectReason.trim() || saving} onClick={() => submitInternalApproval(false)} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                  Send Back for Rework
                </button>
              </div>
            )}
          </div>
        )
      case 'internally_approved':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{hasDesignPackage ? 'Design package started.' : 'Start a design package in the Design Center first.'}</p>
            {hasDesignPackage ? (
              <button disabled={saving} onClick={() => save('design_in_progress', 'Design started')} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                Confirm Design Started
              </button>
            ) : (
              <button onClick={() => { onClose(); navigate('/design') }} className={secondaryBtn}>
                Go to Design Center →
              </button>
            )}
          </div>
        )
      case 'design_in_progress':
        return (
          <div className="space-y-3">
            {!showReject ? (
              <div className="flex gap-2">
                <button disabled={saving} onClick={() => submitDesignApproval(true)} className={`${btn} flex-1 text-white`} style={{ background: '#059669' }}>
                  Approve Design
                </button>
                <button disabled={saving} onClick={() => setShowReject(true)} className={`${btn} flex-1 border border-amber-200 bg-amber-50 text-amber-700`}>
                  Request Revision
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="What needs revision"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" rows={3} />
                <button disabled={!rejectReason.trim() || saving} onClick={() => submitDesignApproval(false)} className={primaryBtn} style={{ background: '#0F2A4A' }}>
                  Send Back for Revision
                </button>
              </div>
            )}
          </div>
        )
      case 'design_approved':
        return (
          <div className="space-y-3">
            <button disabled={saving} onClick={submitSendToClient} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Sent To Client
            </button>
          </div>
        )
      case 'sent_to_client':
      case 'negotiating':
        return (
          <div className="space-y-3">
            <select value={clientOutcome} onChange={e => setClientOutcome(e.target.value as typeof clientOutcome)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="client_approved">Client Approved</option>
              <option value="negotiating">Still Negotiating</option>
              <option value="lost">Lost</option>
            </select>
            {clientOutcome === 'lost' && (
              <textarea value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Reason for loss"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" rows={3} />
            )}
            <button disabled={saving || (clientOutcome === 'lost' && !lostReason.trim())} onClick={submitClientDecision} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm
            </button>
          </div>
        )
      case 'client_approved':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Advance Amount Received</label>
              <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="₹"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reference (optional)</label>
              <input value={advanceRef} onChange={e => setAdvanceRef(e.target.value)} placeholder="UTR / cheque no."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <button disabled={saving} onClick={submitAdvancePayment} className={primaryBtn} style={{ background: '#0F2A4A' }}>
              Confirm Advance Payment → Create Project
            </button>
          </div>
        )
      default:
        return <p className="text-sm text-slate-400 py-6 text-center">No action available at this stage.</p>
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Update Status — ${LEAD_STATUS_LABEL[lead.status]}`}>
      <div className="space-y-4">
        {renderBody()}
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
      </div>
    </BottomSheet>
  )
}
