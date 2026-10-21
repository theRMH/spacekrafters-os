import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Users, MapPin, FileText, FolderOpen, Wrench, LayoutDashboard, ShieldCheck,
  ClipboardCheck, CalendarOff, File, BarChart2, Settings,
} from 'lucide-react'
import type { Permission } from '../../types'

export interface NavItem {
  icon: ComponentType<LucideProps>
  label: string
  path: string
  permission: Permission
}

// One flat MAIN list, then REPORTING. Pages that are not listed here (Gantt, Daily Diary,
// Procurement, Finance, Admin pages, ...) still exist and are reached through links.
export function getMainItems(): NavItem[] {
  return [
    { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard',   permission: 'view_dashboard' },
    { icon: FolderOpen,      label: 'Projects',   path: '/projects',    permission: 'view_projects' },
    { icon: Users,           label: 'Leads',      path: '/leads',       permission: 'view_leads' },
    { icon: MapPin,          label: 'Site Visits', path: '/site-visits', permission: 'view_site_visits' },
    { icon: FileText,        label: 'Quotations', path: '/quotations',  permission: 'view_quotations' },
    { icon: ShieldCheck,     label: 'Approval',   path: '/approval',    permission: 'view_md_tasks' },
    { icon: Wrench,          label: 'Task',       path: '/my-tasks',    permission: 'view_my_tasks' },
    { icon: ClipboardCheck,  label: 'Attendance', path: '/attendance',  permission: 'view_attendance' },
    { icon: CalendarOff,     label: 'Leave',      path: '/leave',       permission: 'view_leave' },
    { icon: File,            label: 'Files',      path: '/files',       permission: 'view_home' },
  ]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Reporting',
    items: [
      { icon: BarChart2, label: 'Reports',  path: '/reports',  permission: 'view_reports' },
      { icon: Settings,  label: 'Settings', path: '/settings', permission: 'view_home' },
    ],
  },
]
