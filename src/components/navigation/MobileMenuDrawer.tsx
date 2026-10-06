import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getRoleDisplayLabel } from '../../data/permissions'
import { getMainItems, NAV_SECTIONS } from './navItems'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenuDrawer({ isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const fullPath = pathname + search
  const { user, can, logout } = useAuth()

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const sections = [{ label: 'Main', items: getMainItems() }, ...NAV_SECTIONS]

  function go(path: string) {
    navigate(path)
    onClose()
  }

  function handleLogout() {
    logout()
    onClose()
    navigate('/login', { replace: true })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      {/* Side panel */}
      <div className="app-chrome relative w-[78%] max-w-[300px] h-full bg-white shadow-sheet animate-slide-in-left flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Menu</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:bg-slate-200">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {sections.map(section => {
            const visible = section.items.filter(i => can(i.permission))
            if (visible.length === 0) return null
            return (
              <div key={section.label || 'operations'}>
                {section.label && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visible.map(({ icon: Icon, label, path }) => {
                    const active = path.includes('?')
                      ? fullPath === path
                      : pathname === path || pathname.startsWith(path)
                    return (
                      <button
                        key={path}
                        onClick={() => go(path)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-left transition-colors active:opacity-80
                          ${active ? 'text-white' : 'text-slate-600 active:bg-slate-100'}`}
                        style={active ? { background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' } : {}}
                      >
                        <Icon
                          size={18}
                          strokeWidth={active ? 2.5 : 1.8}
                          className={active ? 'text-white' : 'text-slate-400'}
                        />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* User profile / logout */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' }}
            >
              <span className="text-white text-xs font-extrabold">{user?.initials ?? '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{user?.name ?? 'Guest'}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {user ? getRoleDisplayLabel(user.role, user.displayRole) : ''}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 flex items-center justify-center rounded-lg active:bg-red-50 text-slate-400 active:text-red-500 transition-colors"
              aria-label="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
