import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Home, Users, Calendar, ClipboardList, MapPin, FileText, Layers,
  FolderOpen, CheckSquare, GanttChartSquare, BookOpen, ShoppingCart,
  Truck, Wallet, Landmark, Receipt, CreditCard, BarChart2, ClipboardCheck,
  CalendarOff, UserCog, File, Settings,
} from 'lucide-react'
import type { Permission } from '../../types'

export interface NavItem {
  icon: ComponentType<LucideProps>
  label: string
  path: string
  permission: Permission
}

export function getMainItems(): NavItem[] {
  return [
    { icon: Home,       label: 'Home',     path: '/home',     permission: 'view_home'     },
    { icon: FolderOpen, label: 'Projects', path: '/projects', permission: 'view_projects' },
  ]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'CRM',
    items: [
      { icon: Users,         label: 'Leads',        path: '/leads',        permission: 'view_leads'        },
      { icon: Calendar,      label: 'Appointments', path: '/appointments', permission: 'view_appointments' },
      { icon: ClipboardList, label: 'Follow-ups',   path: '/follow-ups',   permission: 'view_activity'     },
    ],
  },
  {
    label: 'Site & Design',
    items: [
      { icon: MapPin,    label: 'Site Visits',  path: '/site-visits',  permission: 'view_site_visits' },
      { icon: FileText,  label: 'Quotations',   path: '/quotations',   permission: 'view_quotations'  },
      { icon: Layers,    label: 'Design Center', path: '/design',      permission: 'view_design'      },
    ],
  },
  {
    label: 'Projects & Tasks',
    items: [
      { icon: CheckSquare,        label: 'Tasks',       path: '/tasks',       permission: 'view_tasks' },
      { icon: GanttChartSquare,   label: 'Gantt',       path: '/gantt',       permission: 'view_gantt' },
      { icon: BookOpen,           label: 'Daily Diary', path: '/daily-diary', permission: 'view_tasks' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { icon: ShoppingCart, label: 'Procurement', path: '/procurement', permission: 'view_procurement' },
      { icon: Truck,        label: 'Vendors',     path: '/vendors',     permission: 'view_procurement' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: Wallet,    label: 'Expenses',        path: '/expenses',         permission: 'view_expenses'        },
      { icon: Landmark,  label: 'Company Accounts', path: '/company-accounts', permission: 'view_company_finance' },
      { icon: Receipt,   label: 'Receivables',     path: '/receivables',      permission: 'view_receivables'     },
      { icon: CreditCard,label: 'Payables',        path: '/payables',         permission: 'view_payables'        },
    ],
  },
  {
    label: 'HR',
    items: [
      { icon: ClipboardCheck, label: 'Attendance', path: '/attendance', permission: 'view_attendance' },
      { icon: CalendarOff,    label: 'Leave',      path: '/leave',      permission: 'view_leave'      },
    ],
  },
  {
    label: '',
    items: [
      { icon: BarChart2, label: 'Reports', path: '/reports', permission: 'view_reports' },
      { icon: File,      label: 'Files',   path: '/files',   permission: 'view_home'    },
    ],
  },
  {
    label: 'Admin',
    items: [
      { icon: UserCog,  label: 'User Management', path: '/settings/users', permission: 'manage_users' },
      { icon: Settings, label: 'Settings',        path: '/settings',       permission: 'view_home'    },
    ],
  },
]
