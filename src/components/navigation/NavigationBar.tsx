import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { Home, Users, MapPin, CheckSquare, ShoppingCart, Wallet, Settings } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDefaultRoute } from '../../utils/permissions'
import type { Permission, UserRole } from '../../types'

interface NavItem { icon: ComponentType<LucideProps>; label: string; path: string; permission: Permission }

const ALL_ITEMS: NavItem[] = [
  { icon: Users,        label: 'Leads',       path: '/leads',       permission: 'view_leads'        },
  { icon: MapPin,       label: 'Site Visits', path: '/site-visits', permission: 'view_site_visits'  },
  { icon: CheckSquare,  label: 'Tasks',       path: '/tasks',       permission: 'view_tasks'         },
  { icon: ShoppingCart, label: 'Procurement', path: '/procurement', permission: 'view_procurement'   },
  { icon: Wallet,       label: 'Finance',     path: '/company-accounts', permission: 'view_company_finance' },
  { icon: Settings,     label: 'Settings',    path: '/settings',    permission: 'view_home'          },
]

const ROLE_PATHS: Record<UserRole, string[]> = {
  owner:               ['/leads', '/tasks', '/company-accounts', '/settings'],
  accounts:            ['/company-accounts', '/settings'],
  project_coordinator: ['/leads', '/site-visits', '/tasks', '/settings'],
  site_engineer:       ['/site-visits', '/tasks', '/settings'],
  designer:            ['/tasks', '/settings'],
  qs:                  ['/tasks', '/settings'],
  purchase:            ['/procurement', '/settings'],
  admin:               ['/settings'],
}

export function NavigationBar() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const { user, can } = useAuth()

  // First tab is always the user's own real landing page (same route
  // login/the catch-all route send them to) rather than a separate, mostly
  // empty "Home" screen.
  const homeItem: NavItem = { icon: Home, label: 'Home', path: user ? getDefaultRoute(user.role) : '/login', permission: 'view_home' }
  const allowed = user ? ROLE_PATHS[user.role] ?? ['/settings'] : ['/settings']
  const items = [homeItem, ...allowed.map(path => ALL_ITEMS.find(i => i.path === path)).filter((i): i is NavItem => Boolean(i))]
    .filter(i => can(i.permission))
    .slice(0, 5)

  return (
    <nav
      aria-label="Bottom navigation"
      className="app-chrome lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-slate-200 shadow-nav z-40 safe-bottom"
    >
      <div className="flex items-center px-1">
        {items.map(({ icon: Icon, label, path }) => {
          const active = pathname === path || pathname.startsWith(path)
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-0.5 min-h-[56px] justify-center active:opacity-70"
            >
              <div
                className="w-11 h-8 flex items-center justify-center rounded-xl transition-colors duration-150"
                style={active ? { background: 'linear-gradient(135deg, #0F2A4A, #0A1D33)' } : {}}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.5 : 1.8}
                  className={active ? 'text-white' : 'text-slate-400'}
                  aria-hidden="true"
                />
              </div>
              <span
                className={`text-[10px] font-semibold ${active ? '' : 'text-slate-400'}`}
                style={active ? { color: '#0F2A4A' } : {}}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
