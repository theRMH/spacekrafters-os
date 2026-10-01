import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Phone, MessageCircle, CheckCircle2 } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getAllQuotations } from '../../services/quotationService'
import { getAllProjects } from '../../services/projectService'
import { deriveProductSaleStage } from './productSaleStage'
import { createProductSaleShell } from './createProductSaleShell'
import { ProductSaleStatusSheet, PRODUCT_SALE_STAGE_LABEL } from './ProductSaleStatusSheet'
import type { Project, Quotation } from '../../types'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtCurrency(n?: number): string {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`
}

interface TimelineEvent { key: string; label: string; note?: string; by?: string; at: string }

export default function ProductSaleDetailScreen() {
  const { leadId } = useParams<{ leadId: string }>()
  const navigate = useNavigate()
  const { leads } = useCRM()

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [shell, setShell] = useState<Project | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [starting, setStarting] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  async function load() {
    const [q, projects] = await Promise.all([getAllQuotations(), getAllProjects()])
    setQuotations(q)
    setShell(projects.find(p => p.leadId === leadId && p.type === 'product_sale') ?? null)
    setLoaded(true)
  }

  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [leadId])

  const lead = leads.find(l => l.id === leadId)
  const quotation = useMemo(() => {
    const mine = quotations.filter(q => q.leadId === leadId)
    return [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  }, [quotations, leadId])

  const stage = lead ? deriveProductSaleStage(lead, quotations, shell ?? undefined) : 'customer_enquiry'

  const journey = useMemo(() => {
    const events: TimelineEvent[] = []
    if (lead) {
      for (const a of lead.activity ?? []) events.push({ key: `lead-${a.id}`, label: a.label, note: a.note, by: a.updatedBy, at: a.updatedAt })
    }
    if (quotation) {
      events.push({ key: 'quote-created', label: 'Quotation Created', by: quotation.createdBy, at: quotation.createdAt })
      for (const h of quotation.statusHistory ?? []) events.push({ key: `quote-${h.at}-${h.status}`, label: h.label, note: h.note, by: h.by, at: h.at })
    }
    if (shell) {
      for (const h of shell.statusHistory ?? []) events.push({ key: `shell-${h.updatedAt}-${h.stage}`, label: PRODUCT_SALE_STAGE_LABEL[h.stage as keyof typeof PRODUCT_SALE_STAGE_LABEL] ?? h.stage, note: h.note, by: h.updatedBy, at: h.updatedAt })
    }
    return events.filter(e => !!e.at).sort((a, b) => a.at.localeCompare(b.at))
  }, [lead, quotation, shell])

  async function handleStartProductSale() {
    if (!lead || !quotation) return
    setStarting(true)
    const result = await createProductSaleShell(lead, quotation, lead.ownerName)
    setStarting(false)
    if (!result.ok || !result.project) {
      setSnack({ open: true, msg: result.error ?? 'Could not start the product sale.', type: 'error' })
      return
    }
    setShell(result.project)
    setSnack({ open: true, msg: 'Product sale started.', type: 'success' })
  }

  function waLink(): string | null {
    if (!lead?.phone) return null
    const digits = lead.phone.replace(/\D/g, '')
    if (!digits) return null
    const intl = digits.length === 10 ? `91${digits}` : digits
    return `https://wa.me/${intl}?text=${encodeURIComponent(`Hi ${lead.name}, this is regarding your enquiry with SpaceKrafters.`)}`
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Loading…</p>
      </div>
    )
  }
  if (!lead) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Enquiry not found.</p>
      </div>
    )
  }

  const wa = waLink()

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="px-5 pt-5 pb-6 text-white" style={{ background: 'linear-gradient(135deg, #0F2A4A, #16385E)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <button onClick={() => navigate('/product-sales')} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center active:bg-white/25">
            <ChevronLeft size={19} />
          </button>
          <StatusBadge status={stage} label={PRODUCT_SALE_STAGE_LABEL[stage]} />
        </div>
        <h1 className="text-xl font-extrabold leading-tight">{lead.name}</h1>
        <p className="text-sm text-white/70 mt-0.5">{lead.phone}</p>
        {lead.businessBrand && <p className="text-xs text-white/70 mt-1">{BUSINESS_BRAND_LABEL[lead.businessBrand]}</p>}
      </div>

      <div className="px-4 pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <a href={lead.phone ? `tel:${lead.phone}` : undefined}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold ${lead.phone ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}>
            <Phone size={15} /> Call
          </a>
          <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold ${wa ? 'bg-emerald-50 text-emerald-700 active:bg-emerald-100' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}>
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>

        {/* Quotation */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
          <p className="text-sm font-extrabold text-slate-800">Quotation</p>
          {!quotation ? (
            <>
              <p className="text-xs text-slate-500 mt-1">No quotation drafted yet.</p>
              <button onClick={() => navigate('/quotations', { state: { leadId: lead.id } })}
                className="w-full mt-3 py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
                Create Quotation →
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-slate-800">{fmtCurrency(quotation.netAmount)}</span>
                <StatusBadge status={quotation.status} />
              </div>
              <button onClick={() => navigate('/quotations')}
                className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                View &amp; Manage in Quotations →
              </button>
              {quotation.status === 'client_approved' && !shell && (
                <button disabled={starting} onClick={handleStartProductSale}
                  className="w-full mt-2 py-3 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-50" style={{ background: '#059669' }}>
                  Start Product Sale →
                </button>
              )}
            </>
          )}
        </div>

        {/* Current Action Needed — once a shell exists */}
        {shell && shell.status !== 'closed' && (
          <div className="rounded-2xl border p-4" style={{ background: '#EEF2FF', borderColor: '#E0E7FF' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#4338CA' }}>Current Action Needed</p>
            <p className="text-base font-extrabold text-slate-800 mt-1">{PRODUCT_SALE_STAGE_LABEL[stage]}</p>
            {shell.pendingProductSaleStageRequest && (
              <p className="text-xs text-indigo-600 mt-1">Waiting for MD approval to move to {PRODUCT_SALE_STAGE_LABEL[shell.pendingProductSaleStageRequest.toStage]}.</p>
            )}
            <button onClick={() => setShowStatusSheet(true)}
              className="w-full mt-3 py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
              Update Status →
            </button>
          </div>
        )}

        {/* Payment summary — once a shell exists */}
        {shell && (
          <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
            <p className="text-sm font-extrabold text-slate-800 mb-2">Payment Summary</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] text-slate-400">Order Value</p>
                <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(shell.contractValue)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] text-slate-400">Advance Received</p>
                <p className="text-sm font-extrabold text-emerald-600">{fmtCurrency(shell.advanceReceived)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Enquiry Info */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
          <p className="text-sm font-extrabold text-slate-800 mb-2">Enquiry Info</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-800">{lead.phone}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-800">{lead.email || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">City</span><span className="font-semibold text-slate-800">{lead.city}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Lead ID</span><span className="font-semibold text-slate-800">{lead.leadNumber ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="font-semibold text-slate-800">{fmtDate(lead.createdAt)}</span></div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
          <p className="text-sm font-extrabold text-slate-800 mb-3">Timeline</p>
          {journey.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No activity recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {journey.map((e, i) => (
                <div key={e.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    {i < journey.length - 1 && <span className="w-px flex-1 bg-emerald-200 my-0.5" style={{ minHeight: 16 }} />}
                  </div>
                  <div className="min-w-0 pb-3">
                    <p className="text-xs font-bold text-slate-800">{e.label}</p>
                    <p className="text-[10px] text-slate-400">{fmtDateTime(e.at)}{e.by ? ` · ${e.by}` : ''}</p>
                    {e.note && <p className="text-[11px] text-slate-500 mt-0.5">{e.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {shell && (
        <ProductSaleStatusSheet
          isOpen={showStatusSheet}
          onClose={() => setShowStatusSheet(false)}
          project={shell}
          onDone={msg => { setSnack({ open: true, msg, type: 'success' }); load() }}
        />
      )}
      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
