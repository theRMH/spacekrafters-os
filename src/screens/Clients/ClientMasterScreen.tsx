import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllClients, upsertClient, deleteClient } from '../../services/clientService'
import { getAllProjects } from '../../services/projectService'
import { addAuditLog } from '../../services/auditLogService'
import type { Client, Project, AuditLog } from '../../types'

type Tab = 'profile' | 'projects'

const TABS: { value: Tab; label: string }[] = [
  { value: 'profile',  label: 'Profile'  },
  { value: 'projects', label: 'Projects' },
]

function emptyClient(): Client {
  const now = new Date().toISOString()
  return {
    id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    phone: '',
    createdAt: now,
    updatedAt: now,
  }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function ClientMasterScreen() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [tab, setTab] = useState<Tab>('profile')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Client>(emptyClient())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [c, p] = await Promise.all([getAllClients(), getAllProjects()])
      setClients(c)
      setProjects(p)
      setIsLoading(false)
    }
    load()
  }, [])

  function openCreate() {
    setForm(emptyClient())
    setShowForm(true)
  }

  function openDetail(client: Client) {
    setSelected(client)
    setTab('profile')
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      setSnack({ open: true, msg: 'Client name and phone are required.', type: 'error' })
      return
    }
    const isNew = !clients.some(c => c.id === form.id)
    const toSave: Client = { ...form, updatedAt: new Date().toISOString() }
    const result = await upsertClient(toSave)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save client.', type: 'error' })
      return
    }
    if (user) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: isNew ? 'client_created' : 'client_updated',
        description: `Client "${toSave.name}" ${isNew ? 'created' : 'updated'}.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setClients(prev => {
      const exists = prev.some(c => c.id === toSave.id)
      return exists ? prev.map(c => (c.id === toSave.id ? toSave : c)) : [toSave, ...prev]
    })
    setShowForm(false)
    setSnack({ open: true, msg: 'Client saved.', type: 'success' })
  }

  async function confirmDelete() {
    if (!selected) return
    const result = await deleteClient(selected.id)
    setShowDeleteDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete client.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'client_deleted',
        description: `Client "${selected.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setClients(prev => prev.filter(c => c.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Client deleted.', type: 'success' })
  }

  const filtered = clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  const selectedProjects = selected ? projects.filter(p => p.clientId === selected.id) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Clients</h1>
          <PermissionGate permission="view_projects">
            <button onClick={openCreate} aria-label="Add client"
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
              style={{ background: '#0F2A4A' }}>
              <Plus size={19} className="text-white" strokeWidth={2.5} />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(client => {
          const clientProjects = projects.filter(p => p.clientId === client.id)
          return (
            <button key={client.id} onClick={() => openDetail(client)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{client.name}</span>
              </div>
              <p className="text-xs text-slate-500">{client.phone}</p>
              <p className="text-[11px] text-slate-400 mt-1">{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}</p>
            </button>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No clients yet.</p>
        )}
      </div>

      {/* Create Client */}
      <BottomSheet isOpen={showForm} onClose={() => setShowForm(false)} title="New Client">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Client Name *</label>
            <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Phone *</label>
            <input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input className={inp} value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className={label}>City</label>
            <input className={inp} value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Address</label>
            <textarea className={inp} rows={2} value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea className={inp} rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Client
          </button>
        </div>
      </BottomSheet>

      {/* Client Detail */}
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
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-800">{selected.phone || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-800">{selected.email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">City</span><span className="font-semibold text-slate-800">{selected.city || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Address</span><span className="font-semibold text-slate-800 text-right">{selected.address || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Notes</span><span className="font-semibold text-slate-800 text-right">{selected.notes || '—'}</span></div>
                <PermissionGate permission="view_projects">
                  <button onClick={() => { setForm(selected); setSelected(null); setShowForm(true) }}
                    className="w-full mt-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold active:bg-slate-100">
                    Edit Client
                  </button>
                </PermissionGate>
                {user?.role === 'owner' && (
                  <button onClick={() => setShowDeleteDialog(true)}
                    className="w-full text-center text-xs font-semibold text-red-500 py-2">
                    Delete Client
                  </button>
                )}
              </div>
            )}

            {tab === 'projects' && (
              <div className="space-y-2">
                {selectedProjects.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No projects for this client yet.</p>
                ) : (
                  selectedProjects.map(p => (
                    <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full text-left bg-white rounded-xl p-3 border border-slate-100 active:bg-slate-50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-800">{p.name}</span>
                        <StatusBadge status={p.status} size="xs" />
                      </div>
                      <p className="text-[11px] text-slate-400">{p.stage.replace(/_/g, ' ')}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Client"
        message="Are you sure you want to delete this client? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
