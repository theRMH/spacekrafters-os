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
  | 'view_attendance' | 'mark_attendance' | 'view_leave' | 'approve_leave' | 'view_weekly_planner'
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
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'site_visit_scheduled'
  | 'site_visit_done'
  | 'requirements_captured'
  | 'quotation_drafted'
  | 'internally_approved'
  | 'design_in_progress'
  | 'design_approved'
  | 'sent_to_client'
  | 'negotiating'
  | 'client_approved'
  | 'won'
  | 'lost'
export type LeadSource = 'referral' | 'walk_in' | 'website' | 'social_media' | 'cold_call' | 'exhibition' | 'other'
export type LeadInterest = 'hot' | 'medium' | 'cold'
export type BusinessDivision = 'fgd' | 'first_property_contractors' | 'sk_constructions' | 'sk_turnkey_interiors'
export type BusinessCategory = 'residential' | 'commercial' | 'industrial'

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
  businessDivision?: BusinessDivision
  businessCategory?: BusinessCategory
  requirement?: string
  notes?: string
  source: LeadSource
  interest: LeadInterest
  status: LeadStatus
  ownerId?: string
  ownerName: string
  assignedRole?: UserRole
  assignedToId?: string
  assignedToName?: string
  // SLA: first-contact deadline from creation — used to flag overdue leads
  // that haven't moved past 'new' yet.
  slaDueAt: string
  lostReason?: string
  advancePaymentAmount?: number
  advancePaymentRef?: string
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
  lengthFt?: string
  widthFt?: string
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
  appointmentId?: string
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
  files?: string[]
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
  | 'advance_payment'
  | 'execution'
  | 'procurement'
  | 'handover_prep'
  | 'final_payment'
  | 'reconciliation'
  | 'closed'

export interface Client {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface StatusHistoryItem {
  stage: string
  note?: string
  files?: string[]
  updatedBy: string
  updatedRole: UserRole
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  leadId?: string
  quotationId?: string
  clientId?: string
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
  handoverSignedAt?: string
  handoverSignedBy?: string
  assignedRole?: UserRole
  assignedToId?: string
  assignedToName?: string
  statusHistory?: StatusHistoryItem[]
  createdAt: string
  updatedAt: string
}

export type PunchListItemStatus = 'open' | 'resolved' | 'verified'

export interface PunchListItem {
  id: string
  projectId: string
  description: string
  location?: string
  status: PunchListItemStatus
  photos?: string[]
  raisedBy: string
  raisedByName: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

// ─── Tasks ───────────────────────────────────────────────────────────────────
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'awaiting_material'

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
  projectId?: string
  leadId?: string
  quotationId?: string
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

// ─── Project Documents ───────────────────────────────────────────────────────
export interface ProjectDocument {
  id: string
  projectId?: string
  name: string
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ProjectDocumentVersion {
  id: string
  documentId: string
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

export type AttendanceStatus = 'present' | 'absent' | 'half_day'

export interface AttendanceRecord {
  id: string
  userId: string
  userName: string
  date: string
  status: AttendanceStatus
  startTime?: string  // ISO timestamp — set by the Start (clock-in) button, self-only
  endTime?: string    // ISO timestamp — set by the End (clock-out) button, self-only
  reason?: string     // required when status is 'absent' — collected via a confirmation dialog
  markedBy: string
  createdAt: string
  updatedAt: string
}

// One row per person per day — team-wide visible (see sks_weekly_plans RLS),
// each person only creates/edits their own.
export interface WeeklyPlanEntry {
  id: string
  userId: string
  userName: string
  date: string
  activity: string
  notes?: string
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
  documentFiles?: string[]
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
  receiptFiles?: string[]
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
  paymentProofFiles?: string[]
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

// Orthogonal to `type` (cash direction): flags a transaction as a transfer between
// accounts or owner funding movement so reports can distinguish it from real income/expense.
export type CompanyTransactionCategory = 'transfer' | 'owner_funding'

export interface CompanyTransaction {
  id: string
  accountId: string
  type: CompanyTransactionType
  category?: CompanyTransactionCategory
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
  vendorBillId?: string
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

// ─── Audit Log ───────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string
  projectId?: string
  action: string
  description: string
  createdBy: string
  createdByRole: UserRole
  createdAt: string
}

// ─── Personal Finance (Owner-only) ──────────────────────────────────────────
// Model ported from spacekrafter-personal-finance-tracker. Everything here is
// personal by definition — no personal_or_office tagging (company finance
// lives entirely in the sks_company_* / sks_purchase_* tables instead).
export type PersonalAccountType = 'bank' | 'credit_card' | 'upi_wallet' | 'cash' | 'loan'

export interface PersonalAccount {
  id: string
  name: string
  type: PersonalAccountType
  openingBalance: number
  active: boolean
  createdAt: string
}

export interface PersonalCategory {
  id: string
  groupName: string
  name: string
  code: string
  createdAt: string
}

export interface PersonalSubcategory {
  id: string
  categoryId: string
  name: string
  createdAt: string
}

export type PersonalTransactionType =
  | 'income' | 'expense' | 'transfer' | 'investment'
  | 'advance_received' | 'advance_paid' | 'loan_received' | 'loan_paid'

export type PersonalTransactionStatus = 'pending' | 'cleared' | 'reconciled'

export interface PersonalTransaction {
  id: string
  accountId: string
  date: string
  amount: number
  type: PersonalTransactionType
  categoryId?: string
  subcategoryId?: string
  payeePayer?: string
  reference?: string
  narration?: string
  source: 'manual' | 'imported'
  transferPairId?: string
  status: PersonalTransactionStatus
  createdAt: string
}

export type PersonalCommitmentType = 'insurance' | 'utility' | 'subscription' | 'emi' | 'sip' | 'expected_income' | 'other'
export type PersonalCommitmentFrequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'annual' | 'custom'
export type PersonalCommitmentStatus = 'upcoming' | 'due' | 'overdue' | 'paid' | 'paused' | 'cancelled' | 'expired'

export interface PersonalCommitment {
  id: string
  commitmentType: PersonalCommitmentType
  name: string
  expectedAmount?: number
  frequency: PersonalCommitmentFrequency
  dueDate: string
  linkedAccountId?: string
  provider?: string
  status: PersonalCommitmentStatus
  linkedTransactionId?: string
  createdAt: string
  // insurance
  policyNumber?: string
  sumAssured?: number
  insurer?: string
  // utility
  consumerNumber?: string
  meterNumber?: string
  // subscription
  planTier?: string
  autoRenew?: boolean
  // emi
  loanAmount?: number
  tenureMonths?: number
  interestRate?: number
  // sip
  fundName?: string
  units?: number
  // expected_income
  incomeSource?: string
  expectedDate?: string
}

export type PersonalPlanType = 'personal_income' | 'business_income' | 'home_expense' | 'office_expense' | 'investment'

export interface PersonalPlan {
  id: string
  financialYear: number
  month: number
  planType: PersonalPlanType
  projectedAmount: number
  createdAt: string
}

export type PersonalInvestmentType = 'mutual_fund' | 'stock' | 'fd' | 'ppf' | 'real_estate' | 'gold' | 'other'

export interface PersonalInvestment {
  id: string
  investmentType: PersonalInvestmentType
  name: string
  investedAmount: number
  currentValue?: number
  units?: number
  purchaseDate: string
  linkedAccountId?: string
  notes?: string
  createdAt: string
}
