'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { UserRole } from '@/types'
import { logout } from '@/app/actions/auth'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['owner', 'sales', 'site_engineer', 'cold_call_leader', 'production_admin', 'production_manager'] },
  { href: '/leads', label: 'Leads', icon: '🎯', roles: ['owner', 'sales', 'cold_call_leader'] },
  { href: '/projects', label: 'Projects', icon: '📁', roles: ['owner', 'sales', 'site_engineer', 'production_admin', 'production_manager'] },
  { href: '/site-visits', label: 'Site Visits', icon: '🏗️', roles: ['owner', 'sales', 'site_engineer'] },
  { href: '/quotations', label: 'Quotations', icon: '📄', roles: ['owner', 'sales'] },
  { href: '/production', label: 'Production', icon: '🏭', roles: ['owner', 'production_admin', 'production_manager'] },
  { href: '/payments', label: 'Payments', icon: '💰', roles: ['owner', 'sales'] },
  { href: '/installation', label: 'Installation', icon: '🔧', roles: ['owner', 'sales', 'site_engineer'] },
  { href: '/reports', label: 'Reports', icon: '📈', roles: ['owner'] },
  { href: '/import', label: 'Import', icon: '📥', roles: ['owner', 'production_admin'] },
  { href: '/users', label: 'Users', icon: '👥', roles: ['owner'] },
]

interface SidebarProps {
  role: UserRole
  fullName: string
  email: string
}

export default function Sidebar({ role, fullName, email }: SidebarProps) {
  const pathname = usePathname()
  const visibleItems = navItems.filter(item => item.roles.includes(role))

  return (
    <aside className="w-64 flex flex-col min-h-screen text-white" style={{ backgroundColor: '#1a2236' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: '#2d3c5e' }}>
        <Image src="/logo.webp" alt="Spacekrafters" width={140} height={44} className="object-contain" priority />
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition"
              style={isActive
                ? { backgroundColor: '#2d3c5e', color: '#ffffff' }
                : { color: '#94a3b8' }
              }
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = '#243050'; (e.currentTarget as HTMLElement).style.color = '#ffffff' } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94a3b8' } }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t" style={{ borderColor: '#2d3c5e' }}>
        <div className="mb-3">
          <p className="text-sm font-medium text-white truncate">{fullName || email}</p>
          <p className="text-xs capitalize" style={{ color: '#64748b' }}>{role.replace(/_/g, ' ')}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="w-full text-left px-3 py-2 rounded-lg text-sm transition"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#243050'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}>
            🚪 Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
