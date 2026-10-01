import { useState } from 'react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { BUSINESS_BRAND_OPTIONS } from '../../data/businessDivisions'
import type { BusinessBrand, LeadSource } from '../../types'

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'walk_in',      label: 'Walk In'      },
  { value: 'referral',     label: 'Referral'     },
  { value: 'website',      label: 'Website'      },
  { value: 'social_media', label: 'Social Media' },
  { value: 'whatsapp',     label: 'WhatsApp'     },
  { value: 'other',        label: 'Other'        },
]

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: (msg: string) => void
}

// Minimal customer-enquiry intake for Product Sales — a deliberately smaller
// subset of LeadsScreen.tsx's new-lead form (no owner picker, no interest
// level, no site number) since an appliance enquiry needs far less than an
// Interior Projects lead. Still creates a real Lead row (leadCodePrefix:
// 'FGD', businessDivision: 'fgd') via the same useCRM().addLead() every other
// lead goes through, so it fully participates in the existing FGD lead-
// numbering sequence.
export function ProductSaleEnquiryForm({ isOpen, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const { addLead } = useCRM()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [brand, setBrand] = useState<BusinessBrand>('kitchenaid')
  const [source, setSource] = useState<LeadSource>('walk_in')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setName(''); setPhone(''); setEmail(''); setCity(''); setBrand('kitchenaid'); setSource('walk_in'); setNotes(''); setError('')
  }

  async function handleCreate() {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError('Name, phone, and city are required.')
      return
    }
    setSaving(true)
    const now = new Date()
    const result = await addLead({
      name: name.trim(), leadCodePrefix: 'FGD',
      phone: phone.trim(), email: email.trim() || undefined, city: city.trim(),
      businessDivision: 'fgd', businessBrand: brand,
      notes: notes.trim() || undefined,
      source, interest: 'medium',
      status: 'new', ownerId: user?.id, ownerName: user?.name ?? '',
      slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
    setSaving(false)
    if (!result.ok) { setError(result.error ?? 'Could not save enquiry.'); return }
    reset()
    onClose()
    onCreated('Enquiry added.')
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={() => { reset(); onClose() }} title="New Customer Enquiry">
      <div className="space-y-3">
        <div>
          <label className={label}>Customer Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="Full name" />
        </div>
        <div>
          <label className={label}>Phone *</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={inp} placeholder="10-digit number" />
        </div>
        <div>
          <label className={label}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="Optional" />
        </div>
        <div>
          <label className={label}>City *</label>
          <input value={city} onChange={e => setCity(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={label}>Brand</label>
          <SearchableSelect value={brand} onChange={v => setBrand(v as BusinessBrand)} options={BUSINESS_BRAND_OPTIONS} />
        </div>
        <div>
          <label className={label}>Source</label>
          <SearchableSelect value={source} onChange={v => setSource(v as LeadSource)} options={SOURCE_OPTIONS} />
        </div>
        <div>
          <label className={label}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inp} rows={2} placeholder="Optional" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button disabled={saving} onClick={handleCreate}
          className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
          Save Enquiry
        </button>
      </div>
    </BottomSheet>
  )
}
