# SpaceKrafters OS — Build Instructions for Claude

## What You Are Building

SpaceKrafters OS is an interior design & construction operating system for a single company. It covers:
- CRM (leads, appointments, follow-ups)
- Site visits & requirements capture
- Proposal / BOQ / Quotation center
- Design center
- Project workspace (WBS, tasks, Gantt, daily diary)
- Procurement & vendor management
- Company finance (expenses, receivables, payables, cashflow)
- HR (attendance & leave)
- Owner-only personal finance (separate domain)
- Owner-only combined financial view (read-only aggregation)

**Tech stack:** React 19 + TypeScript + Vite + Tailwind CSS + Supabase (Auth + PostgreSQL + Edge Functions) + PWA

---

## Source of Truth: Fenster Codebase

A working production app called **Fenster OS** already exists. SpaceKrafters is built by copying and adapting Fenster's components, patterns, and infrastructure — **not from scratch**.

**Fenster source path:** `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src`

All component references below point to files in that path. When building SpaceKrafters, read the Fenster file first, then adapt it for SpaceKrafters' different fields, roles, and domain.

---

## Core Principle: Everything Is a Reused Pattern

Every screen in SpaceKrafters is one of these Fenster patterns with different fields:

| Pattern | Fenster file to copy | Used for in SKS |
|---|---|---|
| List + filter + search + cards | `src/screens/Leads/LeadsScreen.tsx` | Leads, Appointments, Follow-ups, Vendors, Expenses, POs, Leave |
| Detail + tabs | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` | Project Workspace, Vendor Detail, Lead Detail |
| Multi-step flow sheet | `src/screens/TaskDetail/DemoFlowSheet.tsx` | Procurement flow, Expense lifecycle, BOQ approval |
| Approval list | `src/screens/Approvals/ApprovalsScreen.tsx` | Expense approvals, Design approvals, Procurement approvals |
| Dashboard with stat cards | `src/screens/Dashboard/OwnerDashboardScreen.tsx` | Owner Command Center, Company Finance Dashboard |
| Form in BottomSheet | `src/components/feedback/BottomSheet.tsx` + any form screen | Add lead, Add task, Add vendor, Add expense request |
| File vault | `src/screens/Files/FilesScreen.tsx` | Document center |
| Settings + user management | `src/screens/Settings/SettingsScreen.tsx` + `UserManagementScreen.tsx` | Settings, HR, User Management |

**The only genuinely new UI to build:** Gantt chart and BOQ line-item table editor. Everything else is copy-adapt.

---

## Components to Copy Directly (zero changes needed)

Copy these files verbatim from `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src` into the SpaceKrafters `src` directory:

### Feedback
- `components/feedback/BottomSheet.tsx`
- `components/feedback/Dialog.tsx`
- `components/feedback/Snackbar.tsx`
- `components/feedback/EmptyState.tsx`
- `components/feedback/LoadingSkeleton.tsx`
- `components/feedback/FilePreviewModal.tsx`
- `components/feedback/StatusUpdateSheet.tsx`

### Forms
- `components/forms/SearchBar.tsx`
- `components/forms/FilterChips.tsx`
- `components/forms/TimePickerField.tsx`
- `components/forms/FileUploadField.tsx`
- `components/forms/MultiFileUploadField.tsx`
- `components/forms/NoteWithFilesField.tsx`
- `components/forms/LocationAddressField.tsx`
- `components/forms/LocationPinField.tsx`
- `components/forms/VoiceRecorder.tsx`

### Layout
- `components/layout/Accordion.tsx`
- `components/layout/BackButton.tsx`
- `components/layout/ErrorBoundary.tsx`
- `components/layout/PermissionGate.tsx`
- `components/layout/ProtectedRoute.tsx`
- `components/layout/Timeline.tsx`
- `components/layout/NoPermission.tsx`

### Charts
- `components/charts/ProgressBar.tsx`
- `components/charts/ProgressCircle.tsx`

### Cards (copy, then adapt fields)
- `components/cards/StatCard.tsx`
- `components/cards/QuickAccessCard.tsx`
- `components/cards/SummaryIconCard.tsx`
- `components/cards/SuggestionCard.tsx`
- `components/cards/FileUploadCard.tsx`
- `components/cards/ApprovalCard.tsx`
- `components/cards/PaymentCard.tsx`

### PWA
- `components/pwa/OfflineBanner.tsx`
- `components/pwa/InstallAppPrompt.tsx`
- `components/pwa/PWAUpdatePrompt.tsx`
- `components/pwa/DbBanner.tsx`

### Icons
- `components/icons/ColorIcon.tsx`

### Badges
- `components/badges/PriorityBadge.tsx`
- `components/badges/StatusBadge.tsx` — extend with SKS statuses

### Navigation
- `components/navigation/FloatingActionButton.tsx`

### Utils (copy verbatim)
- `utils/fileStorage.ts` — Hostinger file upload (same upload endpoint)
- `utils/authIdentity.ts` — synthetic email from mobile pattern
- `utils/dateRange.ts` — date filter helpers
- `utils/sessionStore.ts` — file/voice preview URL store
- `utils/taskFilters.ts` — date matching helpers
- `utils/pushNotifications.ts` — Web Push subscription lifecycle
- `utils/migrate.ts` — localStorage cleanup on version bump

---

## Components to Adapt (copy then modify)

### `AppHeader`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\components\layout\AppHeader.tsx`
- Change: Replace Fenster logo and brand colors with SpaceKrafters branding

