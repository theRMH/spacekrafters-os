export type UserRole =
  | 'owner'
  | 'accounts'
  | 'project_coordinator'
  | 'site_engineer'
  | 'designer'
  | 'qs'
  | 'purchase'
  | 'admin'

export type Permission =
  // CRM
  | 'view_leads' | 'add_lead' | 'edit_lead' | 'delete_lead' | 'convert_lead' | 'view_activity'
  // Appointments
  | 'view_appointments' | 'add_appointment' | 'edit_appointment'
  // Site
  | 'view_site_visits' | 'add_site_visit' | 'edit_site_visit' | 'add_requirements'
  // Quotations
  | 'view_quotations' | 'create_quotation' | 'approve_quotation_internal' | 'send_quotation_client'
  // Design
  | 'view_design' | 'upload_design' | 'approve_design' | 'request_revision'
  // Projects
  | 'view_projects' | 'create_project' | 'edit_project' | 'delete_project'
  // Tasks
  | 'view_tasks' | 'add_task' | 'edit_task' | 'complete_task' | 'add_subtask'
  // Gantt
  | 'view_gantt' | 'edit_deadline'
  // Procurement
  | 'view_procurement' | 'raise_purchase_request' | 'approve_purchase_request' | 'create_po' | 'receive_goods' | 'enter_vendor_bill'
  // Expenses
  | 'view_expenses' | 'raise_expense_request' | 'approve_expense' | 'record_payment'
  // Finance
  | 'view_company_finance' | 'manage_company_accounts' | 'view_receivables' | 'record_receipt' | 'view_payables' | 'reconcile'
  // HR
  | 'view_attendance' | 'mark_attendance' | 'view_leave' | 'approve_leave'
  // Reports
  | 'view_reports' | 'view_financial_reports'
  // Admin
  | 'manage_users' | 'manage_permissions' | 'manage_settings' | 'view_audit_log'
  // Owner-only
  | 'view_personal_finance' | 'view_combined_finance'
  // Base
  | 'view_home'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
  initials: string
  email: string
  displayRole?: string
  roles?: UserRole[]
  photo?: string
}

export interface ManagedUser {
  id: string
  fullName: string
  mobile: string
  email: string
  password: string
  role: UserRole
  displayRole: string
  roles?: UserRole[]
  displayRoles?: string[]
  department?: string
  status: 'active' | 'inactive'
  notes?: string
  createdBy: string
  createdByRole: string
  createdAt: string
  updatedAt: string
  photo?: string
}

// ─── CRM & Field Operations ──────────────────────────────────────────────────
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'site_visit_scheduled' | 'requirements_captured' | 'won' | 'lost'
export type LeadSource = 'referral' | 'walk_in' | 'website' | 'social_media' | 'cold_call' | 'exhibition' | 'other'
export type LeadInterest = 'hot' | 'medium' | 'cold'

export interface LeadActivityItem {
  id: string
  label: string
  note?: string
  updatedBy: string
  updatedAt: string
}

export interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  city: string
  requirement?: string
  notes?: string
  source: LeadSource
  interest: LeadInterest
  status: LeadStatus
  ownerId?: string
  ownerName: string
  // SLA: first-contact deadline from creation — used to flag overdue leads
  // that haven't moved past 'new' yet.
  slaDueAt: string
  lostReason?: string
  activity: LeadActivityItem[]
  createdAt: string
  updatedAt: string
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'rescheduled' | 'cancelled'

export interface Appointment {
  id: string
  leadId: string
  clientName: string
  scheduledAt: string
  location: string
  coordinatorId?: string
  coordinatorName: string
  status: AppointmentStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export type FollowUpStatus = 'pending' | 'done' | 'overdue'

export interface FollowUp {
  id: string
  leadId: string
  dueDate: string
  ownerId?: string
  ownerName: string
  status: FollowUpStatus
  outcomeNote?: string
  createdAt: string
  updatedAt: string
}

export interface SiteVisitRoom {
  id: string
  name: string
  measurements?: string
  notes?: string
  photos?: string[]
}

export interface SiteVisitChecklistItem {
  id: string
  label: string
  checked: boolean
}

export interface SiteVisit {
  id: string
  leadId: string
  projectId?: string
  visitDate: string
  rooms: SiteVisitRoom[]
  checklist: SiteVisitChecklistItem[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RequirementLineItem {
  id: string
  roomName: string
  description: string
  unit: string
  quantity: number
}

export interface Requirement {
  id: string
  siteVisitId: string
  projectId?: string
  lineItems: RequirementLineItem[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export type QuotationStatus =
  | 'draft'
  | 'internal_review'
  | 'internally_approved'
  | 'sent_to_client'
  | 'revision_requested'
  | 'client_approved'
  | 'rejected'

export interface BOQLineItem {
  id: string
  description: string
  unit: string
  quantity: number
  rate: number
  amount: number
  taxPercent?: number
  notes?: string
}

export interface BOQSection {
  id: string
  title: string
  items: BOQLineItem[]
}

export interface Quotation {
  id: string
  leadId: string
  requirementId?: string
  projectId?: string
  version: number
  status: QuotationStatus
  sections: BOQSection[]
  totalAmount: number
  taxAmount: number
  discountAmount: number
  netAmount: number
  terms?: string
  paymentTerms?: string
  sentAt?: string
  approvedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ProjectStage =
  | 'lead_converted'
  | 'site_visit'
  | 'requirements'
  | 'boq_preparation'
  | 'internal_approval'
  | 'design'
  | 'client_approval'
  | 'advance_payment'
  | 'execution'
  | 'procurement'
  | 'handover_prep'
  | 'final_payment'
  | 'reconciliation'
  | 'closed'

export interface Project {
  id: string
  name: string
  leadId?: string
  quotationId?: string
  coordinatorId: string
  clientName: string
  clientPhone: string
  coordinatorName: string
  stage: ProjectStage
  contractValue?: number
  internalBudget?: number
  advanceReceived?: number
  designStatus?: 'pending' | 'in_progress' | 'client_approved'
  status: 'active' | 'on_hold' | 'closed' | 'cancelled'
  startDate?: string
  expectedHandoverDate?: string
  createdAt: string
  updatedAt: string
}

// ─── HR: Leave & Attendance ────────────────────────────────────────────────
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveApplication {
  id: string
  userId: string
  userName: string
  fromDate: string
  toDate: string
  reason: string
  status: LeaveStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave'

export interface AttendanceRecord {
  id: string
  userId: string
  userName: string
  date: string
  status: AttendanceStatus
  markedBy: string
  createdAt: string
  updatedAt: string
}
