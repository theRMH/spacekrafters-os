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
  // Site Visit report — MD/authorized-only rollup of every submitted site visit
  | 'view_site_visit_reports'
  // Quotations — approve_quotation_pc is the new QS->PC step ahead of the
  // existing MD step (approve_quotation_internal)
  | 'view_quotations' | 'create_quotation' | 'approve_quotation_pc' | 'approve_quotation_internal' | 'send_quotation_client'
  // Design — approve_design_pc mirrors approve_quotation_pc above
  | 'view_design' | 'upload_design' | 'approve_design_pc' | 'approve_design' | 'request_revision'
  // Projects
  | 'view_projects' | 'create_project' | 'edit_project' | 'delete_project'
  // MD-only: approving a project's stage-advance request (Project Status Sheet)
  | 'approve_project_stage'
  // Tasks
  | 'view_tasks' | 'add_task' | 'edit_task' | 'complete_task' | 'add_subtask'
  // Gantt
  | 'view_gantt' | 'edit_deadline'
  // Procurement
  | 'view_procurement' | 'raise_purchase_request' | 'approve_purchase_request' | 'create_po' | 'receive_goods' | 'enter_vendor_bill'
  // MRF (Material Request Form) — Project raises, QS drafts details/notes/dates
  // + submits for approval, Project Coordinator approves/rejects, Procurement
  // receives it, Accounts releases payment. 'set_mrf_dates' now also gates
  // Procurement's own execution status updates after the MRF reaches them.
  | 'view_mrf' | 'create_mrf' | 'submit_mrf' | 'set_mrf_dates' | 'approve_mrf' | 'release_mrf_payment'
  // Vendors / Labour listing — simple roster, separate from the full Vendor master
  | 'view_vendors_labour' | 'manage_vendors_labour'
  // Site Engineer Daily Report — locked once submitted; editing requires LO approval
  | 'view_daily_reports' | 'create_daily_report' | 'approve_daily_report_edit'
  // Expenses
  | 'view_expenses' | 'raise_expense_request' | 'approve_expense' | 'record_payment'
  // Finance
  | 'view_company_finance' | 'manage_company_accounts' | 'view_receivables' | 'record_receipt' | 'view_payables' | 'reconcile'
  // HR
  | 'view_attendance' | 'mark_attendance' | 'view_leave' | 'approve_leave' | 'view_weekly_planner'
  // Daily Tasks — everyone can see their own; only MD (owner) can assign
  | 'view_daily_tasks' | 'assign_daily_task'
  // Delete an already-saved uploaded file (anyone can still remove a file they
  // just added in the form they're currently filling in, before submitting)
  | 'delete_uploaded_file'
  // MD Task tab — owner-only inbox of pending approvals (currently just
  // rescheduled-appointment requests; same shape can hold future task types)
  | 'view_md_tasks'
  // Reports
  | 'view_reports' | 'view_financial_reports'
  // Admin
  | 'manage_users' | 'manage_permissions' | 'manage_settings' | 'view_audit_log'
  // Owner-only
  | 'view_personal_finance' | 'view_combined_finance'
  // MD-only executive Dashboard
  | 'view_dashboard'
  // Personalized Task tab — every non-MD role
  | 'view_my_tasks'
  // Product Sales (FGD — KitchenAid/Bosch/Siemens/Gaggenau appliance sales),
  // deliberately separate from the Interior Projects permissions above
  | 'view_product_sales' | 'create_product_sale' | 'approve_product_sale_stage'
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
  | 'existing_client' | 'md_reference' | 'ed_reference' | 'google' | 'instagram' | 'facebook' | 'client_reference' | 'bni' | 'whatsapp' | 'online'
export type LeadInterest = 'hot' | 'medium' | 'cold'
export type BusinessDivision = 'fgd' | 'first_property_contractors' | 'sk_constructions' | 'sk_interiors' | 'sk_turnkey_interiors'
export type BusinessCategory = 'residential' | 'commercial' | 'industrial'
// FGD's brand lines — a sub-selection under the 'fgd' division, same pattern
// as BusinessCategory under 'sk_turnkey_interiors'. 'bosch_siemens_gaggenau'
// is legacy (kept only so already-saved leads still display correctly) —
// the picker now offers 'bosch'/'siemens'/'gaggenau' as separate brands.
export type BusinessBrand = 'kitchenaid' | 'bosch' | 'siemens' | 'gaggenau' | 'bosch_siemens_gaggenau'

export interface LeadActivityItem {
  id: string
  label: string
  note?: string
  updatedBy: string
  updatedAt: string
}

