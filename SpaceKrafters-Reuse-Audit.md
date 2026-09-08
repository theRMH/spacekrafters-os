# SpaceKrafters — Fenster Component Reuse Audit

## Summary

| Category | Fenster Total | Direct Reuse | Adapt / Extend | Build New |
|---|---|---|---|---|
| UI Components | 54 | 38 | 10 | 6+ |
| Screens / Pages | 26 | 8 | 12 | 15+ |
| Hooks | 3 | 1 | 2 | 4+ |
| Utils | 20 | 12 | 4 | 6+ |
| Services | 14 | 0 (pattern reuse) | 14 | 8+ |
| Types | ~40 types | 5 base types | 10 adapted | 30+ new |
| Context / Auth | 2 | 1 (Auth) | 1 (AppData) | 1+ |

**Overall: ~70% of UI primitives reusable. ~30% of screens reusable. Most business logic needs to be rebuilt for SKS's deeper domain.**

---

## UI Components — Direct Reuse (copy as-is)

These are domain-agnostic and plug straight into SpaceKrafters with zero changes.

### Feedback (100% reusable)
| Component | Reuse |
|---|---|
| `BottomSheet` | ✅ Direct |
| `Dialog` | ✅ Direct |
| `Snackbar` | ✅ Direct |
| `EmptyState` / `LoadingState` | ✅ Direct |
| `LoadingSkeleton` | ✅ Direct |
| `FilePreviewModal` | ✅ Direct |
| `StatusUpdateSheet` | ✅ Direct |

### Forms (100% reusable)
| Component | Reuse |
|---|---|
| `SearchBar` | ✅ Direct |
| `FilterChips` | ✅ Direct |
| `TimePickerField` | ✅ Direct |
| `FileUploadField` | ✅ Direct |
| `MultiFileUploadField` | ✅ Direct |
| `NoteWithFilesField` | ✅ Direct |
| `LocationAddressField` | ✅ Direct |
| `LocationPinField` | ✅ Direct |
| `VoiceRecorder` | ✅ Direct |

### Layout (100% reusable)
| Component | Reuse |
|---|---|
| `Accordion` | ✅ Direct |
| `BackButton` | ✅ Direct |
| `ErrorBoundary` | ✅ Direct |
| `PermissionGate` | ✅ Direct |
| `ProtectedRoute` | ✅ Direct |
| `Timeline` | ✅ Direct |
| `NoPermission` | ✅ Direct |

### Charts (100% reusable)
| Component | Reuse |
|---|---|
| `ProgressBar` | ✅ Direct |
| `ProgressCircle` | ✅ Direct |

### Cards (mostly reusable)
| Component | Reuse |
|---|---|
| `StatCard` | ✅ Direct |
| `QuickAccessCard` | ✅ Direct |
| `SummaryIconCard` | ✅ Direct |
| `SuggestionCard` | ✅ Direct |
| `FileRow` / `UploadArea` | ✅ Direct |

### Badges
| Component | Reuse |
|---|---|
| `PriorityBadge` | ✅ Direct |
| `StatusBadge` | ✅ Extend — add SKS statuses |

### Navigation
| Component | Reuse |
|---|---|
| `FloatingActionButton` | ✅ Direct |
| `BottomSheet` | ✅ Direct |

### PWA
| Component | Reuse |
|---|---|
| `OfflineBanner` | ✅ Direct |
| `InstallAppPrompt` | ✅ Direct |
| `PWAUpdatePrompt` | ✅ Direct |
| `DbBanner` | ✅ Direct |

### Icons
| Component | Reuse |
|---|---|
| `ColorIcon` | ✅ Direct |

---

## UI Components — Adapt / Extend

These need modifications to fit SKS's different roles, terminology, and richer data model.

