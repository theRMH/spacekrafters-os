import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Users, Calendar, ClipboardList, MapPin, FileText, Layers,
  FolderOpen, CheckSquare, GanttChartSquare, BookOpen, ShoppingCart,
  Truck, Wallet, Landmark, Receipt, CreditCard, BarChart2, ClipboardCheck,
  CalendarOff, UserCog, File, Settings, UploadCloud, History,
  PiggyBank, Tags, BellRing, TrendingUp, PieChart, CalendarDays, Scale, LineChart,
  CalendarClock, LocateFixed, ListChecks, FileSearch, Hammer, FileEdit, Wrench, ShieldCheck,
  LayoutDashboard, Package,
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
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: 'view_dashboard' },
    { icon: Wrench,     label: 'Task',     path: '/my-tasks', permission: 'view_my_tasks' },
    { icon: FolderOpen, label: 'Projects', path: '/projects', permission: 'view_projects' },
    { icon: Users,      label: 'Clients',  path: '/clients',  permission: 'view_projects' },
  ]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'CRM',
    items: [
      { icon: Users,         label: 'Leads',        path: '/leads',        permission: 'view_leads'        },
      { icon: Calendar,      label: 'Appointments', path: '/appointments', permission: 'view_appointments' },
      { icon: ClipboardList, label: 'Follow-ups',   path: '/follow-ups',   permission: 'view_activity'     },
      { icon: ShieldCheck,   label: 'Approval',     path: '/approval',    permission: 'view_md_tasks'     },
    ],
  },
  {
    label: 'Product Sales',
    items: [
      { icon: Package, label: 'Product Sales', path: '/product-sales', permission: 'view_product_sales' },
    ],
  },
  {
    label: 'Site & Design',
    items: [
      { icon: MapPin,    label: 'Site Visits',  path: '/site-visits',  permission: 'view_site_visits' },
      { icon: FileSearch, label: 'Site Visit Report', path: '/site-visit-report', permission: 'view_site_visit_reports' },
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
      { icon: ListChecks,         label: 'Daily Task',  path: '/daily-tasks', permission: 'view_daily_tasks' },
      { icon: FileEdit,           label: 'Daily Report',path: '/daily-reports', permission: 'view_daily_reports' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { icon: ShoppingCart, label: 'Procurement', path: '/procurement', permission: 'view_procurement' },
      { icon: Truck,        label: 'Vendors',     path: '/vendors',     permission: 'view_procurement' },
      { icon: FileSearch,   label: 'MRF',         path: '/mrf',         permission: 'view_mrf' },
      { icon: Hammer,       label: 'Vendors / Labour', path: '/vendors-labour', permission: 'view_vendors_labour' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: Wallet,    label: 'Expenses',        path: '/expenses',         permission: 'view_expenses'        },
      { icon: Landmark,  label: 'Company Accounts', path: '/company-accounts', permission: 'view_company_finance' },
      { icon: Receipt,   label: 'Receivables',     path: '/receivables',      permission: 'view_receivables'     },
      { icon: CreditCard,label: 'Payables',        path: '/payables',         permission: 'view_payables'        },
      { icon: UploadCloud,label: 'Statement Import',path: '/statement-import',permission: 'manage_company_accounts' },
    ],
  },
  {
    label: 'Personal Finance',
    items: [
      { icon: PiggyBank,     label: 'Personal Finance',     path: '/personal-finance',     permission: 'view_personal_finance' },
      { icon: Tags,          label: 'Personal Categories',  path: '/personal-categories',  permission: 'view_personal_finance' },
      { icon: BellRing,      label: 'Personal Commitments', path: '/personal-commitments', permission: 'view_personal_finance' },
      { icon: LineChart,     label: 'Personal Investments', path: '/personal-investments', permission: 'view_personal_finance' },
      { icon: TrendingUp,    label: 'Personal Plans',       path: '/personal-plans',       permission: 'view_personal_finance' },
      { icon: PieChart,      label: 'Personal Reports',     path: '/personal-reports',     permission: 'view_personal_finance' },
      { icon: CalendarDays,  label: 'Personal Calendar',    path: '/personal-calendar',    permission: 'view_personal_finance' },
      { icon: Scale,         label: 'Combined Finance',     path: '/combined-finance',     permission: 'view_combined_finance' },
    ],
  },
  {
    label: 'HR',
    items: [
      { icon: ClipboardCheck, label: 'Attendance',     path: '/attendance',      permission: 'view_attendance'      },
      { icon: CalendarOff,    label: 'Leave',          path: '/leave',           permission: 'view_leave'           },
      { icon: CalendarClock,  label: 'Weekly Planner', path: '/weekly-planner',  permission: 'view_weekly_planner'  },
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
      { icon: LocateFixed, label: 'Attendance Settings', path: '/settings/attendance', permission: 'manage_settings' },
      { icon: Settings, label: 'Settings',        path: '/settings',       permission: 'view_home'    },
      { icon: History,  label: 'Audit Log',       path: '/audit-log',      permission: 'view_audit_log' },
    ],
  },
]