### `MobileMenuDrawer` + `SidebarNavigation` + `NavigationBar`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\components\navigation\`
- Change: Rebuild nav sections and tab items for SKS module structure (see Module List below)

### `AuthContext`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\context\AuthContext.tsx`
- Change: Update role names to SKS roles. Keep the synthetic email + Supabase Auth pattern exactly.

### `userStorage.ts`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\utils\userStorage.ts`
- Change: Replace seed users and `DEFAULT_PRODUCTION_USERS` with SKS seed users and roles

### `permissions.ts`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\data\permissions.ts`
- Change: Replace `ROLE_PERMISSIONS` and `SCREEN_PERMISSIONS` with SKS role/permission map

### `AppDataContext`
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\context\AppDataContext.tsx`
- Change: Split into domain-specific contexts — `CRMContext`, `ProjectContext`, `FinanceContext` — rather than one mega-context. SKS has 3× more entity types than Fenster.

### `admin-user-sync` Edge Function
- Source: `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\supabase\functions\admin-user-sync\index.ts`
- Change: Copy verbatim. Update the allowed roles check if needed.

---

## Screens — Copy and Adapt

For each screen, read the Fenster source, then rebuild with SKS fields and roles.

| SKS Screen | Fenster source to start from | Key changes |
|---|---|---|
| `LoginScreen` | `src/screens/Login/LoginScreen.tsx` | Brand only |
| `HomeScreen` | `src/screens/Home/HomeScreen.tsx` | Role-aware quick-access cards for SKS modules |
| `LeadsScreen` | `src/screens/Leads/LeadsScreen.tsx` | Add SLA status, activity log, appointment link, interior design lead sources |
| `LeadDetailScreen` | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` | Tabs: Overview, Appointments, Follow-ups, Site Visits, Activity log |
| `AppointmentsScreen` | `src/screens/Leads/LeadsScreen.tsx` (list pattern) | Fields: client, date/time, location, coordinator, status, notes |
| `FollowUpsScreen` | `src/screens/Leads/LeadsScreen.tsx` (list pattern) | Fields: lead, due date, owner, status, outcome note |
| `SiteVisitsScreen` | `src/screens/SiteVisit/SiteVisitScreen.tsx` | Add room-wise measurements, checklists, requirement capture per room |
| `RequirementsScreen` | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` (tabs pattern) | Convert site data into line items for BOQ |
| `QuotationsScreen` | `src/screens/Quotations/QuotationsScreen.tsx` | Add BOQ line-item builder, versioning, internal approval → client send |
| `DesignCenterScreen` | `src/screens/Files/FilesScreen.tsx` + `ProjectDetailScreen.tsx` | Design packages, versions, moodboards, revision tracking, client approval |
| `ProjectsScreen` | `src/screens/Projects/ProjectsScreen.tsx` | Add contract value, margin, design status, Gantt link |
| `ProjectWorkspaceScreen` | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` | Tabs: Overview, Gantt, Team, Requirements, BOQ, Design, Finance, Procurement, Documents, Handover |
| `TaskDetailScreen` | `src/screens/TaskDetail/TaskDetailScreen.tsx` | Add subtask list, dependencies, mandatory late-reason |
| `GanttScreen` | **Build new** — no Fenster equivalent | True Gantt: stages → tasks → subtasks, dependencies, deadline change history |
| `DailyDiaryScreen` | `src/screens/TodayTasks/TodayTasksScreen.tsx` | Per-project daily log, activity, blockers, photos, site progress |
| `ProcurementScreen` | `src/screens/TaskDetail/DemoFlowSheet.tsx` (flow pattern) | PR → Vendor quotes → Comparison → Approval → PO → GRN → Vendor Bill |
| `VendorMasterScreen` | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` (detail pattern) | Tabs: Profile, Quotations, POs, Bills, Payments, Outstanding |
| `ExpenseRequestScreen` | `src/screens/Approvals/ApprovalsScreen.tsx` + list pattern | Expense lifecycle: Requested → Approved → Committed → Paid → Closed |
| `CompanyExpensesScreen` | `src/screens/Payments/PaymentsScreen.tsx` | Project expenses + overheads, separated, rolled up to cashflow |
| `CompanyAccountsScreen` | `src/screens/Dashboard/OwnerDashboardScreen.tsx` (stats pattern) | Bank/cash/UPI accounts, opening balances, reconciliation |
| `ReceivablesScreen` | `src/screens/Payments/PaymentsScreen.tsx` | Milestone-based, partial receipts, ageing, overdue, follow-up owner |
| `PayablesScreen` | `src/screens/Payments/PaymentsScreen.tsx` | Vendor/employee payables, due dates, ageing |
| `ProjectFinancialsScreen` | `src/screens/ProjectDetail/ProjectDetailScreen.tsx` (tab) | Contract value, internal budget, actual, collections, margin, variance |
| `StatementImportScreen` | **Build new** — no Fenster equivalent | Upload CSV/PDF → parse → classify → review → confirm |
| `ReportsScreen` | `src/screens/Reports/ReportsScreen.tsx` | Rebuild metrics: lead conversion, project margin, cashflow, procurement, team accountability |
| `ApprovalsScreen` | `src/screens/Approvals/ApprovalsScreen.tsx` | Extend for multi-type: expense, design, procurement, leave |
| `AttendanceScreen` | **Build new** — no Fenster equivalent | Daily check-in/out, present/absent/half-day, linked to daily diary |
| `LeaveScreen` | `src/screens/LeaveApplication/LeaveApplicationScreen.tsx` | Direct reuse — submit, approve/reject |
| `FilesScreen` | `src/screens/Files/FilesScreen.tsx` | Add version history, document states (Draft/Approved/Sent/Client Approved) |
| `SettingsScreen` | `src/screens/Settings/SettingsScreen.tsx` | Brand, rates, FY controls |
| `UserManagementScreen` | `src/screens/Settings/UserManagementScreen.tsx` | Direct reuse — update roles list |
| `OwnerCommandCenter` | `src/screens/Dashboard/OwnerDashboardScreen.tsx` | Add finance snapshot, procurement alerts, CRM snapshot, team accountability |
| `PersonalFinanceScreen` | Existing personal finance tracker (separate repo) | Owner-only private domain |
| `CombinedFinanceView` | **Build new** | Read-only aggregation of Company + Personal summaries, no create/edit |

---

## Roles & Permissions

### SKS Roles
```typescript
type UserRole =
  | 'owner'               // Full access + personal finance + combined view
  | 'accounts'            // Company finance, payables, receivables, reconciliation
  | 'project_coordinator' // Projects, tasks, CRM, site visits, expense requests
  | 'site_engineer'       // Site visits, tasks, daily diary, expense requests
  | 'designer'            // Design center, assigned tasks
  | 'qs'                  // BOQ, cost plan, quantity/cost control
  | 'purchase'            // Procurement, vendors, POs, vendor bills
  | 'admin'               // Owner-configured module access
