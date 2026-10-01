import type { UserRole, Permission } from '../types'

const OWNER_PERMS: Permission[] = [
  'view_home', 'view_dashboard',
  'view_leads', 'add_lead', 'edit_lead', 'delete_lead', 'convert_lead', 'view_activity',
  'view_appointments', 'add_appointment', 'edit_appointment',
  'view_site_visits', 'add_site_visit', 'edit_site_visit', 'add_requirements', 'view_site_visit_reports',
  'view_quotations', 'create_quotation', 'approve_quotation_internal', 'send_quotation_client',
  'view_design', 'upload_design', 'approve_design', 'request_revision',
  'view_projects', 'create_project', 'edit_project', 'delete_project', 'approve_project_stage',
  'view_tasks', 'add_task', 'edit_task', 'complete_task', 'add_subtask',
  'view_gantt', 'edit_deadline',
  'view_procurement', 'raise_purchase_request', 'approve_purchase_request', 'create_po', 'receive_goods', 'enter_vendor_bill',
  'view_mrf', 'create_mrf', 'submit_mrf', 'set_mrf_dates', 'approve_mrf', 'release_mrf_payment',
  'view_vendors_labour', 'manage_vendors_labour',
  'view_daily_reports', 'create_daily_report', 'approve_daily_report_edit',
  'view_expenses', 'raise_expense_request', 'approve_expense', 'record_payment',
  'view_company_finance', 'manage_company_accounts', 'view_receivables', 'record_receipt', 'view_payables', 'reconcile',
  'view_attendance', 'mark_attendance', 'view_leave', 'approve_leave', 'view_weekly_planner',
  'view_daily_tasks', 'assign_daily_task',
  'view_md_tasks', 'delete_uploaded_file',
  'view_reports', 'view_financial_reports',
  'manage_users', 'manage_permissions', 'manage_settings', 'view_audit_log',
  'view_personal_finance', 'view_combined_finance',
  'view_product_sales', 'create_product_sale', 'approve_product_sale_stage',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: OWNER_PERMS,

  accounts: [
    'view_home', 'view_my_tasks',
    'view_leads',
    'view_mrf', 'release_mrf_payment',
    'view_expenses', 'approve_expense', 'record_payment',
    'view_company_finance', 'manage_company_accounts', 'view_receivables', 'record_receipt', 'view_payables', 'reconcile',
    'view_vendors_labour',
    'view_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
    'view_reports', 'view_financial_reports',
    'view_product_sales',
  ],

  project_coordinator: [
    'view_home', 'view_my_tasks',
    'view_leads', 'add_lead', 'edit_lead', 'convert_lead', 'view_activity',
    'view_appointments', 'add_appointment', 'edit_appointment',
    'view_site_visits', 'add_site_visit', 'edit_site_visit', 'add_requirements',
    'view_quotations', 'create_quotation',
    'view_design',
    'view_projects', 'create_project', 'edit_project',
    'view_tasks', 'add_task', 'edit_task', 'complete_task', 'add_subtask',
    'view_gantt', 'edit_deadline',
    'view_mrf', 'create_mrf', 'approve_mrf',
    'view_vendors_labour', 'manage_vendors_labour',
    'view_daily_reports', 'approve_daily_report_edit',
    'raise_expense_request',
    'view_attendance', 'mark_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
    'view_reports', 'delete_uploaded_file',
    'view_product_sales', 'create_product_sale',
  ],

  site_engineer: [
    'view_home', 'view_my_tasks',
    'view_leads',
    'view_site_visits', 'add_site_visit', 'edit_site_visit', 'add_requirements',
    'view_tasks', 'complete_task',
    'view_gantt',
    'view_vendors_labour',
    'view_daily_reports', 'create_daily_report',
    'raise_expense_request',
    'view_attendance', 'mark_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
  ],

  designer: [
    'view_home', 'view_my_tasks',
    'view_leads',
    'view_design', 'upload_design', 'request_revision',
    'view_tasks', 'complete_task',
    'view_mrf', 'approve_mrf',
    'view_vendors_labour',
    'approve_daily_report_edit',
    'view_attendance', 'mark_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
  ],

  qs: [
    'view_home', 'view_my_tasks',
    'view_quotations', 'create_quotation',
    'view_projects',
    'view_procurement',
    'view_mrf', 'submit_mrf', 'approve_mrf',
    'view_vendors_labour',
    'view_daily_reports',
    'view_attendance', 'mark_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
    'view_reports',
  ],

  purchase: [
    'view_home', 'view_my_tasks',
    'view_procurement', 'raise_purchase_request', 'create_po', 'receive_goods', 'enter_vendor_bill',
    'view_mrf', 'set_mrf_dates',
    'view_attendance', 'mark_attendance', 'view_leave', 'view_weekly_planner', 'view_daily_tasks',
    'view_product_sales',
  ],

  admin: [
    'view_home', 'view_my_tasks',
    'view_attendance', 'mark_attendance', 'view_leave', 'approve_leave', 'view_weekly_planner', 'view_daily_tasks',
    'manage_users', 'manage_permissions', 'manage_settings',
  ],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner:                'Owner',
  accounts:             'Accounts',
  project_coordinator:  'Project Coordinator',
  site_engineer:        'Site Engineer',
  designer:             'Designer',
  qs:                   'Quantity Surveyor',
  purchase:             'Purchase',
  admin:                'Admin',
}

