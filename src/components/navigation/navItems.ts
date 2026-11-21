import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Users, MapPin, FileText, Layers, FolderOpen, CheckSquare, GanttChartSquare, BookOpen,
  UserCog, Settings, History, LocateFixed, ListChecks, FileSearch, FileEdit, Wrench,
  LayoutDashboard, ShieldCheck, PhoneCall, ClipboardList, ShoppingBag, ShoppingCart, Store,
  Package, HardHat, Receipt, ArrowDownToLine, Landmark, Upload, BarChart3, Archive,
  CalendarCheck, CalendarOff, CalendarDays, Wallet, PieChart, Building2,
} from 'lucide-react'
import type { Permission } from '../../types'

export interface NavItem {
  icon: ComponentType<LucideProps>
  label: string
  path: string
  permission: Permission
  // Highlight only on this exact path (a parent path such as /settings must not light up for /settings/users).
  exact?: boolean
}

// Whether a menu item is the page being viewed. A path also matches its sub-pages (/projects/:id) but never a sibling
// that merely starts with the same letters (/vendors vs /vendors-labour).
export function isNavActive(item: Pick<NavItem, 'path' | 'exact'>, pathname: string): boolean {
  return item.exact ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`)
}

export function getMainItems(): NavItem[] {
  return [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: 'view_dashboard' },
    { icon: Wrench,          label: 'Task',      path: '/my-tasks',  permission: 'view_my_tasks' },
    { icon: ShieldCheck,     label: 'Approval',  path: '/approval',  permission: 'view_md_tasks' },
  ]
}

// Arranged in the order the business runs (PRD §4): lead → site → quotation → design → project → execution →
// procurement → money → team → documents → private finance → admin. Each item still only shows to roles that hold its
// permission, so every role sees just its own part of the flow.
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Sales & Site',
    items: [
      { icon: Users,         label: 'Leads',             path: '/leads',             permission: 'view_leads'              },
      { icon: PhoneCall,     label: 'Follow-ups',        path: '/follow-ups',        permission: 'view_activity'           },
      { icon: MapPin,        label: 'Site Visits',       path: '/site-visits',       permission: 'view_site_visits'        },
      { icon: FileSearch,    label: 'Site Visit Report', path: '/site-visit-report', permission: 'view_site_visit_reports' },
      { icon: ClipboardList, label: 'Requirements',      path: '/requirements',      permission: 'add_requirements'        },
      { icon: FileText,      label: 'Quotations',        path: '/quotations',        permission: 'view_quotations'         },
      { icon: Layers,        label: 'Design Center',     path: '/design',            permission: 'view_design'             },
      { icon: ShoppingBag,   label: 'Product Sales',     path: '/product-sales',     permission: 'view_product_sales'      },
    ],
  },
  {
    label: 'Projects',
    items: [
      { icon: FolderOpen,       label: 'Projects',    path: '/projects',      permission: 'view_projects' },
      { icon: Building2,        label: 'Clients',     path: '/clients',       permission: 'view_projects' },
      { icon: CheckSquare,      label: 'Tasks',       path: '/tasks',         permission: 'view_tasks' },
      { icon: GanttChartSquare, label: 'Gantt',       path: '/gantt',         permission: 'view_gantt' },
      { icon: BookOpen,         label: 'Daily Diary', path: '/daily-diary',   permission: 'view_tasks' },
      { icon: ListChecks,       label: 'Daily Task',  path: '/daily-tasks',   permission: 'view_daily_tasks' },
      { icon: FileEdit,         label: 'Daily Report',path: '/daily-reports', permission: 'view_daily_reports' },
      { icon: CalendarDays,     label: 'Weekly Planner', path: '/weekly-planner', permission: 'view_weekly_planner' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { icon: Package,      label: 'MRF',               path: '/mrf',            permission: 'view_mrf' },
      { icon: ShoppingCart, label: 'Procurement',       path: '/procurement',    permission: 'view_procurement' },
      { icon: Store,        label: 'Vendors',           path: '/vendors',        permission: 'view_procurement' },
      { icon: HardHat,      label: 'Vendors & Labour',  path: '/vendors-labour', permission: 'view_vendors_labour' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: ArrowDownToLine, label: 'Receivables',      path: '/receivables',      permission: 'view_receivables' },
      { icon: Receipt,         label: 'Payables',         path: '/payables',         permission: 'view_payables' },
      { icon: Wallet,          label: 'Expenses',         path: '/expenses',         permission: 'view_expenses' },
      { icon: Landmark,        label: 'Company Accounts', path: '/company-accounts', permission: 'view_company_finance' },
      { icon: Upload,          label: 'Statement Import', path: '/statement-import', permission: 'manage_company_accounts' },
      { icon: BarChart3,       label: 'Reports',          path: '/reports',          permission: 'view_reports' },
    ],
  },
  {
    label: 'Team & Files',
    items: [
      { icon: CalendarCheck, label: 'Attendance', path: '/attendance', permission: 'view_attendance' },
      { icon: CalendarOff,   label: 'Leave',      path: '/leave',      permission: 'view_leave' },
      { icon: Archive,       label: 'Files',      path: '/files',      permission: 'view_home' },
    ],
  },
  {
    label: 'Owner Finance',
    items: [
      { icon: Wallet,   label: 'Personal Finance', path: '/personal-finance', permission: 'view_personal_finance' },
      { icon: PieChart, label: 'Combined View',    path: '/combined-finance', permission: 'view_combined_finance' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { icon: UserCog,     label: 'User Management',     path: '/settings/users',      permission: 'manage_users' },
      { icon: LocateFixed, label: 'Attendance Settings', path: '/settings/attendance', permission: 'manage_settings' },
      { icon: Settings,    label: 'Settings',            path: '/settings',            permission: 'view_home', exact: true },
      { icon: History,     label: 'Audit Log',           path: '/audit-log',           permission: 'view_audit_log' },
    ],
  },
]
