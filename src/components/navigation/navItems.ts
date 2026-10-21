import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Users, MapPin, FileText, Layers, FolderOpen, CheckSquare, GanttChartSquare, BookOpen,
  UserCog, Settings, History, LocateFixed, ListChecks, FileSearch, FileEdit, Wrench,
  LayoutDashboard, ShieldCheck,
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
    { icon: ShieldCheck, label: 'Approval', path: '/approval', permission: 'view_md_tasks' },
  ]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Site & Design',
    items: [
      { icon: Users,    label: 'Leads',        path: '/leads',        permission: 'view_leads'       },
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
    label: 'Admin',
    items: [
      { icon: UserCog,  label: 'User Management', path: '/settings/users', permission: 'manage_users' },
      { icon: LocateFixed, label: 'Attendance Settings', path: '/settings/attendance', permission: 'manage_settings' },
      { icon: Settings, label: 'Settings',        path: '/settings',       permission: 'view_home'    },
      { icon: History,  label: 'Audit Log',       path: '/audit-log',      permission: 'view_audit_log' },
    ],
  },
]
