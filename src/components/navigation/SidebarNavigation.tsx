import { LogOut } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getRoleDisplayLabel } from '../../data/permissions'
import { getMainItems, NAV_SECTIONS } from './navItems'

export function SidebarNavigation() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const fullPath = pathname + search
  const { user, can, logout } = useAuth()
  const sections = [{ label: 'Main', items: getMainItems() }, ...NAV_SECTIONS]

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-chrome hidden lg:flex fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-slate-200 flex-col z-40">
      {/* Logo */}
      <div className="px-5 h-16 flex items-center border-b border-slate-100 flex-shrink-0">
        <img
          src="/brand/spacekrafters-logo.png"
          alt="SpaceKrafters"
          className="object-contain"
          style={{ height: 30, maxWidth: 180 }}
        />
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {sections.map(section => {
          const visible = section.items.filter(i => can(i.permission))
          if (visible.length === 0) return null
          return (
            <div key={section.label || 'operations'}>
              {section.label && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
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
                      onClick={() => navigate(path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors active:opacity-80
                        ${active ? 'text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
                      style={active ? { background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' } : {}}
                    >
                      <Icon
                        size={17}
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
      </nav>

      {/* User profile */}
      <div className="px-4 py-4 border-t border-slate-100 flex-shrink-0">
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
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