export type LeadCodePrefix = 'SK' | 'FGD'

export interface Lead {
  id: string
  name: string
  // Auto-generated at creation only (e.g. "SK004"/"FGD012") — never
  // user-editable, never reassigned on edit. Optional because leads created
  // before this field existed don't have one.
  leadCodePrefix?: LeadCodePrefix
  leadNumber?: string
  siteNo?: string
  phone: string
  email?: string
  city: string
  // Set together, only via the map picker's "Confirm Location" — never
  // independently. Absent on leads whose City was only ever typed by hand.
  latitude?: number
  longitude?: number
  businessDivision?: BusinessDivision
  businessCategory?: BusinessCategory
  businessBrand?: BusinessBrand
  requirement?: string
  notes?: string
  source: LeadSource
  // Free-text sub-source, only meaningful (and only shown/editable) when
  // source === 'other' — the client's real source list isn't finalized yet,
  // so 'other' needs a manual name rather than a fixed set of values.
  subSource?: string
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
  // Snapshot of `status` at the moment a lead is marked Lost — lets Restore
  // put it back exactly where it was instead of resetting to 'new'. Absent
  // on leads marked Lost before this field existed, or on leads that were
  // never Lost at all.
  lostFromStatus?: LeadStatus
  // Set when the MD forces a status from Update Status → "MD override". While
  // true, LeadStatusSheet's self-healing sync won't pull the lead forward
  // again; cleared by the next normal status change.
  mdStatusOverride?: boolean
  advancePaymentAmount?: number
  advancePaymentRef?: string
  activity: LeadActivityItem[]
  createdAt: string
  updatedAt: string
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'rescheduled' | 'cancelled'

// One MD decision on a reschedule request. Append-only: a later request never
// overwrites earlier entries (the fields on the Appointment itself only describe
// the latest request), so this is the permanent record shown in MD Task history.
export interface RescheduleDecisionItem {
  decision: 'accepted' | 'rejected'
  by: string
  byRole?: UserRole
  at: string
  note?: string          // MD's notes on the decision
  reason?: string        // the reason given when rescheduling was requested
  requestedBy?: string
  requestedAt?: string
  newDate?: string
}

export interface Appointment {
  id: string
  leadId: string
  clientName: string
  scheduledAt: string
  location: string
  coordinatorId?: string
  coordinatorName: string
  // Full assignee list for "Select Everyone"/multi-assign — coordinatorId/
  // coordinatorName above stay in sync as the first entry (still used as the
  // single-owner FK and by anything reading the old singular fields).
  // Optional so older rows without it fall back to the single coordinator.
  assignedToIds?: string[]
  assignedToNames?: string[]
  status: AppointmentStatus
  notes?: string
  // Reschedule request/accept flow: coordinator requests a reschedule with a
  // reason (status becomes 'rescheduled'), MD reviews and accepts it (status
  // reverts to 'scheduled', updated to rescheduledDate if one was given).
  // Only the latest request's details live here — the running history of
  // every reschedule lives in the lead's own `activity` log, same as every
  // other Lead-status transition already does, rather than a parallel array.
  rescheduleReason?: string
  rescheduledDate?: string
  rescheduleRequestStatus?: 'requested' | 'accepted' | 'rejected'
  rescheduleRequestedBy?: string
  rescheduleRequestedAt?: string
  rescheduleAcceptedBy?: string
  rescheduleAcceptedAt?: string
  rescheduleMdNotes?: string
  rescheduleHistory?: RescheduleDecisionItem[]
  // Every manual status change (Scheduled/Completed/Cancelled) made via
  // Update Status — reschedule accept/reject already has its own
  // rescheduleHistory above; this is the general-purpose audit trail.
  statusHistory?: AppointmentStatusHistoryItem[]
  createdAt: string
  updatedAt: string
}

export interface AppointmentStatusHistoryItem {
  status: AppointmentStatus
  label: string
  note?: string
  by: string
  byRole?: UserRole
  at: string
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
  heightFt?: string
  // Auto-calculated from lengthFt/widthFt/heightFt (sq.ft, or cu.ft once a
  // height is entered) — same shape as RequirementLineItem.calculatedTotal.
  calculatedTotal?: string
  notes?: string
  photos?: string[]
}

export interface SiteVisitChecklistItem {
  id: string
  label: string
  checked: boolean
}

// Distinct from SiteVisitChecklistItem above (a plain done/not-done task
// list) — this is a fixed set of Yes/No site-condition questions, answered
// per visit. null = not yet answered, so an untouched item never silently
// reads as a confirmed "No".
export interface SiteChecklistItem {
  id: string
  label: string
  answer: 'yes' | 'no' | null
}

export interface SiteVisit {
  id: string
  leadId: string
  projectId?: string
  appointmentId?: string
  visitDate: string
  // Who conducted/was present at this visit — captured directly on the site
  // visit itself (not looked up via a linked Appointment, which Site Visits
  // no longer reads at all — see the 2026-09-18 separation entry).
  teamMemberIds?: string[]
  teamMemberNames?: string[]
  rooms: SiteVisitRoom[]
  checklist: SiteVisitChecklistItem[]
  // Optional — absent on visits recorded before this existed.
  siteChecklist?: SiteChecklistItem[]
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
  // Optional structured dimensions (usually pre-filled from the Site
  // Visit's own room lengthFt/widthFt/heightFt) and the resulting
  // auto-calculated, saved total — separate from quantity/unit above,
  // which stay manually entered as before.
  lengthFt?: string
  widthFt?: string
  heightFt?: string
  calculatedTotal?: string
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

// 'pending_pc_review'/'pc_rejected'/'md_rejected' are new — QS → PC → MD now
// runs ahead of the existing MD step ('internal_review' onward, unchanged).
// 'draft' and 'rejected' are kept only so quotations already in the database
// in those states keep displaying/working — nothing new is written into
// 'rejected' going forward (a MD rejection now writes 'md_rejected' instead,
// since rejection returns to PC — the previous responsible person — not QS).
export type QuotationStatus =
  | 'draft'
  | 'pending_pc_review'
  | 'pc_rejected'
  | 'internal_review'
  | 'md_rejected'
  | 'internally_approved'
  | 'sent_to_client'
  | 'revision_requested'
  | 'client_approved'
  | 'rejected'

// One entry per action taken on a quotation's approval flow — who did it, when,
// and any note (e.g. the MD's rejection reason).
export interface QuotationStatusHistoryItem {
  status: QuotationStatus
  label: string
  note?: string
  by: string
  byRole?: UserRole
  at: string
}

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
  // Separate from BOQLineItem.notes above (per line item, unused) — this is
  // one note per room/section, shown directly under that section.
  notes?: string
}

export type DiscountType = 'percentage' | 'amount'

// The proposed advance-payment TERM on the quotation itself (e.g. "50%
// advance required"), set before/while sending to the client. Distinct from
// advanceStatus/advancePaymentReceived below, which record whether that
// money actually arrived once the client has approved — the two are
// related in sequence (this is the plan, that is the fact) but never merged.
export type AdvanceTermOption = 'with_advance' | 'without_advance' | 'full_advance'

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
  // discountType/discountValue are what the form edits (e.g. 10 meaning
  // 10%, or 5000 meaning ₹5000) — discountAmount is always the computed
  // final ₹ figure derived from them, kept so every existing consumer
  // (netAmount math, PDF/Excel export, summary rows) keeps working
  // unchanged. Both new fields are optional — quotations created before
  // this existed have neither and are treated as a flat ₹ discount equal
  // to their existing discountAmount.
  discountType?: DiscountType
  discountValue?: number
  discountAmount: number
  // Subtotal minus discount — the base tax is actually calculated on.
  // Optional: quotations saved before this existed don't have it.
  taxableAmount?: number
  // Flat ₹ transport/logistics cost, added after tax into netAmount.
  transportCost?: number
  netAmount: number
  advanceTermOption?: AdvanceTermOption
  // Only meaningful when advanceTermOption === 'with_advance'.
  advanceTermType?: DiscountType // reuses 'percentage' | 'amount' — same shape as the discount toggle
  advanceTermValue?: number
  advanceTermAmount?: number
  advanceTermBalance?: number
  // A single supporting PDF (e.g. a signed/formatted copy) attached to this
  // quotation — array-typed to match this app's other file-list fields, but
  // the form caps it at one file.
  documentFiles?: string[]
  terms?: string
  paymentTerms?: string
  sentAt?: string
  approvedAt?: string
  statusHistory?: QuotationStatusHistoryItem[]
  // Set on any rejection (status 'pc_rejected'/'md_rejected', or legacy
  // 'rejected'); cleared on any later transition.
  rejectionReason?: string
  // Chosen once the client has approved (status === 'client_approved'): the
  // project proceeds to Design either With Advance (advance details recorded
  // below) or Without Advance (client hasn't paid yet — never blocks Design; the
  // advance can still be recorded later, which switches this to with_advance).
  // Design Center only needs one of the two to be set (see DesignCenterScreen.tsx).
  advanceStatus?: 'with_advance' | 'without_advance'
  advancePaymentReceived?: boolean
  advancePaymentAmount?: number
  advancePaymentRef?: string
  advancePaymentAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ProjectStage =
  | 'advance_payment'
  | 'designing'
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

// ─── Material Request Form (MRF) ─────────────────────────────────────────────
// Project raises (optionally seeding details/notes) -> QS fills/updates material
// details, notes, Requesting Date & Expected Delivery Date and submits for
// approval -> Project Coordinator approves/rejects -> Procurement receives the
// completed MRF (adds vendors/files) -> Accounts releases the payment.
export type MRFStatus = 'pending_qs' | 'pending_coordinator_approval' | 'pending_procurement' | 'rejected' | 'paid'

// Procurement's own execution status, tracked once the MRF is approved —
// distinct from `status` above (the MRF's own QS/Procurement/LO approval
// workflow). The client will share the real option list; edit
// PROCUREMENT_STATUS_OPTIONS in data/procurementStatuses.ts to change it —
// this field is deliberately a plain string, not a TS union, so that list
// can change without a type/migration change.
export interface ProcurementStatusHistoryItem {
  status: string
  isDelay: boolean
  notes?: string
  updatedBy: string
  updatedAt: string
}

// A vendor Procurement has added to an MRF, with its own file uploads — each
// vendor's files are only ever read/written through this entry, never a
// shared list, so removing one vendor can never touch another's files.
export interface MRFVendor {
  id: string
  name: string
  files: string[]
}

export interface MaterialRequestForm {
  id: string
  projectId: string
  status: MRFStatus
  materialDetails?: string          // raised by Project, filled/updated by QS
  notes?: string                    // raised by Project, filled/updated by QS
  additionalNotes?: string          // filled by QS, separate from notes
  requestingDate?: string           // filled by QS
  expectedDeliveryDate?: string     // filled by QS
  approvalNotes?: string            // filled by the Project Coordinator on approve/reject
  vendors?: MRFVendor[]             // added by Procurement, any number of vendors, each with its own files
  // Legacy — a flat vendor-name list + one shared file list, from before files
  // were linked to a specific vendor. Only read (via migrateMrfVendors) to
  // carry old records forward; never written to by current code.
  vendorNames?: string[]
  files?: string[]
  releasedAmount?: number           // filled by Accounts on release
  releaseDate?: string              // filled by Accounts on release
  paymentReference?: string         // filled by Accounts on release
  accountsNotes?: string            // filled by Accounts on release
  procurementStatus?: string
  procurementStatusHistory?: ProcurementStatusHistoryItem[]
  history: StatusHistoryItem[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Vendors / Labour Listing ────────────────────────────────────────────────
// Simple standalone roster (name/nature of work/number) — deliberately
// separate from the full Vendor master (Procurement's Vendor type), which
// carries GSTIN/address/contact fields this listing doesn't need.
export interface VendorLabourEntry {
  id: string
  name: string
  natureOfWork: string
  // Flexible free-text — the client will share the exact format/options;
  // kept as a plain string so that doesn't require a type change later.
  number: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Site Engineer Daily Report ──────────────────────────────────────────────
// SE Creates -> Submit -> locked -> LO/MD/QS can view -> SE Requests Edit ->
// LO Approval -> Edit Allowed (one edit, then it re-locks).
export type DailyReportEditRequestStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface DailyReportAreaEntry {
  id: string
  areaName: string
  laborCount: number
}

export interface DailyReportEditHistoryItem {
  action: 'submitted' | 'edit_requested' | 'edit_approved' | 'edit_rejected' | 'edited'
  note?: string
  updatedBy: string
  updatedAt: string
}

export interface DailyReport {
  id: string
  projectId: string
  date: string
  totalLabourCount: number
  natureOfWork: string
  areas: DailyReportAreaEntry[]
  notes?: string
  locked: boolean
  editRequestStatus: DailyReportEditRequestStatus
  editRequestReason?: string
  editApprovalNotes?: string
  editHistory: DailyReportEditHistoryItem[]
  createdBy: string
  createdByName: string
  createdAt: string
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
  // A stage-advance request the responsible role has submitted, sitting at
  // the current stage until the MD approves (moves to toStage) or rejects
  // (cleared, stage unchanged) — same pattern as MRF/Quotation/Design approval.
  pendingStageRequest?: {
    toStage: ProjectStage
    note?: string
    requestedBy: string
    requestedById?: string
    requestedByRole?: UserRole
    requestedAt: string
  }
  // Absent (undefined) = the existing Interior Projects workflow, unchanged.
  // 'product_sale' rows are a lightweight shell for the separate FGD
  // appliance-sales flow — they use productSaleStage/pendingProductSaleStageRequest
  // below instead of stage/pendingStageRequest (which stays a fixed, unread
  // 'closed' sentinel on these rows), and are filtered out of every Interior
  // Projects screen so the two workflows never mix.
  type?: 'product_sale'
  productSaleStage?: ProductSaleStage
  pendingProductSaleStageRequest?: {
    toStage: ProductSaleStage
    note?: string
    requestedBy: string
    requestedById?: string
    requestedByRole?: UserRole
    requestedAt: string
  }
  createdAt: string
  updatedAt: string
}

// ─── Product Sales (FGD — KitchenAid / Bosch / Siemens / Gaggenau) ───────────
// A separate, simpler linear workflow from Interior Projects' 8-stage one.
// Customer Enquiry/Quotation are pure read-derived state from Lead/Quotation
// (no Project row exists yet); a Project shell (type: 'product_sale') is only
// created once the quotation is client-approved, starting at 'payment'.
export type ProductSaleStage =
  | 'customer_enquiry'
  | 'quotation'
  | 'approval'
  | 'payment'
  | 'product_ordering'
  | 'delivery'
  | 'completed'

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
// 'client_review' is legacy (kept so pre-existing packages still render a
// sensible label) — new packages now go through the same QS/designer -> PC ->
// MD -> client flow as Quotations: in_progress -> pending_pc_review ->
// internal_review -> internally_approved -> sent_to_client -> client_approved
// | revision_requested. 'pc_rejected'/'md_rejected' mirror Quotation's —
// rejection returns to the previous responsible person. 'rejected' is kept
// only so packages already in that state keep displaying/working; nothing
// new writes it going forward.
export type DesignPackageStatus =
  | 'in_progress' | 'client_review' | 'client_approved' | 'revision_requested'
  | 'pending_pc_review' | 'pc_rejected'
  | 'internal_review' | 'md_rejected' | 'internally_approved' | 'sent_to_client' | 'rejected'

// One entry per action on a design package's approval flow — who, when, and any
// note (e.g. the MD's rejection reason).
export interface DesignStatusHistoryItem {
  status: DesignPackageStatus
  label: string
  note?: string
  by: string
  byRole?: UserRole
  at: string
}

export interface DesignPackage {
  id: string
  projectId?: string
  leadId?: string
  quotationId?: string
  name: string
  status: DesignPackageStatus
  notes?: string
  statusHistory?: DesignStatusHistoryItem[]
  // Set when the MD rejects (status 'rejected'); cleared on any later transition.
  rejectionReason?: string
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

export interface AttendanceCapture {
  lat: number
  lng: number
  accuracy?: number   // meters, from the Geolocation API
  photoUrl: string    // uploaded via storeFile(), photo already has date/time/location stamped on it
}

export interface AttendanceRecord {
  id: string
  userId: string
  userName: string
  date: string
  status: AttendanceStatus
  startTime?: string  // ISO timestamp — set by the Start (clock-in) button, self-only
  endTime?: string    // ISO timestamp — set by the End (clock-out) button, self-only
  startCapture?: AttendanceCapture  // GPS + stamped photo captured at Start — set once, never edited after
  endCapture?: AttendanceCapture    // GPS + stamped photo captured at End — set once, never edited after
  reason?: string     // required when status is 'absent' — collected via a confirmation dialog
  markedBy: string
  createdAt: string
  updatedAt: string
}

// Single company-wide row (id fixed to 'attendance' in sks_integration_settings)
// — office hours, owner-configured, used to compute late-arrival/early-departure.
// No geofence — attendance is never blocked by distance from the office,
// but GPS is still captured on every record for MD/Admin to review.
export interface AttendanceSettings {
  startTime: string  // "09:30", 24h HH:mm
  endTime: string    // "18:45", 24h HH:mm
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

// Distinct from WeeklyPlanEntry above: a Daily Task is assigned BY the MD TO
// a team member (one-directional), not self-authored. The assignee can only
// ever flip its status, never reassign or edit the title/notes.
export type DailyTaskStatus = 'pending' | 'done'

export interface DailyTask {
  id: string
  assigneeId: string
  assigneeName: string
  title: string
  notes?: string
  date: string
  status: DailyTaskStatus
  assignedBy: string
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

// ─── Notifications ───────────────────────────────────────────────────────────
export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  url?: string
  readAt?: string
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