```

### Permission Areas (build ROLE_PERMISSIONS map)
- CRM: view_leads, add_lead, edit_lead, delete_lead, convert_lead, view_activity
- Appointments: view_appointments, add_appointment, edit_appointment
- Site: view_site_visits, add_site_visit, edit_site_visit, add_requirements
- Quotations: view_quotations, create_quotation, approve_quotation_internal, send_quotation_client
- Design: view_design, upload_design, approve_design, request_revision
- Projects: view_projects, create_project, edit_project, delete_project
- Tasks: view_tasks, add_task, edit_task, complete_task, add_subtask
- Gantt: view_gantt, edit_deadline
- Procurement: view_procurement, raise_purchase_request, approve_purchase_request, create_po, receive_goods, enter_vendor_bill
- Expenses: view_expenses, raise_expense_request, approve_expense, record_payment
- Finance: view_company_finance, manage_company_accounts, view_receivables, record_receipt, view_payables, record_payment, reconcile
- HR: view_attendance, mark_attendance, view_leave, approve_leave
- Reports: view_reports, view_financial_reports
- Admin: manage_users, manage_permissions, manage_settings, view_audit_log

---

## Data Model

### Key Types to Define

```typescript
// Roles — see above

// Lead
interface Lead {
  id: string
  clientName: string
  phone: string
  email?: string
  source: LeadSource       // walk_in | referral | online | instagram | google | other
  interest: string         // interior design scope
  status: LeadStatus       // new | contacted | appointment_set | site_visit_done | proposal_sent | negotiating | won | lost | on_hold
  assignedTo: string       // coordinator name/id
  slaDeadline?: string
  convertedProjectId?: string
  createdAt: string
  updatedAt: string
  activities: LeadActivity[]
}