export function getRoleDisplayLabel(role: UserRole, displayRole?: string): string {
  return displayRole ?? ROLE_LABELS[role]
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner:                'Full access, personal finance, and combined financial view',
  accounts:             'Company finance, payables, receivables, reconciliation',
  project_coordinator:  'Projects, tasks, CRM, site visits, expense requests',
  site_engineer:        'Site visits, tasks, daily diary, expense requests',
  designer:             'Design center and assigned tasks',
  qs:                   'BOQ, cost plan, quantity and cost control',
  purchase:             'Procurement, vendors, purchase orders, vendor bills',
  admin:                'Owner-configured module access',
}

export const SCREEN_PERMISSIONS: Record<string, Permission> = {
  home:              'view_home',
  dashboard:         'view_dashboard',
  'my-tasks':        'view_my_tasks',
  'my-tasks/project':'view_my_tasks',
  leads:             'view_leads',
  appointments:      'view_appointments',
  'follow-ups':      'view_activity',
  'site-visits':     'view_site_visits',
  'site-visit-report': 'view_site_visit_reports',
  requirements:      'add_requirements',
  quotations:        'view_quotations',
  design:            'view_design',
  projects:          'view_projects',
  clients:           'view_projects',
  // Deliberately looser than the 'projects' list/clients screens above — this
  // gates the single-project workspace route only. Everyone who currently
  // has view_projects (owner, project_coordinator) also has view_tasks, so
  // this changes nothing for them; it additionally lets site_engineer/
  // designer (view_tasks but not view_projects) open a project far enough to
  // reach tasks assigned to them, without exposing the project list/clients
  // screens. ProjectWorkspaceScreen hides Finance/BOQ/Procurement for those
  // two roles specifically (see FIELD_ROLES there) so this doesn't leak
  // contract value/budget/margin data to them either.
  'project-workspace': 'view_tasks',
  tasks:             'view_tasks',
  gantt:             'view_gantt',
  'daily-diary':     'view_tasks',
  procurement:       'view_procurement',
  vendors:           'view_procurement',
  mrf:               'view_mrf',
  'vendors-labour':  'view_vendors_labour',
  'daily-reports':   'view_daily_reports',
  expenses:          'view_expenses',
  'company-accounts':'view_company_finance',
  receivables:       'view_receivables',
  payables:          'view_payables',
  'statement-import':'manage_company_accounts',
  reports:           'view_reports',
  files:             'view_home',
  attendance:        'view_attendance',
  leave:             'view_leave',
  'weekly-planner':  'view_weekly_planner',
  'daily-tasks':     'view_daily_tasks',
  'md-tasks':        'view_md_tasks',
  approval:          'view_md_tasks',
  'personal-finance':'view_personal_finance',
  'personal-categories':'view_personal_finance',
  'personal-commitments':'view_personal_finance',
  'personal-investments':'view_personal_finance',
  'personal-plans':  'view_personal_finance',
  'personal-reports':'view_personal_finance',
  'personal-calendar':'view_personal_finance',
  'combined-finance':'view_combined_finance',
  'settings/users':  'manage_users',
  'settings/attendance': 'manage_settings',
  'audit-log':       'view_audit_log',
  'product-sales':         'view_product_sales',
  'product-sales/project': 'view_product_sales',
}
