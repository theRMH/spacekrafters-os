import { useState, useEffect } from 'react'
import { Plus, X, Eye, EyeOff, Edit2, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BackButton } from '../../components/layout/BackButton'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { NoPermission } from '../../components/layout/NoPermission'
import type { ManagedUser, UserRole } from '../../types'
import { loadManagedUsers, saveManagedUsers } from '../../utils/userStorage'
import { getAllManagedUsers, syncManagedUserAuth, deleteManagedUser } from '../../services/userService'
import { addAuditLog } from '../../services/auditLogService'
import { isSupabaseConfigured } from '../../lib/supabase'
import { syntheticEmailFromMobile } from '../../utils/authIdentity'
import { ROLE_LABELS, getRoleDisplayLabel } from '../../data/permissions'
import type { AuditLog } from '../../types'

type Tab = 'all' | 'active' | 'inactive'

interface FormState {
  fullName: string
  mobile: string
  email: string
  password: string
  role: UserRole | ''
  displayTitle: string
  department: string
  status: 'active' | 'inactive'
  notes: string
}

const EMPTY_FORM: FormState = {
  fullName: '', mobile: '', email: '', password: '',
  role: '', displayTitle: '', department: '', status: 'active', notes: '',
}

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[]

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-[#0F2A4A] transition-colors'
const lbl = 'text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block'

export default function UserManagementScreen() {
  const { user: authUser, can } = useAuth()

  const [users,      setUsers]      = useState<ManagedUser[]>([])
  const [tab,        setTab]        = useState<Tab>('all')
  const [showForm,   setShowForm]   = useState(false)
  const [editUser,   setEditUser]   = useState<ManagedUser | null>(null)
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM)
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormState, string>>>({})
  const [showPass,   setShowPass]   = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [snack,      setSnack]      = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null)

  useEffect(() => {
    setUsers(loadManagedUsers())
    if (isSupabaseConfigured) {
      setSyncing(true)
      getAllManagedUsers()
        .then(remote => { if (remote.length > 0) { setUsers(remote); saveManagedUsers(remote) } })
        .catch(() => setSnack({ open: true, msg: 'Cloud sync failed. Using local data.', type: 'error' }))
        .finally(() => setSyncing(false))
    }
  }, [])

  if (!can('manage_users')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <NoPermission />
      </div>
    )
  }

  function handleRefresh() {
    if (!isSupabaseConfigured) { setUsers(loadManagedUsers()); return }
    setSyncing(true)
    getAllManagedUsers()
      .then(remote => {
        if (remote.length > 0) { setUsers(remote); saveManagedUsers(remote) }
        setSnack({ open: true, msg: 'Users synced from cloud.', type: 'success' })
      })
      .catch(() => setSnack({ open: true, msg: 'Cloud sync failed. Using local data.', type: 'error' }))
      .finally(() => setSyncing(false))
  }

  const filtered = users.filter(u => tab === 'all' ? true : u.status === tab)

  function openAdd() {
    setEditUser(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setShowPass(false)
    setShowForm(true)
  }

  function openEdit(u: ManagedUser) {
    setEditUser(u)
    setForm({
      fullName:     u.fullName,
      mobile:       u.mobile,
      email:        u.email,
      password:     u.password,
      role:         u.role,
      displayTitle: u.displayRole !== ROLE_LABELS[u.role] ? u.displayRole : '',
      department:   u.department ?? '',
      status:       u.status,
      notes:        u.notes ?? '',
    })
    setErrors({})
    setShowPass(false)
    setShowForm(true)
  }

  function isMobileTaken(mobile: string, excludeId?: string): boolean {
    const norm = mobile.replace(/\D/g, '')
    return users.some(u => u.mobile.replace(/\D/g, '') === norm && u.id !== excludeId)
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.fullName.trim()) errs.fullName = 'Full Name is required'
    if (!form.mobile.trim())   errs.mobile   = 'Mobile Number is required'
    if (!form.password.trim()) errs.password = 'Password is required'
    if (!form.role)            errs.role     = 'Select a role'
    if (form.mobile.trim() && isMobileTaken(form.mobile.trim(), editUser?.id)) {
      errs.mobile = 'This mobile number is already used for login by another account'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    const now = new Date().toISOString()
    const role = form.role as UserRole
    const displayRole = form.displayTitle.trim() || ROLE_LABELS[role]
    let updated: ManagedUser[]

    const credentialsChanged = !editUser
      || editUser.mobile !== form.mobile.trim()
      || editUser.password !== form.password.trim()
    const syncTargetId = editUser?.id ?? `managed_${Date.now()}`

    if (editUser) {
      updated = users.map(u =>
        u.id === editUser.id
          ? {
              ...u,
              fullName:   form.fullName.trim(),
              mobile:     form.mobile.trim(),
              email:      form.email.trim().toLowerCase() || syntheticEmailFromMobile(form.mobile.trim()),
              password:   form.password.trim(),
              role,
              displayRole,
              department: form.department.trim() || undefined,
              status:     form.status,
              notes:      form.notes.trim() || undefined,
              updatedAt:  now,
            }
          : u
      )
    } else {
      const newUser: ManagedUser = {
        id:            syncTargetId,
        fullName:      form.fullName.trim(),
        mobile:        form.mobile.trim(),
        email:         form.email.trim().toLowerCase() || syntheticEmailFromMobile(form.mobile.trim()),
        password:      form.password.trim(),
        role,
        displayRole,
        department:    form.department.trim() || undefined,
        status:        form.status,
        notes:         form.notes.trim() || undefined,
        createdBy:     authUser?.name ?? 'System',
        createdByRole: authUser?.role ?? 'owner',
        createdAt:     now,
        updatedAt:     now,
      }
      updated = [...users, newUser]
    }

    saveManagedUsers(updated)
    setUsers(updated)
    setShowForm(false)

    const successMsg = editUser ? 'User updated successfully' : 'User created successfully'
    if (credentialsChanged) {
      const result = await syncManagedUserAuth(syncTargetId, form.mobile.trim(), form.password.trim())
      if (!result.ok) {
        setSnack({
          open: true,
          msg: `${successMsg}, but login sync failed (${result.error ?? 'unknown error'}) — they may not be able to log in yet.`,
          type: 'error',
        })
        return
      }
    }
    setSnack({ open: true, msg: successMsg, type: 'success' })
  }

  function toggleStatus(u: ManagedUser) {
    const now = new Date().toISOString()
    const newStatus = (u.status === 'active' ? 'inactive' : 'active') as ManagedUser['status']
    const updated = users.map(x =>
      x.id === u.id ? { ...x, status: newStatus, updatedAt: now } : x
    )
    saveManagedUsers(updated)
    setUsers(updated)
    if (authUser) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: newStatus === 'active' ? 'user_activated' : 'user_deactivated',
        description: `User "${u.fullName}" ${newStatus === 'active' ? 'activated' : 'deactivated'}.`,
        createdBy: authUser.name,
        createdByRole: authUser.role,
        createdAt: now,
      }
      addAuditLog(log)
    }
    setSnack({ open: true, msg: u.status === 'active' ? 'User deactivated' : 'User activated', type: 'success' })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteManagedUser(target.id)
    if (!result.ok) {
      setSnack({ open: true, msg: `Delete failed: ${result.error ?? 'unknown error'}`, type: 'error' })
      return
    }
    const updated = users.filter(x => x.id !== target.id)
    saveManagedUsers(updated)
    setUsers(updated)
    if (authUser) {
      const log: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'user_deleted',
        description: `User "${target.fullName}" deleted.`,
        createdBy: authUser.name,
        createdByRole: authUser.role,
        createdAt: new Date().toISOString(),
      }
      addAuditLog(log)
    }
    setSnack({ open: true, msg: 'User deleted', type: 'success' })
  }

  function field(key: keyof FormState) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BackButton />
            <div>
              <h1 className="text-base font-extrabold text-slate-800">User Management</h1>
              <p className="text-xs text-slate-500">{users.length} total users</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSupabaseConfigured && (
              <button
                onClick={handleRefresh}
                className={`w-8 h-8 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center active:bg-slate-200 ${syncing ? 'opacity-50' : ''}`}
                disabled={syncing}
                title="Sync from cloud"
              >
                <RefreshCw size={13} className={`text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-xl active:opacity-90"
              style={{ background: '#0F2A4A' }}
            >
              <Plus size={14} /> Add User
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors"
              style={tab === t ? { background: '#0F2A4A', color: 'white' } : { background: '#F1F5F9', color: '#64748B' }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3.5 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="mt-14 text-center">
            <p className="text-sm font-semibold text-slate-500">No users found</p>
            <p className="text-xs text-slate-400 mt-1">
              {tab === 'all' ? 'Tap "Add User" to create the first user.' : `No ${tab} users.`}
            </p>
          </div>
        ) : (
          filtered.map(u => {
            const initials = u.fullName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
            return (
              <div key={u.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EEF2F7' }}>
                    <span className="text-sm font-extrabold" style={{ color: '#0F2A4A' }}>{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-800 truncate">{u.fullName}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{u.mobile}</p>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {u.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full truncate" style={{ background: '#EEF2F7', color: '#0F2A4A' }}>
                      {getRoleDisplayLabel(u.role, u.displayRole)}
                    </span>
                    {u.department && (
                      <span className="text-[10px] text-slate-400 truncate">{u.department}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      className="w-7 h-7 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center active:bg-slate-100"
                    >
                      <Edit2 size={12} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => toggleStatus(u)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg active:opacity-80 transition-colors ${
                        u.status === 'active' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {u.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    {u.id !== authUser?.id && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="w-7 h-7 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center active:bg-red-100"
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-slate-300 mt-2">
                  Added {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' '}by {u.createdBy}
                </p>
              </div>
            )
          })
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-extrabold text-slate-800">
                {editUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center active:bg-slate-200"
              >
                <X size={16} className="text-slate-600" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div>
                <label className={lbl}>Full Name <span className="text-red-500">*</span></label>
                <input {...field('fullName')} className={`${inp} ${errors.fullName ? 'border-red-300' : ''}`} placeholder="e.g. Rajan Kumar" />
                {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={lbl + ' mb-0'}>Mobile Number (Login) <span className="text-red-500">*</span></label>
                  {editUser && (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Editable</span>
                  )}
                </div>
                <input
                  {...field('mobile')}
                  type="tel" inputMode="numeric"
                  className={`${inp} ${errors.mobile ? 'border-red-300' : ''}`}
                  placeholder="e.g. 9876543210"
                />
                {errors.mobile
                  ? <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>
                  : editUser && <p className="text-[11px] text-slate-400 mt-1">Changing this will update the login phone number (+91).</p>
                }
              </div>

              <div>
                <label className={lbl}>Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    type={showPass ? 'text' : 'password'}
                    className={`${inp} pr-10 ${errors.password ? 'border-red-300' : ''}`}
                    placeholder="Set a login password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-600"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className={lbl}>Role <span className="text-red-500">*</span></label>
                <div className="space-y-1.5">
                  {ROLE_OPTIONS.map(r => {
                    const selected = form.role === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, role: r }))}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-colors"
                        style={selected ? { background: '#EEF2F7', borderColor: '#0F2A4A' } : { background: '#F8FAFC', borderColor: '#E2E8F0' }}
                      >
                        <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center" style={{ borderColor: selected ? '#0F2A4A' : '#CBD5E1' }}>
                          {selected && <div className="w-2 h-2 rounded-full" style={{ background: '#0F2A4A' }} />}
                        </div>
                        <span className={`text-sm flex-1 ${selected ? 'font-semibold' : 'text-slate-600'}`} style={selected ? { color: '#0F2A4A' } : {}}>
                          {ROLE_LABELS[r]}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role}</p>}
              </div>

              <div>
                <label className={lbl}>Display Title <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
                <input {...field('displayTitle')} className={inp}
                  placeholder={form.role ? ROLE_LABELS[form.role as UserRole] : 'e.g. MD, Junior Architect, Site Supervisor'} />
                <p className="text-[11px] text-slate-400 mt-1">
                  What's shown for this person around the app (their real job title). Leave blank to just use the Role label above — the Role itself still controls what they can access.
                </p>
              </div>

              <div>
                <label className={lbl}>Status <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {(['active', 'inactive'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize border transition-colors ${
                        form.status === s
                          ? s === 'active'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                            : 'bg-red-50 border-red-300 text-red-600'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={lbl}>Department <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
                <input {...field('department')} className={inp} placeholder="e.g. Sales, Production" />
              </div>

              <div>
                <label className={lbl}>Notes <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
                <textarea {...field('notes')} rows={2} className={`${inp} resize-none`} placeholder="Any notes about this user…" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={handleSave}
                className="w-full py-3.5 text-white text-sm font-extrabold rounded-2xl active:opacity-90"
                style={{ background: '#0F2A4A' }}
              >
                {editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isSupabaseConfigured && (
        <div className="mx-4 mb-4 mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <p className="text-[11px] text-amber-700 font-semibold">Cross-device sync requires Supabase configuration.</p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            Users are saved locally on this device only. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud sync.
          </p>
        </div>
      )}

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        message={`This permanently deletes ${deleteTarget?.fullName ?? 'this user'} and revokes their login. This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
