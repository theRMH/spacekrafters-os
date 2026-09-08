import { useState, useEffect } from 'react'
import { Bell, LogOut, ChevronRight, Users, Pencil, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { loadManagedUsers, updateManagedUserProfile } from '../../utils/userStorage'
import { supabase } from '../../lib/supabase'
import { storeFile } from '../../utils/fileStorage'
import { getRoleDisplayLabel } from '../../data/permissions'
import { isPushSupported, getPushSubscriptionStatus, enablePushNotifications, disablePushNotifications } from '../../utils/pushNotifications'
import { Dialog } from '../../components/feedback/Dialog'
import { Snackbar } from '../../components/feedback/Snackbar'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { AppHeader } from '../../components/layout/AppHeader'
import { BackButton } from '../../components/layout/BackButton'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { user, logout, can, updateProfile } = useAuth()

  const [showLogout,     setShowLogout]     = useState(false)
  const [notifications,  setNotifications]  = useState(false)
  const [notifSupported, setNotifSupported] = useState(true)
  const [notifBusy,      setNotifBusy]      = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '' })

  useEffect(() => {
    if (!isPushSupported()) { setNotifSupported(false); return }
    if (!user) return
    getPushSubscriptionStatus(user.id).then(({ status, syncError }) => {
      setNotifications(status === 'subscribed')
      if (syncError) setSnack({ open: true, msg: `Notification sync failed: ${syncError}` })
    })
  }, [user])

  async function handleToggleNotifications() {
    if (!user || notifBusy) return
    setNotifBusy(true)
    try {
      if (notifications) {
        await disablePushNotifications()
        setNotifications(false)
      } else {
        const result = await enablePushNotifications(user.id)
        if (result.ok) {
          setNotifications(true)
        } else {
          setSnack({ open: true, msg: result.error ?? 'Could not enable notifications.' })
        }
      }
    } finally {
      setNotifBusy(false)
    }
  }

  // Profile edit state
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editName,        setEditName]        = useState('')
  const [editPass,        setEditPass]        = useState('')
  const [editPass2,       setEditPass2]       = useState('')
  const [editPhotoFile,   setEditPhotoFile]   = useState<File | null>(null)
  const [editPhotoUrl,    setEditPhotoUrl]    = useState('')
  const [editUploading,   setEditUploading]   = useState(false)
  const [editError,       setEditError]       = useState('')

  function openEditProfile() {
    setEditName(user?.name ?? '')
    setEditPass(''); setEditPass2('')
    setEditPhotoFile(null); setEditPhotoUrl('')
    setEditError('')
    setShowEditProfile(true)
  }

  async function handleSaveProfile() {
    setEditError('')
    if (!editName.trim()) { setEditError('Name cannot be empty.'); return }
    if (editPass && editPass !== editPass2) { setEditError('Passwords do not match.'); return }
    if (editPass && editPass.length < 6)    { setEditError('Password must be at least 6 characters.'); return }
    setEditUploading(true)
    try {
      let photoUrl: string | undefined
      if (editPhotoFile) {
        photoUrl = await storeFile(editPhotoFile)
      }
      const updates: { name?: string; photo?: string } = {}
      if (editName.trim() !== user?.name) updates.name = editName.trim()
      if (photoUrl) updates.photo = photoUrl

      updateProfile(updates)

      if (editPass && supabase) {
        const { error: pwError } = await supabase.auth.updateUser({ password: editPass })
        if (pwError) throw new Error(pwError.message)
      }

      if (user?.email && updates.name) {
        const managed = loadManagedUsers()
        const idx = managed.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase())
        if (idx !== -1) {
          updateManagedUserProfile({ ...managed[idx], fullName: updates.name, updatedAt: new Date().toISOString() })
        }
      }

      setShowEditProfile(false)
      setSnack({ open: true, msg: 'Profile updated!' })
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setEditUploading(false)
    }
  }

  function handleLogout() {
    setShowLogout(false)
    logout()
    navigate('/login', { replace: true })
  }

  const profilePhoto = user?.photo

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-5 pt-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-lg font-extrabold text-slate-800">Settings</h1>
        </div>
      </div>

      {/* Profile Card */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center gap-4">
          {profilePhoto ? (
            <img src={profilePhoto} alt="Profile" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' }}>
              <span className="text-lg font-extrabold text-white">{user?.initials ?? '?'}</span>
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-base font-extrabold text-slate-800">{user?.name ?? 'Guest'}</h2>
            <span className="inline-block mt-1 bg-[#EEF2F7] text-[#0F2A4A] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              {user ? getRoleDisplayLabel(user.role, user.displayRole) : ''}
            </span>
          </div>
          <button
            onClick={openEditProfile}
            className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center active:bg-slate-200 flex-shrink-0"
            aria-label="Edit Profile"
          >
            <Pencil size={15} className="text-slate-500" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* User Management */}
        {user && can('manage_users') && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">User Management</p>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <button
                onClick={() => navigate('/settings/users')}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 text-left"
              >
                <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700">Manage Users</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Create, edit and deactivate users</p>
                </div>
                <ChevronRight size={15} className="text-slate-300 flex-shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Preferences */}
        {notifSupported && (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">Preferences</p>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell size={16} className="text-[#0F2A4A]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700">Push Notifications</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Get notified when work is assigned to you</p>
                </div>
                <button
                  onClick={handleToggleNotifications}
                  disabled={notifBusy}
                  className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative disabled:opacity-60 ${notifications ? 'bg-[#0F2A4A]' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notifications ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Account */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">Account</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <button
              onClick={() => setShowLogout(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 text-left"
            >
              <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <LogOut size={16} className="text-red-500" />
              </div>
              <p className="text-sm font-semibold text-red-500">Log Out</p>
            </button>
          </div>
        </div>
      </div>

      <div className="text-center py-8 space-y-1">
        <p className="text-xs text-slate-400 font-medium">SpaceKrafters Operations</p>
        <p className="text-[10px] text-slate-300">v1.0.0</p>
      </div>

      {/* Profile Edit Sheet */}
      <BottomSheet isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} title="Edit Profile" height="auto">
        <div className="space-y-4 pb-4">
          {/* Photo upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              {editPhotoUrl ? (
                <img src={editPhotoUrl} alt="Preview" className="w-20 h-20 rounded-2xl object-cover" />
              ) : profilePhoto ? (
                <img src={profilePhoto} alt="Current photo" className="w-20 h-20 rounded-2xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' }}>
                  <span className="text-2xl font-extrabold text-white">{user?.initials ?? '?'}</span>
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/30 opacity-0 group-active:opacity-100 transition-opacity">
                <Camera size={20} className="text-white" />
              </div>
              <input
                type="file" accept="image/*" className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setEditPhotoFile(f)
                    const reader = new FileReader()
                    reader.onload = ev => setEditPhotoUrl(ev.target?.result as string)
                    reader.readAsDataURL(f)
                  }
                }}
              />
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Display Name</label>
            <input
              value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0F2A4A]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">New Password <span className="text-slate-300 font-normal">(optional)</span></label>
            <input
              type="password" value={editPass} onChange={e => setEditPass(e.target.value)}
              placeholder="Leave blank to keep current"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0F2A4A]"
            />
          </div>

          {editPass && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Confirm Password</label>
              <input
                type="password" value={editPass2} onChange={e => setEditPass2(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0F2A4A]"
              />
            </div>
          )}

          {editError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red-600">{editError}</p>
            </div>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={editUploading}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm disabled:opacity-60"
            style={{ background: '#C9A24B' }}
          >
            {editUploading ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={handleLogout}
        title="Log Out"
        message="Are you sure you want to log out of SpaceKrafters OS?"
        confirmLabel="Log Out"
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type="info" onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
