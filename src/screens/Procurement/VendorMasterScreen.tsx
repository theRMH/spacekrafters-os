import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllVendors, upsertVendor } from '../../services/vendorService'
import { getAllVendorQuotes, getAllPurchaseOrders, getAllVendorBills } from '../../services/procurementService'
import type { Vendor, VendorQuote, PurchaseOrder, VendorBill } from '../../types'

type Tab = 'profile' | 'quotes' | 'pos' | 'bills'

const TABS: { value: Tab; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'quotes',  label: 'Quotes' },
  { value: 'pos',     label: 'POs' },
  { value: 'bills',   label: 'Bills' },
]

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

function emptyVendor(): Vendor {
  const now = new Date().toISOString()
  return {
    id: `vendor_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function VendorMasterScreen() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [quotes, setQuotes] = useState<VendorQuote[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [bills, setBills] = useState<VendorBill[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Vendor | null>(null)
  const [tab, setTab] = useState<Tab>('profile')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Vendor>(emptyVendor())
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [v, q, p, b] = await Promise.all([
        getAllVendors(), getAllVendorQuotes(), getAllPurchaseOrders(), getAllVendorBills(),
      ])
      setVendors(v)
      setQuotes(q)
      setPos(p)
      setBills(b)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyVendor())
    setShowForm(true)
  }

  function openDetail(vendor: Vendor) {
    setSelected(vendor)
    setTab('profile')
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSnack({ open: true, msg: 'Vendor name is required.', type: 'error' })
      return
    }
    const toSave: Vendor = { ...form, updatedAt: new Date().toISOString() }
    const result = await upsertVendor(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save vendor.', type: 'error' })
      return
    }
    setVendors(prev => {
      const exists = prev.some(v => v.id === toSave.id)
      return exists ? prev.map(v => (v.id === toSave.id ? toSave : v)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Vendor saved.', type: 'success' })
  }

  const filtered = vendors.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()))

  const selectedQuotes = selected ? quotes.filter(q => q.vendorId === selected.id) : []
  const selectedPOs    = selected ? pos.filter(p => p.vendorId === selected.id) : []
  const selectedBills  = selected ? bills.filter(b => b.vendorId === selected.id) : []
  const outstanding    = selectedBills.reduce((sum, b) => sum + (b.amount - b.paidAmount), 0)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Vendors</h1>
          <PermissionGate permission="view_procurement">
            <button onClick={openCreate} aria-label="Add vendor"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search vendors…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(vendor => {
          const vendorBills = bills.filter(b => b.vendorId === vendor.id)
          const vendorOutstanding = vendorBills.reduce((sum, b) => sum + (b.amount - b.paidAmount), 0)
          return (
            <button key={vendor.id} onClick={() => openDetail(vendor)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{vendor.name}</span>
                <StatusBadge status={vendor.status} />
              </div>
              <p className="text-xs text-slate-500">{vendor.category || 'No category'}</p>
              {vendorOutstanding > 0 && (
                <p className="text-xs font-semibold text-red-600 mt-1">Outstanding: {fmtCurrency(vendorOutstanding)}</p>
              )}
            </button>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No vendors yet.</p>
        )}
      </div>

      {/* Create Vendor */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Vendor">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Vendor Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Category</label>
            <input className={inp} value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Hardware, Plywood, Electricals" />
          </div>
          <div>
            <label className={label}>Contact Person</label>
            <input className={inp} value={form.contactPerson ?? ''} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Phone</label>
              <input className={inp} value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={inp} value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={label}>GSTIN</label>
            <input className={inp} value={form.gstin ?? ''} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Address</label>
            <textarea className={inp} rows={2} value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Vendor
          </button>
        </div>
      </BottomSheet>

      {/* Vendor Detail */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {TABS.map(t => (
                <button key={t.value} onClick={() => setTab(t.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t.value ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'profile' && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge status={selected.status} /></div>
                <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="font-semibold text-slate-800">{selected.category || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Contact</span><span className="font-semibold text-slate-800">{selected.contactPerson || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-800">{selected.phone || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-800">{selected.email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">GSTIN</span><span className="font-semibold text-slate-800">{selected.gstin || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Outstanding</span><span className="font-semibold text-red-600">{fmtCurrency(outstanding)}</span></div>
                <PermissionGate permission="view_procurement">
                  <button onClick={() => { setForm(selected); setSelected(null); setShowForm(true) }}
                    className="w-full mt-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold active:bg-slate-100">
                    Edit Vendor
                  </button>
                </PermissionGate>
              </div>
            )}

            {tab === 'quotes' && (
              <div className="space-y-2">
                {selectedQuotes.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No quotes from this vendor yet.</p>
                ) : (
                  selectedQuotes.map(q => (
                    <div key={q.id} className="bg-white rounded-xl p-3 border border-slate-100 flex justify-between items-center">
                      <span className="text-xs text-slate-600">{fmtDate(q.createdAt)}</span>
                      <span className="text-sm font-bold text-slate-800">{fmtCurrency(q.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'pos' && (
              <div className="space-y-2">
                {selectedPOs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No purchase orders for this vendor yet.</p>
                ) : (
                  selectedPOs.map(po => (
                    <div key={po.id} className="bg-white rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <StatusBadge status={po.status} />
                        <span className="text-sm font-bold text-slate-800">{fmtCurrency(po.amount)}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Issued {fmtDate(po.issuedAt)}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'bills' && (
              <div className="space-y-2">
                {selectedBills.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No bills from this vendor yet.</p>
                ) : (
                  selectedBills.map(bill => (
                    <div key={bill.id} className="bg-white rounded-xl p-3 border border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-slate-700">{bill.billNumber}</span>
                        <StatusBadge status={bill.status} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{fmtDate(bill.billDate)}</span>
                        <span className="font-semibold text-slate-700">{fmtCurrency(bill.paidAmount)} / {fmtCurrency(bill.amount)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
