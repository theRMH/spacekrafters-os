import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { getAllPersonalCommitments, upsertPersonalCommitment, deletePersonalCommitment, getAllPersonalAccounts } from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type { PersonalCommitment, PersonalCommitmentType, PersonalCommitmentFrequency, PersonalCommitmentStatus, PersonalAccount } from '../../types'

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_OPTIONS: { value: PersonalCommitmentType; label: string }[] = [
  { value: 'insurance',       label: 'Insurance' },
  { value: 'utility',         label: 'Utility' },
  { value: 'subscription',    label: 'Subscription' },
  { value: 'emi',             label: 'EMI' },
  { value: 'sip',             label: 'SIP' },
  { value: 'expected_income', label: 'Expected Income' },
  { value: 'other',           label: 'Other' },
]
const TYPE_LABEL: Record<PersonalCommitmentType, string> = Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o.label])) as Record<PersonalCommitmentType, string>

const FREQUENCY_OPTIONS: { value: PersonalCommitmentFrequency; label: string }[] = [
  { value: 'one_time',    label: 'One Time' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'annual',      label: 'Annual' },
  { value: 'custom',      label: 'Custom' },
]

const STATUS_OPTIONS: { value: PersonalCommitmentStatus; label: string }[] = [
  { value: 'upcoming',  label: 'Upcoming' },
  { value: 'due',       label: 'Due' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'paid',      label: 'Paid' },
  { value: 'paused',    label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired',   label: 'Expired' },
]
const STATUS_TONE: Record<PersonalCommitmentStatus, string> = {
  upcoming: 'text-slate-500 bg-slate-100', due: 'text-amber-600 bg-amber-50', overdue: 'text-red-600 bg-red-50',
  paid: 'text-emerald-600 bg-emerald-50', paused: 'text-slate-500 bg-slate-100', cancelled: 'text-slate-400 bg-slate-100', expired: 'text-slate-400 bg-slate-100',
}

function emptyCommitment(): PersonalCommitment {
  return {
    id: `pcom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    commitmentType: 'subscription',
    name: '',
    frequency: 'monthly',
    dueDate: new Date().toISOString().slice(0, 10),
    status: 'upcoming',
    createdAt: new Date().toISOString(),
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PersonalCommitmentsScreen() {
  const { user } = useAuth()
  const [commitments, setCommitments] = useState<PersonalCommitment[]>([])
  const [accounts, setAccounts] = useState<PersonalAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PersonalCommitment>(emptyCommitment())
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [c, a] = await Promise.all([getAllPersonalCommitments(), getAllPersonalAccounts()])
      setCommitments(c); setAccounts(a)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyCommitment())
    setIsEditing(false)
    setShowForm(true)
  }

  function openEdit(commitment: PersonalCommitment) {
    setForm(commitment)
    setIsEditing(true)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSnack({ open: true, msg: 'Name is required.', type: 'error' })
      return
    }
    const result = await upsertPersonalCommitment(form)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save commitment.', type: 'error' })
      return
    }
    setCommitments(prev => {
      const exists = prev.some(c => c.id === form.id)
      return exists ? prev.map(c => (c.id === form.id ? form : c)) : [form, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Commitment saved.', type: 'success' })
  }

  async function confirmDelete() {
    const result = await deletePersonalCommitment(form.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete commitment.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_commitment_deleted',
        description: `Personal commitment "${form.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setCommitments(prev => prev.filter(c => c.id !== form.id))
    setShowForm(false)
    setSnack({ open: true, msg: 'Commitment deleted.', type: 'success' })
  }

  const sorted = [...commitments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Personal Commitments</h1>
          <button onClick={openCreate} aria-label="Add commitment"
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            <Plus size={19} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-xs text-slate-400">Insurance, utilities, subscriptions, EMIs, SIPs, and expected income.</p>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && sorted.map(c => (
          <button key={c.id} onClick={() => openEdit(c)}
            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <p className="font-bold text-sm text-slate-800">{c.name}</p>
                <p className="text-[11px] text-slate-400">{TYPE_LABEL[c.commitmentType]} · Due {fmtDate(c.dueDate)}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_TONE[c.status]}`}>{c.status}</span>
            </div>
            {c.expectedAmount != null && <p className="text-sm font-extrabold text-slate-800">{fmtCurrency(c.expectedAmount)}</p>}
          </button>
        ))}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No commitments yet.</p>
        )}
      </div>

      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? 'Edit Commitment' : 'New Commitment'} height="full">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Type</label>
            <select className={inp} value={form.commitmentType} onChange={e => setForm(f => ({ ...f, commitmentType: e.target.value as PersonalCommitmentType }))}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Health Insurance, Netflix" />
          </div>
          <div>
            <label className={label}>Expected Amount</label>
            <input type="number" className={inp} value={form.expectedAmount ?? ''} onChange={e => setForm(f => ({ ...f, expectedAmount: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label className={label}>Frequency</label>
            <select className={inp} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as PersonalCommitmentFrequency }))}>
              {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Due Date *</label>
            <input type="date" className={inp} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Linked Account</label>
            <select className={inp} value={form.linkedAccountId ?? ''} onChange={e => setForm(f => ({ ...f, linkedAccountId: e.target.value || undefined }))}>
              <option value="">None</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Provider</label>
            <input className={inp} value={form.provider ?? ''} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} />
          </div>

          {form.commitmentType === 'insurance' && (
            <>
              <div>
                <label className={label}>Policy Number</label>
                <input className={inp} value={form.policyNumber ?? ''} onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Sum Assured</label>
                <input type="number" className={inp} value={form.sumAssured ?? ''} onChange={e => setForm(f => ({ ...f, sumAssured: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div>
                <label className={label}>Insurer</label>
                <input className={inp} value={form.insurer ?? ''} onChange={e => setForm(f => ({ ...f, insurer: e.target.value }))} />
              </div>
            </>
          )}

          {form.commitmentType === 'utility' && (
            <>
              <div>
                <label className={label}>Consumer Number</label>
                <input className={inp} value={form.consumerNumber ?? ''} onChange={e => setForm(f => ({ ...f, consumerNumber: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Meter Number</label>
                <input className={inp} value={form.meterNumber ?? ''} onChange={e => setForm(f => ({ ...f, meterNumber: e.target.value }))} />
              </div>
            </>
          )}

          {form.commitmentType === 'subscription' && (
            <>
              <div>
                <label className={label}>Plan / Tier</label>
                <input className={inp} value={form.planTier ?? ''} onChange={e => setForm(f => ({ ...f, planTier: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.autoRenew ?? false} onChange={e => setForm(f => ({ ...f, autoRenew: e.target.checked }))} />
                Auto-renews
              </label>
            </>
          )}

          {form.commitmentType === 'emi' && (
            <>
              <div>
                <label className={label}>Loan Amount</label>
                <input type="number" className={inp} value={form.loanAmount ?? ''} onChange={e => setForm(f => ({ ...f, loanAmount: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div>
                <label className={label}>Tenure (Months)</label>
                <input type="number" className={inp} value={form.tenureMonths ?? ''} onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div>
                <label className={label}>Interest Rate (%)</label>
                <input type="number" className={inp} value={form.interestRate ?? ''} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </>
          )}

          {form.commitmentType === 'sip' && (
            <>
              <div>
                <label className={label}>Fund Name</label>
                <input className={inp} value={form.fundName ?? ''} onChange={e => setForm(f => ({ ...f, fundName: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Units</label>
                <input type="number" className={inp} value={form.units ?? ''} onChange={e => setForm(f => ({ ...f, units: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </>
          )}

          {form.commitmentType === 'expected_income' && (
            <>
              <div>
                <label className={label}>Income Source</label>
                <input className={inp} value={form.incomeSource ?? ''} onChange={e => setForm(f => ({ ...f, incomeSource: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Expected Date</label>
                <input type="date" className={inp} value={form.expectedDate ?? ''} min={todayStr()}
                  onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
              </div>
            </>
          )}

          <div>
            <label className={label}>Status</label>
            <select className={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PersonalCommitmentStatus }))}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Commitment
          </button>
          {isEditing && user?.role === 'owner' && (
            <button onClick={() => setShowDeleteDialog(true)}
              className="w-full text-center text-xs font-semibold text-red-500 py-2">
              Delete Commitment
            </button>
          )}
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Commitment"
        message="Are you sure you want to delete this commitment? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
