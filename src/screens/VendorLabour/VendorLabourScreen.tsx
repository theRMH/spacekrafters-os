import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllVendorLabour, upsertVendorLabour, deleteVendorLabour } from '../../services/vendorLabourService'
import type { VendorLabourEntry } from '../../types'

export default function VendorLabourScreen() {
  const { user, can } = useAuth()
  const canManage = can('manage_vendors_labour')

  const [entries, setEntries] = useState<VendorLabourEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<VendorLabourEntry | null>(null)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [name, setName] = useState('')
  const [natureOfWork, setNatureOfWork] = useState('')
  const [number, setNumber] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    setIsLoading(true)
    setEntries(await getAllVendorLabour())
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function resetForm() {
    setName(''); setNatureOfWork(''); setNumber(''); setFormError('')
  }

  function openNew() {
    resetForm()
    setShowNew(true)
  }

  async function handleAdd() {
    if (!user) return
    if (!name.trim() || !natureOfWork.trim()) {
      setFormError('Name and nature of work are required.')
      return
    }
    const now = new Date().toISOString()
    const entry: VendorLabourEntry = {
      id: `vl_${Date.now()}`,
      name: name.trim(), natureOfWork: natureOfWork.trim(), number: number.trim(),
      createdBy: user.name, createdAt: now, updatedAt: now,
    }
    const result = await upsertVendorLabour(entry)
    if (!result.ok) { setFormError(result.error ?? 'Could not save entry.'); return }
    setEntries(prev => [entry, ...prev])
    setShowNew(false)
    setSnack({ open: true, msg: 'Added.', type: 'success' })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const result = await deleteVendorLabour(deleteTarget.id)
    const target = deleteTarget
    setDeleteTarget(null)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete entry.', type: 'error' }); return }
    setEntries(prev => prev.filter(e => e.id !== target.id))
    setSnack({ open: true, msg: 'Deleted.', type: 'success' })
  }

  const filtered = entries.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.natureOfWork.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Vendors / Labour</h1>
          <PermissionGate permission="manage_vendors_labour">
            <button onClick={openNew} aria-label="Add vendor or labour entry"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or nature of work…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(entry => (
          <div key={entry.id} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-slate-800">{entry.name}</span>
                <p className="text-xs text-slate-600 mt-0.5">{entry.natureOfWork}</p>
                {entry.number && <p className="text-[11px] text-slate-400 mt-1">No.: {entry.number}</p>}
              </div>
              {canManage && (
                <button onClick={() => setDeleteTarget(entry)} className="text-red-400 p-1.5 shrink-0">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">👷</p>
            <p className="text-sm">No vendors/labour listed yet</p>
          </div>
        )}
      </div>

      <BottomSheet isOpen={showNew} onClose={() => setShowNew(false)} title="New Vendor / Labour Entry">
        <div className="space-y-3">
          {formError && <p className="text-xs text-red-600 font-semibold">{formError}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Vendor / Labour Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Nature of Work *</label>
            <input value={natureOfWork} onChange={e => setNatureOfWork(e.target.value)}
              placeholder="e.g. Electrical, Masonry, Plumbing"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Number</label>
            <input value={number} onChange={e => setNumber(e.target.value)}
              placeholder="Phone, ID, or reference number"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <button onClick={handleAdd} className="w-full text-white rounded-xl py-3.5 text-sm font-bold active:opacity-90" style={{ background: '#C9A24B' }}>
            Add Entry
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Entry"
        message={`Remove "${deleteTarget?.name ?? ''}" from the list? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
