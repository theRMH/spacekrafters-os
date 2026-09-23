import { useState } from 'react'
import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { MobileMenuDrawer } from '../navigation/MobileMenuDrawer'
import { NotificationBell } from './NotificationBell'

export function AppHeader() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const initials = user?.initials ?? '?'
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMenuOpen(true)}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl active:bg-slate-100 -ml-1.5"
          aria-label="Open menu"
        >
          <Menu size={22} className="text-slate-600" strokeWidth={1.8} />
        </button>
        <img
          src="/brand/spacekrafters-logo.png"
          alt="SpaceKrafters"
          className="lg:hidden object-contain"
          style={{ height: 28, maxWidth: 140 }}
        />
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' }}
        >
          <span className="text-white text-xs font-extrabold">{initials}</span>
        </button>
      </div>

      <MobileMenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
