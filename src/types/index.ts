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

// ─── Tasks ───────────────────────────────────────────────────────────────────
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked'

export interface Task {
  id: string
  projectId: string
  parentTaskId?: string
  assigneeId?: string
  assigneeName?: string
  title: string
  description?: string
  status: TaskStatus
  deadline?: string
  completedAt?: string
  lateReason?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TaskDependency {
  id: string
  projectId: string
  taskId: string
  dependsOnId: string
  createdAt: string
}

// ─── Design Center ───────────────────────────────────────────────────────────
export type DesignPackageStatus = 'in_progress' | 'client_review' | 'client_approved' | 'revision_requested'

export interface DesignPackage {
  id: string
  projectId: string
  name: string
  status: DesignPackageStatus
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface DesignVersion {
  id: string
  designPackageId: string
  versionNumber: number
  files: string[]
  note?: string
  createdBy: string
  createdAt: string
}

// ─── Daily Diary ─────────────────────────────────────────────────────────────
export interface DailyDiaryEntry {
  id: string
  projectId: string
  date: string
  workDone: string
  blockers?: string
  photos: string[]
  createdBy: string
  createdByName: string
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

// ─── Procurement ─────────────────────────────────────────────────────────────
export type VendorStatus = 'active' | 'inactive'

export interface Vendor {
  id: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  category?: string
  gstin?: string
  address?: string
  status: VendorStatus
  createdAt: string
  updatedAt: string
}

export type PurchaseRequestStatus = 'draft' | 'approved' | 'quoted' | 'po_raised' | 'received' | 'billed' | 'paid'

export interface PurchaseRequest {
  id: string
  projectId?: string
  description: string
  quantity: number
  unit: string
  neededBy?: string
  status: PurchaseRequestStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface VendorQuote {
  id: string
  purchaseRequestId: string
  vendorId: string
  amount: number
  notes?: string
  createdAt: string
}

export type PurchaseOrderStatus = 'issued' | 'received' | 'billed' | 'closed'

export interface PurchaseOrder {
  id: string
  purchaseRequestId?: string
  vendorId: string
  projectId?: string
  amount: number
  status: PurchaseOrderStatus
  issuedAt: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface GoodsReceipt {
  id: string
  purchaseOrderId: string
  receivedBy: string
  receivedAt: string
  notes?: string
  createdAt: string
}

export type VendorBillStatus = 'unpaid' | 'partial' | 'paid'

export interface VendorBill {
  id: string
  vendorId: string
  purchaseOrderId?: string
  billNumber: string
  amount: number
  paidAmount: number
  status: VendorBillStatus
  billDate: string
  createdAt: string
  updatedAt: string
}

// ─── Finance: Expenses ───────────────────────────────────────────────────────
export type ExpenseRequestStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'closed'

export interface ExpenseRequest {
  id: string
  projectId?: string
  category: string
  subcategory?: string
  purpose: string
  amount: number
  vendorPayee?: string
  neededBy?: string
  requestedBy: string
  requestedByName: string
  status: ExpenseRequestStatus
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  paidAmount?: number
  paidAt?: string
  paymentAccount?: string
  paymentRef?: string
  createdAt: string
  updatedAt: string
}

export type CompanyAccountType = 'bank' | 'cash' | 'upi'

export interface CompanyAccount {
  id: string
  name: string
  type: CompanyAccountType
  openingBalance: number
  createdAt: string
  updatedAt: string
}

export type CompanyTransactionType = 'credit' | 'debit'

export interface CompanyTransaction {
  id: string
  accountId: string
  type: CompanyTransactionType
  amount: number
  description: string
  reference?: string
  date: string
  createdAt: string
}

// Splits one CompanyTransaction across multiple projects instead of duplicating
// the transaction row (Finance Rule 3: one cash movement = one transaction).
export interface TransactionAllocation {
  id: string
  transactionId: string
  projectId?: string
  amount: number
  createdAt: string
}

// ─── Finance: Receivables & Payables ────────────────────────────────────────
export type PaymentMilestoneStatus = 'pending' | 'invoiced' | 'partial' | 'received' | 'overdue'

export interface PaymentMilestone {
  id: string
  projectId: string
  title: string
  amount: number
  dueDate?: string
  status: PaymentMilestoneStatus
  receivedAmount: number
  receivedDates: string[]
  invoiceRef?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Receipt {
  id: string
  projectId?: string
  milestoneId?: string
  amount: number
  receivedDate: string
  paymentAccount?: string
  reference?: string
  notes?: string
  createdAt: string
}

export type PayableStatus = 'pending' | 'partial' | 'paid'

export interface Payable {
  id: string
  vendorId?: string
  payeeName?: string
  description: string
  amount: number
  paidAmount: number
  dueDate?: string
  status: PayableStatus
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  payableId: string
  amount: number
  paidDate: string
  paymentAccount?: string
  reference?: string
  createdAt: string
}