// Appointment
interface Appointment {
  id: string
  leadId: string
  clientName: string
  date: string
  time: string
  location?: string
  coordinator: string
  status: 'scheduled' | 'done' | 'cancelled' | 'rescheduled'
  notes?: string
}

// Project
interface Project {
  id: string
  name: string             // SKS-XXXX project number
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

type ProjectStage =
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

// Task
interface Task {
  id: string
  projectId: string
  parentTaskId?: string    // for subtasks
  title: string
  description?: string
  assignedTo: string
  role: UserRole
  stage?: string           // project phase this belongs to
  status: 'pending' | 'in_progress' | 'done' | 'late' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'critical'
  startDate?: string
  deadline: string
  completedAt?: string
  lateReason?: string      // mandatory if completed after deadline
  dependsOn?: string[]     // task ids
  attachments?: FileAttachment[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// BOQ / Quotation
interface Quotation {
  id: string
  projectId: string
  version: number
  status: 'draft' | 'internal_review' | 'internally_approved' | 'sent_to_client' | 'revision_requested' | 'client_approved' | 'rejected'
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

interface BOQSection {
  id: string
  title: string
  items: BOQLineItem[]
}

interface BOQLineItem {
  id: string
  description: string
  unit: string
  quantity: number
  rate: number
  amount: number           // quantity × rate
  taxPercent?: number
  notes?: string
}

// Expense Request
interface ExpenseRequest {
  id: string
  projectId?: string       // null for overheads
  category: string
  subcategory?: string
  purpose: string
  amount: number
  vendorPayee?: string
  neededBy?: string
  requestedBy: string
  status: 'requested' | 'approved' | 'rejected' | 'paid' | 'closed'
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  paidAmount?: number
  paidAt?: string
  paymentAccount?: string
  paymentRef?: string
  attachments?: FileAttachment[]
  createdAt: string
  updatedAt: string
}

// Procurement
interface PurchaseRequest {
  id: string
  projectId?: string
  description: string
  quantity: number
  unit: string
  neededBy?: string
  status: 'draft' | 'approved' | 'quoted' | 'po_raised' | 'received' | 'billed' | 'paid'
  vendorId?: string
  poNumber?: string
  vendorBillId?: string
  createdBy: string
  createdAt: string
}

// Payment Milestone
interface PaymentMilestone {
  id: string
  projectId: string
  title: string
  amount: number
  dueDate?: string
  status: 'pending' | 'invoiced' | 'partial' | 'received' | 'overdue'
  receivedAmount: number
  receivedDates: string[]
  invoiceRef?: string
  notes?: string
}

// Attendance
interface AttendanceRecord {
  id: string
  userId: string
  userName: string
  date: string             // YYYY-MM-DD
  status: 'present' | 'absent' | 'half_day' | 'leave'
  checkIn?: string         // HH:MM
  checkOut?: string
  notes?: string
}

// Leave — reuse Fenster's LeaveApplication type directly
// Source: d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\types\index.ts — LeaveApplication

// Reuse from Fenster verbatim:
// FileAttachment, VoiceNote, LocationPin, StatusHistoryItem
```

---

## Supabase Tables

Each entity maps to one table. Pattern: `sks_<entity>` prefix. Each table stores a typed `data` JSONB column (same as Fenster) for flexibility plus indexed columns for filtering.

```sql
-- Core
sks_managed_users        -- same as fenster_managed_users
sks_leads
sks_lead_activities
sks_appointments
sks_follow_ups
sks_site_visits
sks_requirements

-- Projects & Execution
sks_projects
sks_tasks                -- includes subtasks via parent_task_id
sks_task_dependencies
sks_daily_diary
sks_project_stages       -- stage history / audit

-- Commercial
sks_quotations
sks_boq_sections
sks_boq_items
sks_design_packages
sks_design_versions

-- Procurement
sks_vendors
sks_purchase_requests
sks_vendor_quotes
sks_purchase_orders
sks_goods_receipts
sks_vendor_bills

-- Finance
sks_expense_requests
sks_company_accounts
sks_company_transactions
sks_payment_milestones
sks_receipts
sks_payables
sks_payments

-- HR
sks_attendance
sks_leave_applications   -- same structure as fenster_leave_applications

-- System
sks_documents
sks_document_versions
sks_notifications
sks_audit_log
sks_push_subscriptions   -- same as fenster_push_subscriptions
sks_integration_settings
```

---

## Services Pattern

Copy the Supabase service pattern from any Fenster service, e.g.:
`d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\services\leadService.ts`

Each service: imports `supabase` from `../lib/supabase`, owns one table, exports typed CRUD functions (`getAll`, `upsert`, `delete`). No logic — just DB calls.

---

## Auth Pattern

**Copy exactly** from Fenster:
- `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\context\AuthContext.tsx`
- `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\utils\authIdentity.ts`
- `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\services\userService.ts`
- `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\supabase\functions\admin-user-sync\index.ts`

Login uses mobile number → synthetic email `u{mobile}@sks.internal` → Supabase Auth `signInWithPassword`. No OTP. No email verification. Admin creates users via the Edge Function.

---

## Navigation Structure

```
Bottom nav (mobile):        Home | CRM | Projects | Tasks | More
Sidebar (desktop):

  Work
    Home / My Work
    Tasks
    Daily Diary
    Attendance

  CRM
    Leads
    Appointments
    Follow-ups

  Projects
    All Projects
    Site Visits
    Requirements

  Commercial
    Quotations / BOQ
    Design Center

  Procurement
    Purchase Requests
    Vendors
    Purchase Orders

  Finance (owner + accounts)
    Company Expenses
    Receivables
    Payables
    Company Accounts
    Reports

  HR
    Leave
    Attendance

  Owner only
    Personal Finance
    Combined View

  Settings
    Profile
    User Management
    Permissions
    App Settings
```

---

## Genuinely New UI to Build

### 1. Gantt Chart
No Fenster equivalent. Use a lightweight library (e.g. `dhtmlx-gantt` or build with SVG/Canvas).
- Rows: Project Stages → Tasks → Subtasks
- Columns: dates (weekly/monthly zoom)
- Interactions: drag deadline, click to open task, highlight dependencies
- Late tasks: red bar

### 2. BOQ Line-Item Table Editor
No Fenster equivalent.
- Spreadsheet-like table: Description | Unit | Qty | Rate | Amount (auto) | Tax%
- Add/remove rows, reorder sections
- Section subtotals, grand total, tax total, net total
- Inline editing per cell
- Export to PDF (branded) and Excel

### 3. Statement Import
No Fenster equivalent.
- File upload (CSV/OFX/PDF)
- Parse → show preview table
- Auto-classify using rules
- User corrects classification
- Confirm → post to Company Accounts

### 4. Attendance Screen
No Fenster equivalent.
- Calendar grid view (month)
- Per-user or all-team view
- Mark present/absent/half-day per day
- Integrate with leave (auto-mark leave days)
- Summary: present days / working days / leave days

---

## Finance Architecture Rules (non-negotiable)

These must be enforced in the data model and UI:

1. **Personal Finance and Company Finance are separate.** Never mix. Personal is Owner-only.
2. **Combined View is read-only.** No create/edit/delete from that screen.
3. **One cash movement = one transaction.** Multi-project allocation via `transaction_allocations` table, not duplicate rows.
4. **Approval ≠ Payment.** Approved expense shows as commitment/payable. Only recorded payment creates cashflow.
5. **Rejected records stay visible** with reason, approver, and timestamp. Never delete.
6. **Client advance is not revenue** until applied to a milestone.
7. **Owner ↔ Company transfers** use explicit transfer type — never normal income/expense.
8. **FY is April 1 – March 31.** Closed FY is immutable. Owner can reopen with mandatory reason + audit.

---

## Attendance & Leave Module

### Leave (direct reuse)
- Copy `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\screens\LeaveApplication\LeaveApplicationScreen.tsx`
- Copy `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\utils\leaveStorage.ts`
- Copy `d:\Rabbit Marketing\BNI\Clients\Fenster\OS\src\services\leaveService.ts`
- Only change: table name `sks_leave_applications`, role names

### Attendance (new)
- Daily record per user: date, status (present/absent/half_day/leave), check-in, check-out
- Admin can mark attendance for the team
- User can self-mark (if permitted)
- Linked to leave: if leave approved for that date, auto-mark as leave
- Monthly summary per user: working days, present, absent, leaves taken
- Linked to Daily Diary entries (if diary entry exists → present)

---

## Build Order

### P0 — Foundation
1. Vite + React + TypeScript + Tailwind project setup
2. Supabase project + all `sks_*` tables + RLS policies
3. Copy all direct-reuse components from Fenster
4. Auth (copy from Fenster, update roles)
5. User Management (copy from Fenster)
6. Deploy `admin-user-sync` Edge Function (copy from Fenster)
7. Navigation shell (adapt from Fenster)

### P1 — CRM & Field Operations
8. Leads screen + Lead Detail
9. Appointments screen
10. Follow-ups screen
11. Site Visits screen (add room/measurement/checklist)
12. Requirements screen

### P2 — Commercial
13. Quotation / BOQ builder (BOQ line-item table — new UI)
14. Design Center
15. Project Workspace (tabs shell)
16. Tasks + Subtasks
17. Gantt (new UI)
18. Daily Diary

### P3 — Procurement & Expenses
19. Vendor Master
20. Purchase Requests → PO → GRN → Vendor Bill flow
21. Expense Request lifecycle
22. Company Accounts

### P4 — Finance
23. Receivables + Payment Milestones
24. Payables + Vendor Payments
25. Company Finance Dashboard
26. Project Financials tab
27. Statement Import (new UI)
28. Reports

### P5 — HR & Owner Intelligence
29. Attendance (new UI)
30. Leave (copy from Fenster)
31. Personal Finance (existing tracker — integrate)
32. Combined Financial View (read-only)
33. Audit Log viewer

---

## Key Files to Read Before Starting Each Module

| Module | Read these Fenster files first |
|---|---|
| Auth & users | `src/context/AuthContext.tsx`, `src/utils/userStorage.ts`, `src/services/userService.ts`, `src/utils/authIdentity.ts` |
| CRM | `src/screens/Leads/LeadsScreen.tsx`, `src/components/leads/EditLeadSheet.tsx` |
| Site visits | `src/screens/SiteVisit/SiteVisitScreen.tsx` |
| Projects | `src/screens/Projects/ProjectsScreen.tsx`, `src/screens/ProjectDetail/ProjectDetailScreen.tsx` |
| Tasks | `src/screens/TaskDetail/TaskDetailScreen.tsx`, `src/screens/TaskDetail/DemoFlowSheet.tsx` |
| Approvals | `src/screens/Approvals/ApprovalsScreen.tsx` |
| Files | `src/screens/Files/FilesScreen.tsx`, `src/services/fileService.ts`, `src/utils/fileStorage.ts` |
| Payments | `src/screens/Payments/PaymentsScreen.tsx`, `src/services/paymentService.ts` |
| Leave | `src/screens/LeaveApplication/LeaveApplicationScreen.tsx`, `src/utils/leaveStorage.ts` |
| Dashboard | `src/screens/Dashboard/OwnerDashboardScreen.tsx` |
| Permissions | `src/data/permissions.ts`, `src/utils/permissions.ts` |
| Service pattern | `src/services/leadService.ts` (simplest example) |
| Context pattern | `src/context/AppDataContext.tsx` |
| Types | `src/types/index.ts` |