| Component | What changes |
|---|---|
| `AppHeader` | Replace Fenster logo/branding with SpaceKrafters |
| `MobileMenuDrawer` | Rebuild nav sections for SKS module structure (CRM, Projects, Design, Finance, Procurement…) |
| `SidebarNavigation` | Same — module registry needs rebuilding for SKS |
| `NavigationBar` | SKS has more top-level modules than Fenster's 5 tabs |
| `TaskCard` | Adapt for SKS task model (stage/phase/subtask hierarchy vs flat Fenster tasks) |
| `FlowTaskCard` | Adapt for SKS project stages (not Fenster's window/door pipeline) |
| `ProjectCard` / `ProjectRow` | Adapt fields — SKS projects have contract value, margin, design status |
| `PaymentCard` | Extend for milestone-based payment structure |
| `ApprovalCard` | Extend — SKS has expense approvals, design approvals, procurement approvals (multiple types) |
| `LeadSourceSelect` | Adapt label set for interior design context |

---

## UI Components — Build New for SpaceKrafters

These don't exist in Fenster at all.

| New Component | Why needed |
|---|---|
| `GanttChart` | True project timeline with dependencies — PRD §10.2 |
| `BOQLineItemRow` | Quotation/BOQ builder line item with quantity, unit, rate, tax |
| `VendorCard` | Vendor master card with GST/PAN, outstanding, payment history |
| `ExpenseRequestCard` | Expense lifecycle card (Requested → Approved → Committed → Paid) |
| `DesignPackageCard` | Design version card with status, revision count, approval actions |
| `MilestoneRow` | Payment milestone row with due date, received, balance, ageing |
| `ProcurementStatusBadge` | PR → Quote → PO → GRN → Bill states |
| `BudgetVarianceBar` | Budget used vs remaining with warning threshold |
| `CombinedFinanceWidget` | Owner-only personal + company position summary |

---

## Screens — Direct Reuse

| Fenster Screen | SKS Use |
|---|---|
| `LoginScreen` | ✅ Direct — same Supabase Auth / phone pattern |
| `UserManagementScreen` | ✅ Direct — same owner-managed user pattern |
| `SettingsScreen` | ✅ Minimal changes — brand, rates |
| `FilesScreen` | ✅ Adapt — same file vault pattern, add document versioning |
| `LeaveApplicationScreen` | ✅ Direct — same leave approval flow |
| `ApprovalsScreen` | ✅ Extend — add expense/design/procurement approval types |
| `ReportsScreen` | ✅ Adapt — rebuild metrics for SKS KPIs |
| `HomeScreen` | ✅ Adapt — role-aware quick-access, different modules |

---

## Screens — Adapt / Extend

| Fenster Screen | SKS Equivalent | What changes |
|---|---|---|
| `LeadsScreen` | CRM / Leads | Add appointments, follow-ups, SLA breach alerts, activity log |
| `ProjectsScreen` | Projects | Add contract value, margin, design status, Gantt link |
| `ProjectDetailScreen` | Project Workspace | Add Design, BOQ, Requirements, Gantt, Procurement, Project Finance tabs |
| `SiteVisitScreen` | Site Visits | Add room-wise measurements, checklists, requirement capture |
| `QuotationsScreen` | Proposal / BOQ Center | Full BOQ builder, versioning, internal approval → client send |
| `TaskDetailScreen` | Task Detail | Add subtask support, dependencies, late-reason enforcement |
| `PaymentsScreen` | Receivables / Collections | Milestone-based, partial receipts, ageing |
| `OwnerDashboardScreen` | Owner Command Center | Add finance snapshot, procurement alerts, team accountability |
| `ProductionScreen` | (no direct equivalent) | Closest to Procurement / Execution tracking |

---

## Screens — Build New for SpaceKrafters

These have no equivalent in Fenster.

| New Screen | PRD Section |
|---|---|
| `AppointmentsScreen` | §6 CRM |
| `FollowUpsScreen` | §6 CRM |
| `RequirementsScreen` | §7 Site Visits & Requirements |
| `BOQBuilderScreen` | §8 Proposal / BOQ |
| `DesignCenterScreen` | §9 Design Center |
| `GanttScreen` | §10.2 WBS / Gantt |
| `DailyDiaryScreen` | §11 Daily Diary |
| `ProcurementScreen` | §16 Procurement |
| `VendorMasterScreen` | §16.1 Vendor |
| `CompanyExpensesScreen` | §14 Company Finance |
| `CompanyAccountsScreen` | §14.3 Company Accounts |
| `ReceivablesScreen` | §17 Receivables |
| `ProjectFinancialsScreen` | §18 Project Budget & Margin |
| `StatementImportScreen` | §20.2 Company Import |
| `PersonalFinanceScreen` | §13 Personal Finance (existing tracker) |
| `CombinedFinanceView` | §3.3 Owner-only Combined View |

---

## Utils — Direct Reuse

| Utility | Reuse |
|---|---|
| `fileStorage.ts` | ✅ Direct — Hostinger upload works for SKS too |
| `authIdentity.ts` | ✅ Direct — same synthetic email pattern |
| `dateRange.ts` | ✅ Direct — generic date filter logic |
| `permissions.ts` | ✅ Adapt — rebuild `ROLE_PERMISSIONS` for SKS roles |
| `sessionStore.ts` | ✅ Direct |
| `taskFilters.ts` | ✅ Direct — date helpers are generic |
| `taskValidation.ts` | ✅ Adapt — SKS has different proof requirements |
| `pushNotifications.ts` | ✅ Direct |
| `migrate.ts` | ✅ Direct — same localStorage cleanup pattern |
| `dashboardMetrics.ts` | ✅ Adapt — `formatINR` reusable; dashboard KPIs are different |
| `leaveStorage.ts` | ✅ Direct |
| `userStorage.ts` | ✅ Adapt — SKS roles differ |

## Utils — Build New

| New Utility | Purpose |
|---|---|
| `boqCalculator.ts` | Line item totals, taxes, discounts, section subtotals |
| `budgetVariance.ts` | Actual vs budget, margin calculation |
| `procurementStatus.ts` | PR → PO → GRN → Bill state machine |
| `milestoneAgeing.ts` | Receivable overdue days calculation |
| `fyHelpers.ts` | India FY (Apr–Mar) boundaries, FY closure state |
| `auditLog.ts` | Actor + action + old/new value audit trail writer |

---

## Services — Pattern Reuse

All 14 Fenster services follow the same pattern: one table, typed CRUD, Supabase client. **Copy the pattern, not the code** — table names and types will be different. SKS will need ~22 services vs Fenster's 14.

New services needed: `leadActivityService`, `appointmentService`, `followUpService`, `requirementService`, `quotationService`, `boqService`, `designService`, `ganttService`, `expenseRequestService`, `procurementService`, `vendorService`, `companyAccountService`, `companyTransactionService`, `receivableService`, `payableService`, `projectBudgetService`, `auditLogService`, `statementImportService`.

---

## Auth & Context

| Item | Reuse |
|---|---|
| `AuthContext` | ✅ Direct — same Supabase Auth + synthetic email + managed users pattern |
| `AppDataContext` | ⚠️ Adapt — SKS has far more entity types; split into domain-specific contexts (CRM, Project, Finance) rather than one mega-context |

---

## Types

| Fenster Type | SKS |
|---|---|
| `UserRole` | Rebuild — SKS roles: Owner, Accounts, Project Coordinator, Site Engineer, Designer, QS, Purchase, Admin |
| `Permission` | Rebuild — SKS has 70+ permissions across more modules |
| `ManagedUser` | ✅ Reuse structure |
| `Task` | Adapt — add subtasks, dependencies, late-reason |
| `Lead` / `LeadStatus` | Adapt — add SLA, activity log, appointment link |
| `Project` / `ProjectStage` | Rebuild — SKS project stages are different |
| `Payment` | Adapt — milestone-based |
| `FileAttachment` | ✅ Direct |
| `StatusHistoryItem` | ✅ Direct |
| `LocationPin` | ✅ Direct |
| `CostBreakdown` | Adapt — SKS separates client quotation from internal cost plan |
| `Quotation` | Extend — add line items, BOQ, versioning |

---

## What to Build First (recommended order)

| Phase | What | Why |
|---|---|---|
| **P0** | Auth, User Management, Supabase schema, permissions | Foundation everything depends on |
| **P1** | CRM (Leads + Appointments + Follow-ups), Site Visits, Requirements | Core operating flow starts here |
| **P2** | Project Workspace, Tasks/Gantt, BOQ/Quotation, Design Center | Billable work and client-facing deliverables |
| **P3** | Company Expense lifecycle, Procurement, Receivables/Payables | Finance integration — eliminates duplicate entry |
| **P4** | Project Financials, Budget control, Company reporting | Management visibility |
| **P5** | Personal Finance boundary, Combined View, Advanced reports | Owner-only finance intelligence |

**Bottom line:** Fenster saves you ~60–70% of the UI primitive work (all the form fields, modals, badges, cards, layout shells, PWA infrastructure, auth). The business logic — BOQ, procurement, Gantt, expense lifecycle, dual-domain finance — is all new. Expect roughly 3× the screen count and 2× the data model complexity vs Fenster.
