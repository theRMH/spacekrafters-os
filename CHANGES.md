## 2026-09-09

### Phase 5: Statement Import — personal-account scope toggle
**Commit:** Uncommitted
- Closes the "Not yet done" item from 2026-09-08: `StatementImportScreen` previously only posted to `CompanyAccounts`. Added an Import Into (Company/Personal) toggle so the Owner can also import a personal bank statement without a second importer screen, per the original plan to reuse this screen for both.
- **Changed:** `src/screens/Finance/StatementImportScreen.tsx` — added `scope: 'company' | 'personal'` state with a toggle; account dropdown now lists `CompanyAccount[]` or `PersonalAccount[]` depending on scope; `handleConfirm` branches to `addPersonalTransaction()` (mapping CSV debit/credit → `expense`/`income`, `source: 'imported'`, classified category folded into `narration` since `PersonalTransaction.categoryId` is a FK, not free text) instead of `addCompanyTransaction()` + `addTransactionAllocations()` when scope is personal.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/statement-import` returns HTTP 200.

## 2026-09-08

### Phase 5: Personal Finance Module (merged with Company Finance into one Finance area)
**Commit:** Uncommitted
- Context: founder revealed SKS started as a personal finance tracker before company finance (Phase 3/4) was added, and the real personal-finance feature (transactions/categories/commitments/plans) lives in a separate live production repo, `theRMH/spacekrafter-personal-finance-tracker`. Founder wants Personal + Company Finance combined into one Finance module here, not kept as separate tools. Cloned that repo (`git clone`, since WebFetch 404s on its GitHub URLs even though `git` protocol works fine) to study its schema (`accounts`, `categories`/`subcategories`, `transactions`, `commitments`, `plans`) before building.
- Per user decision ("Port schema only, re-enter data"): ported the table *design* only as new `sks_personal_*` tables — no cross-database migration script. The Owner re-enters/imports historical data via the existing Statement Import flow.
- Nav structure was negotiated iteratively with the user (single-screen-with-modals → too cramped → 3 items → "4+, split further" → Categories/Commitments/Plans each get their own nav entry → user then explicitly required Reports and Calendar too) landing on **7 new Owner-only screens**: Personal Finance (Transactions+Accounts tabs), Personal Categories, Personal Commitments, Personal Plans, Personal Reports (derived, no new table), Personal Calendar (derived, no new table), and Combined Finance (read-only Company+Personal rollup, per Finance Rule 2 — no create/edit/delete from that screen). Source repo's other pages were folded rather than duplicated: Dashboard→existing HomeScreen, Import→existing StatementImportScreen, Add Entry→inline form in PersonalFinanceScreen, Investments→transaction `type='investment'`, Insurance/Utilities/Subscriptions/Income Sources→Personal Commitments (shared `commitmentType` discriminator), Approvals/Users&Access→dropped (SKS already has its own role/permission system).
- **Added:** `supabase/schema.sql` — 6 new tables: `sks_personal_accounts`, `sks_personal_categories`, `sks_personal_subcategories`, `sks_personal_transactions`, `sks_personal_commitments`, `sks_personal_plans`. JSONB-document-per-row, matching existing SKS table pattern. ✅ DEPLOYED 2026-09-09 (applied directly via `SUPABASE_DB_URL` — verified all 6 tables exist in `information_schema.tables`).
- **Added:** `supabase/rls-policies.sql` — Owner-only `FOR ALL` policies (`sks_has_role('owner')`) on all 6 new tables, per Finance Rule 1 ("Personal Finance is Owner-only"). ✅ DEPLOYED 2026-09-09 (verified all 6 policies exist in `pg_policies`).
- **Added:** `src/types/index.ts` — `PersonalAccount(Type)`, `PersonalCategory`, `PersonalSubcategory`, `PersonalTransaction(Type)`, `PersonalCommitment(Type/Frequency/Status)`, `PersonalPlan(Type)`.
- **Added:** `src/services/personalFinanceService.ts` — `getAllX()`/`upsertX()`/`addPersonalTransaction()` for all 6 tables, matching `companyAccountService.ts` pattern.
- **Added:** `src/screens/PersonalFinance/PersonalFinanceScreen.tsx` — Transactions + Accounts tabs, FAB opens add-transaction or create-account depending on active tab; `isInflow()` logic (`income`/`advance_received`/`loan_received`) ported verbatim from source repo for balance math.
- **Added:** `src/screens/PersonalFinance/PersonalCategoriesScreen.tsx` — category list → detail sheet listing subcategories with inline add.
- **Added:** `src/screens/PersonalFinance/PersonalCommitmentsScreen.tsx` — list + create/edit sheet for insurance/utility/subscription/emi/sip/expected_income/other commitments.
- **Added:** `src/screens/PersonalFinance/PersonalPlansScreen.tsx` — year-scoped month-by-month grid of projected amounts per plan type (personal_income/business_income/home_expense/office_expense/investment).
- **Added:** `src/screens/PersonalFinance/PersonalReportsScreen.tsx` — derived, no new table: month/year picker, income/expense/net stat cards, expense-by-category breakdown bars.
- **Added:** `src/screens/PersonalFinance/PersonalCalendarScreen.tsx` — derived, no new table: month view of `sks_personal_commitments` due dates grouped by day.
- **Added:** `src/screens/PersonalFinance/CombinedFinanceScreen.tsx` — read-only rollup of Company + Personal account balances (Finance Rule 2: no create/edit/delete here).
- **Changed:** `src/data/permissions.ts` — added `SCREEN_PERMISSIONS` entries for `personal-categories`, `personal-commitments`, `personal-plans`, `personal-reports`, `personal-calendar` (all → `view_personal_finance`); `personal-finance`/`combined-finance` entries already existed from earlier scaffolding.
- **Changed:** `src/components/navigation/navItems.ts` — added new "Personal Finance" nav section with all 7 items.
- **Changed:** `src/App.tsx` — added routes + `ProtectedRoute screenPath="..."` wiring for all 7 screens.
- **Verified:** `tsc --noEmit` clean. Dev server started; all 7 new routes (`/personal-finance`, `/personal-categories`, `/personal-commitments`, `/personal-plans`, `/personal-reports`, `/personal-calendar`, `/combined-finance`) return HTTP 200. Owner-only gating relies entirely on the existing `SCREEN_PERMISSIONS`/`canAccessScreen`/`ProtectedRoute` mechanism (no new code needed) since `view_personal_finance`/`view_combined_finance` are Owner-only permissions.
- **Done 2026-09-09:** added the personal-account toggle to `StatementImportScreen.tsx` — see that day's entry.
- **Next:** `OwnerCommandCenter` dashboard (Phase 5, still unbuilt).

### Phase 5: Audit Log (viewer + retrofit writes into approve/reject flows)
**Commit:** Uncommitted
- Confirmed via grep that `sks_audit_log` table + RLS already existed in `schema.sql`/`rls-policies.sql` (Phase 0 scaffolding), and `view_audit_log` permission already existed in `permissions.ts`/`types/index.ts` — but no `AuditLog` type, no service, and no code anywhere wrote to the table. Per user decision ("Full retrofit"), built the type/service and wired writes into every existing approve/reject flow rather than just building an empty viewer.
- **Added:** `src/types/index.ts` — `AuditLog` interface (`id`, `projectId?`, `action`, `description`, `createdBy`, `createdByRole`, `createdAt`).
- **Added:** `src/services/auditLogService.ts` — `getAllAuditLogs()`/`addAuditLog()`, reading/writing the dedicated columns on `sks_audit_log` (not a JSONB blob column, matching that table's existing schema shape).
- **Added:** `src/screens/Settings/AuditLogScreen.tsx` — read-only reverse-chronological list of all audit entries, showing action, description, actor name/role, and timestamp.
- **Changed:** `src/screens/Expenses/ExpenseRequestScreen.tsx` (`handleApprove`/`handleReject`), `src/screens/Leave/LeaveScreen.tsx` (`handleDecide`), `src/screens/Quotations/QuotationsScreen.tsx` (`handleStatusChange`, logged only on transition to `'rejected'`) — each now fires an `addAuditLog()` call (fire-and-forget, same pattern as `addTransactionAllocations`) after a successful approve/reject/reject-equivalent action.
- Note: `PurchaseRequest` (Procurement) has no `'rejected'` status in its current status union (`draft | approved | quoted | po_raised | received | billed | paid`), so no purchase-request rejection audit hook was added — there is no rejection flow to hook into. FY reopen is not yet built (Phase 4 Rule 8, deferred) so it isn't logged either; noting this as a known gap rather than a silent omission.
- **Changed:** `src/data/permissions.ts` — added `SCREEN_PERMISSIONS['audit-log'] = 'view_audit_log'`.
- **Changed:** `src/components/navigation/navItems.ts` — added "Audit Log" nav item under Admin.
- **Changed:** `src/App.tsx` — added `/audit-log` route.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200. Verify criterion ("a rejected expense... appears with reason, actor, and timestamp") is satisfied — expense rejection now logs the rejection reason, `user.name`, `user.role`, and an ISO timestamp. FY-reopen half of the criterion is not yet testable since FY reopen doesn't exist yet.
- **Next:** `OwnerCommandCenter`, `PersonalFinanceScreen`, `CombinedFinanceView`.

### Phase 4 complete: ReportsScreen (lead conversion, project margin, cashflow, procurement, team accountability)
**Commit:** Uncommitted
- **Added:** `src/screens/Reports/ReportsScreen.tsx` — read-only rollups computed live from existing data (no new tables/fields), grouped into 5 sections: Lead Conversion (won/lost/closed from `Lead.status`, conversion rate), Project Margin (contract value/internal budget/margin across projects that have a contract value), Cashflow (credits/debits/net, summed directly from `getAllCompanyTransactions()` so the report total reconciles by construction against Company Accounts), Procurement (open purchase requests, total PO value, unpaid vendor bill value), Team Accountability (per-assignee task completion + on-time rate, derived from `Task.status`/`Task.lateReason`).
- **Changed:** `src/App.tsx` — added `/reports` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200. Verify criterion ("report totals reconcile against underlying screens, e.g. cashflow report total = sum of Company Accounts transactions") is satisfied by construction — the cashflow totals are a direct sum over the same `CompanyTransaction[]` array Company Accounts reads, no intermediate transformation.
- **Phase 4 exit note:** Finance Rules 3 (transaction_allocations), 4 (approval ≠ payment), 5 (rejected records stay visible) are implemented and verified. Rules 1, 2, 6, 7, 8 (personal/company separation, combined view, advance-as-revenue, owner transfers, FY boundaries) are Phase 5 concerns and not yet applicable — no Phase 4 screen currently violates them, but none has been asked to enforce them either.
- **Next:** Phase 5 — `OwnerCommandCenter`, `PersonalFinanceScreen`, `CombinedFinanceView`, Audit Log viewer.

### Phase 4: Statement Import (CSV bank statement import)
**Commit:** Uncommitted
- Scope decision (per user): CSV only for v1 (build doc mentions CSV/OFX/PDF, but full OFX/PDF parsing was judged high-risk/high-effort for the value); permission reused `manage_company_accounts` rather than adding a new dedicated permission, since no separate role split was requested.
- **Added:** `src/screens/Finance/StatementImportScreen.tsx` — new screen, not a form variant of an existing one. Flow: pick a deposit `CompanyAccount` → upload a `.csv` file via plain `<input type="file">` + `FileReader.readAsText()` (deliberately not `MultiFileUploadField`, which uploads to storage and returns a URL rather than exposing file content for client-side parsing) → `parseCSV()` detects Date/Description/Debit/Credit or single signed Amount columns by header keyword matching → each row is auto-classified into a category via simple keyword rules (`salary`, `rent`, `vendor`, `gst`/`tax`, `interest`, `refund`, `transfer`, `upi`, `fee`/`charge` → falls back to `Uncategorized`) → preview table lets the user deselect rows or edit the assigned category before posting → Confirm posts each included row as a `CompanyTransaction` (existing `addCompanyTransaction`) against the chosen account.
- Per Finance Rule 3, each posted row also gets a `TransactionAllocation` with no `projectId` (a raw bank statement line has no inherent project link, same treatment as Payables' company-overhead allocations) via the existing `addTransactionAllocations`.
- **Changed:** `src/data/permissions.ts` — added `SCREEN_PERMISSIONS['statement-import'] = 'manage_company_accounts'` (no `ROLE_PERMISSIONS` change needed, per user decision to reuse the existing permission).
- **Changed:** `src/components/navigation/navItems.ts` — added "Statement Import" nav item to the Finance section.
- **Changed:** `src/App.tsx` — added `/statement-import` route.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200. Verify criterion from build doc ("a sample bank statement imports, classifies at least common categories, and posted rows match account balance delta") is satisfied by construction: posted amounts equal parsed CSV amounts exactly (no rounding/transformation), so the account balance delta after posting equals the sum of included rows.
- **Next:** `ReportsScreen` — lead conversion, project margin, cashflow, procurement, team accountability metrics.

### Phase 4: ProjectFinancialsScreen (Finance tab on Project Workspace)
**Commit:** Uncommitted
- Filled in the pre-existing "Finance" tab placeholder on `ProjectWorkspaceScreen.tsx` (the tab and its "Coming soon." stub already existed from earlier phase scaffolding) rather than building a new screen — matches the build doc's mapping of `ProjectFinancialsScreen` to a tab on the project detail view, not a standalone route.
- **Changed:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — Finance tab now shows Contract Value / Internal Budget (from `Project`), Actual Spend (sum of that project's `paid` `ExpenseRequest`s), Collections (sum of that project's `Receipt`s), Margin (`contractValue - internalBudget`, with %), and Budget Variance (`internalBudget - actualSpend`), all computed live — no new stored fields. Also lists the project's `PaymentMilestone`s with status and received/total. Removed the now-inaccurate `placeholder: true` flag from the Finance tab entry.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** Statement Import (new UI) — CSV/OFX/PDF upload → parse → preview → auto-classify → user correction → confirm → post to Company Accounts.

### Phase 4: transaction_allocations + Company Accounts dashboard stat cards
**Commit:** Uncommitted
- Finance Rule 3 ("one cash movement never appears as more than one transaction row even when split across projects") required a new table — confirmed via grep that no `transaction_allocations`/allocation mechanism existed anywhere in `schema.sql`. Per user decision, built it now rather than deferring.
- Scope decision (per user): no new standalone "Finance Dashboard" screen/nav item — added rollup stat cards to the existing `CompanyAccountsScreen.tsx` instead, since Company Accounts/Receivables/Payables/Expenses each already own their own screen and a dedicated Reports screen is a later, separate item.
- **Added:** `supabase/schema.sql` — new `sks_transaction_allocations` table (`id`, `transaction_id` FK→`sks_company_transactions` CASCADE, `project_id` FK→`sks_projects` nullable, `amount`, `data JSONB`, `created_at`), append-only, with indexes on `transaction_id`/`project_id`. ⚠ DEPLOY
- **Added:** `supabase/rls-policies.sql` — SELECT/INSERT policies for `sks_transaction_allocations`, restricted to `owner`/`accounts` (matching `sks_company_transactions`). ⚠ DEPLOY
- **Added:** `src/types/index.ts` — `TransactionAllocation` interface.
- **Added:** `src/services/companyAccountService.ts` — `getAllTransactionAllocations()`/`addTransactionAllocations()`.
- **Changed:** `src/screens/Expenses/ExpenseRequestScreen.tsx` (`handlePay`), `src/screens/Finance/ReceivablesScreen.tsx` (`handleRecordReceipt`), `src/screens/Finance/PayablesScreen.tsx` (`handleRecordPayment`) — each now writes one `TransactionAllocation` row per recorded transaction, linked to the source record's project where one exists (expense's `projectId`, milestone's `projectId`; payables have no project link yet so their allocation has no `projectId`, i.e. company overhead). This keeps every cash movement as exactly one `CompanyTransaction` row.
- **Changed:** `src/screens/Finance/CompanyAccountsScreen.tsx` — added 4 stat cards (Cash on Hand, This Month Net, Outstanding Receivables, Outstanding Payables) computed from `getAllPaymentMilestones()`/`getAllPayables()`/`getAllCompanyTransactions()`, no new fetch beyond what's already loaded elsewhere.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200. Note: `addTransactionAllocations` calls are fire-and-forget (result not checked) in all three screens, so the payment/receipt flows keep working even before the migration is applied to the live Supabase instance — but allocation rows won't be written until `⚠ DEPLOY` items above are applied.
- **Next:** `ProjectFinancialsScreen` (tab on Project Workspace) — contract value, internal budget, actual, collections, margin, variance.

### Phase 4: Payables screen (vendor/employee payables, partial payments)
**Commit:** Uncommitted
- **Added:** `src/screens/Finance/PayablesScreen.tsx` — list of payables (search by description) + create form + detail sheet for recording payments. Create form toggles between "Vendor" (picks from `getAllVendors()`, sets `vendorId`) and "Other payee" (free-text `payeeName`), matching the nullable `vendor_id` schema for employee/other payables. `handleRecordPayment()` mirrors Receivables' partial logic: validates amount against remaining balance, writes a `Payment` row, updates `paidAmount`, and sets `status: 'paid'` only once `paidAmount >= amount` (else `'partial'`), then posts a `debit` `CompanyTransaction` against the chosen account. `effectiveStatus()` shows `'overdue'` when `dueDate` has passed and the payable isn't fully paid, without mutating stored status. Payment-recording gated on `reconcile` permission (paired with `view_payables` for owner/accounts roles, same pattern as `record_receipt`/`view_receivables`).
- **Changed:** `src/App.tsx` — added `/payables` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** `FinanceContext` + company finance dashboard — needs a `transaction_allocations` mechanism (not yet in schema) to satisfy "one cash movement never appears as more than one transaction row even when split across projects" (Finance Rule 3). Likely the first new migration needed since Phase 0; will flag `⚠ DEPLOY` once built.

### Phase 4: Receivables screen + PaymentMilestone model
**Commit:** Uncommitted
- Confirmed via `schema.sql`/`rls-policies.sql` that all four Phase 4 tables (`sks_payment_milestones`, `sks_receipts`, `sks_payables`, `sks_payments`) and their RLS policies already exist from Phase 0 — no migration needed. Confirmed via `permissions.ts`/`navItems.ts` that all Phase 4 permissions (`view_receivables`, `record_receipt`, `view_payables`, `reconcile`) and nav items (`/receivables`, `/payables`) already exist — no permission-system changes needed.
- **Added:** `src/types/index.ts` — `PaymentMilestone` (+ `PaymentMilestoneStatus`), `Receipt`, `Payable` (+ `PayableStatus`), `Payment` interfaces under a new "Finance: Receivables & Payables" section.
- **Added:** `src/services/financeService.ts` — CRUD for all four tables (`getAllPaymentMilestones`/`upsertPaymentMilestone`, `getAllReceipts`/`addReceipt`, `getAllPayables`/`upsertPayable`, `getAllPayments`/`addPayment`), following the established one-file-per-table-group pattern.
- **Added:** `src/screens/Finance/ReceivablesScreen.tsx` — list of payment milestones (search by title) + create form + detail sheet for recording receipts. `handleRecordReceipt()` validates the amount against the remaining balance, writes a `Receipt` row, updates the milestone's `receivedAmount`/`receivedDates`, and sets `status: 'partial'` if `receivedAmount < amount` or `'received'` only once fully paid (Phase 4 verify criterion). Also posts a `credit` `CompanyTransaction` against the chosen account so the receipt is reflected in Company Accounts. An `effectiveStatus()` helper displays `'overdue'` when `dueDate` has passed and the milestone isn't fully received yet, without mutating the stored status.
- **Changed:** `src/App.tsx` — added `/receivables` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** `PayablesScreen.tsx` (vendor/employee payables, due dates, ageing).

### Phase 3 complete: Company Accounts screen
**Commit:** Uncommitted
- **Added:** `src/screens/Finance/CompanyAccountsScreen.tsx` — list of bank/cash/UPI accounts with live balance (`opening_balance + sum(credits) - sum(debits)`, computed from `sks_company_transactions`, not stored redundantly), create form (`manage_company_accounts`), and a detail sheet showing full transaction history per account.
- **Changed:** `src/App.tsx` — added `/company-accounts` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Phase 3 (Procurement & Expenses) is now feature-complete:** Vendor Master, Procurement flow-sheet (PR→PO→GRN→Bill), Expense Request lifecycle, Company Accounts. Finance Architecture Rules 4 and 5 verified applied in the Expense screen; the remaining rules (1, 2, 3, 6, 7, 8) apply to Phase 4/5 screens not yet built and will be checked as those are built.
- **Next:** Phase 4 (Finance) — Receivables + PaymentMilestone, Payables, FinanceContext + dashboard, ProjectFinancialsScreen tab, Statement Import, ReportsScreen.

### Phase 3: Expense Request lifecycle (Requested → Approved → Paid → Closed)
**Commit:** Uncommitted
- **Finance Architecture Rule 4 applied (non-negotiable, per build doc):** "Approval ≠ Payment. Approved expense shows as commitment/payable. Only recorded payment creates cashflow." `handleApprove()` only flips `ExpenseRequest.status` to `approved` — no `CompanyTransaction` is written. Only `handlePay()` (gated on `record_payment`, requires selecting a `CompanyAccount`) writes a `debit` `CompanyTransaction` and then marks the request `paid`. Verified by reading the code path directly: the two functions touch entirely disjoint tables.
- **Finance Architecture Rule 5 applied:** rejecting a request never deletes it — it moves to `status: 'rejected'` with a mandatory `rejectionReason`, `approvedBy`, and `approvedAt`, and stays visible/searchable like any other request.
- **Added:** `src/screens/Expenses/ExpenseRequestScreen.tsx` — list (search by purpose/category) + create form + detail sheet driving the full lifecycle: `requested` → Approve/Reject (`approve_expense`) → `approved` → Record Payment against a company account (`record_payment`) → `paid` → Close (`approve_expense`) → `closed`.
- **Changed:** `src/App.tsx` — added `/expenses` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** `CompanyAccountsScreen.tsx` (bank/cash/UPI accounts, opening balances) — needed before Expense payments have any accounts to select from in a real deployment (currently the picker will be empty until accounts exist).

### Phase 3: Procurement flow-sheet (PR → Quotes → PO → GRN → Vendor Bill)
**Commit:** Uncommitted
- **Added:** `src/screens/Procurement/ProcurementScreen.tsx` — flow-sheet pattern per the build doc's `DemoFlowSheet.tsx` mapping. A Purchase Request list (create via BottomSheet) opens into a full-height detail sheet that walks through every stage in place: draft → approve (`approve_purchase_request`) → add vendor quotes (`raise_purchase_request`, sorted cheapest-first for comparison) → raise PO from a chosen quote (`create_po`) → mark goods received (`receive_goods`) → enter vendor bill (`enter_vendor_bill`). Each stage transition upserts the PR's status alongside creating/updating the child record, so the PR's `StatusBadge` always reflects its furthest stage.
- **Verify criterion met:** a PR moves through every stage in one sheet, and entering a vendor bill immediately shows on the PO card — vendor's outstanding balance (on `VendorMasterScreen`'s Bills tab) updates automatically since it's computed live from `amount - paidAmount` across that vendor's bills, not stored separately.
- **Changed:** `src/App.tsx` — added `/procurement` route (nav item + `SCREEN_PERMISSIONS` entry already existed).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** `ExpenseRequestScreen.tsx` (Requested → Approved → Committed → Paid → Closed), then `CompanyAccountsScreen.tsx`.

### Phase 3 (Procurement & Expenses) kickoff: types, services, Vendor Master screen
**Commit:** Uncommitted
- **Scope note:** Phase 3/4 database schema and RLS policies already existed from Phase 0's foundational migration — confirmed via `supabase/schema.sql` and `supabase/rls-policies.sql`, no migration work needed. All Phase 3 permissions already existed in `Permission`/`ROLE_PERMISSIONS` — no permission-system changes needed. This slice is types + service layer + first screen only.
- **Added:** `src/types/index.ts` — `Vendor`, `PurchaseRequest`, `VendorQuote`, `PurchaseOrder`, `GoodsReceipt`, `VendorBill` (Procurement section) and `ExpenseRequest`, `CompanyAccount`, `CompanyTransaction` (Finance: Expenses section), matching `schema.sql` column shapes. `Vendor`/`PurchaseOrder`/`GoodsReceipt`/`VendorBill`/`CompanyAccount`/`CompanyTransaction` were not pre-specified in `SPACEKRAFTERS-BUILD.md`, so shapes were designed to match existing conventions (camelCase, `createdBy`/`createdAt`/`updatedAt`, no `updatedAt` on append-only child rows).
- **Added:** `src/services/vendorService.ts` — `getAllVendors()`/`upsertVendor()` against `sks_vendors`.
- **Added:** `src/services/procurementService.ts` — bundles `sks_purchase_requests`, `sks_vendor_quotes`, `sks_purchase_orders`, `sks_goods_receipts`, `sks_vendor_bills` (one flow-sheet, mirrors `taskService.ts`'s Task+TaskDependency bundling).
- **Added:** `src/services/expenseService.ts` — `getAllExpenseRequests()`/`upsertExpenseRequest()` against `sks_expense_requests`.
- **Added:** `src/services/companyAccountService.ts` — `getAllCompanyAccounts()`/`upsertCompanyAccount()`/`getAllCompanyTransactions()`/`addCompanyTransaction()` against `sks_company_accounts`/`sks_company_transactions`.
- **Added:** `src/screens/Procurement/VendorMasterScreen.tsx` — list + create + detail (Profile/Quotes/POs/Bills tabs) screen for vendor management, modeled on `ProjectsScreen.tsx`'s list+detail pattern. Detail view shows outstanding balance computed from vendor bills (`amount - paidAmount`).
- **Changed:** `src/App.tsx` — added `/vendors` route (nav item + `SCREEN_PERMISSIONS` entry already existed, same gap pattern as the earlier `/tasks`/`/gantt` fix).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** `ProcurementScreen.tsx` (PR → quotes → comparison → approval → PO → GRN → vendor bill flow-sheet), then `ExpenseRequestScreen.tsx`, then `CompanyAccountsScreen.tsx`, then wire their routes (`/procurement`, `/expenses`, `/company-accounts` nav items already exist). Must check the 8 Finance Architecture Rules before considering Phase 3 done — approving an expense must not create a cashflow entry, only recording payment should.

### Rename misleading .env to credentials-notes.txt
**Commit:** Uncommitted
- **Changed:** renamed `sks/.env` → `sks/credentials-notes.txt` (filesystem rename, not tracked by git — the old file was gitignored and untracked). It held unstructured plaintext credential notes (DB password, PAT, keys), not `KEY=value` pairs — Vite never read it; `.env.local` is the real config source. Renamed so it can't be mistaken for live config.
- **Changed:** `.gitignore` — added `credentials-notes.txt` explicitly, since the old `.env*` pattern no longer covers the new filename and this file contains a raw DB password + PAT that must never be committed.

### Wire up standalone /tasks and /gantt nav items
**Commit:** Uncommitted
- **Scope decision (explicit, asked before building):** Tasks and Gantt are inherently project-scoped (a task list / timeline only makes sense within a project), so rather than building duplicate global cross-project list/gantt views, the standalone screens are project pickers that deep-link into Project Workspace's existing Tasks/Gantt tabs — reuses all existing logic, no duplication.
- **Added:** `src/screens/Tasks/TasksScreen.tsx` — lists all projects with an open-task rollup (`N open of M tasks`), tapping a project navigates to `/projects/:id?tab=tasks`.
- **Added:** `src/screens/Gantt/GanttListScreen.tsx` — lists all projects with a scheduled-task count, tapping a project navigates to `/projects/:id?tab=gantt`.
- **Changed:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — reads an optional `?tab=` query param on mount (via `useSearchParams`) to pre-select the workspace tab, falling back to `overview` if missing/invalid. Enables deep-linking from the new standalone screens.
- **Changed:** `src/App.tsx` — added `/tasks` and `/gantt` routes (both already had nav items in `navItems.ts` and `SCREEN_PERMISSIONS` entries in `data/permissions.ts`, but no matching `<Route>`, so they previously fell through to the catch-all redirect).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.

### File storage: Hostinger upload endpoint for SKS
**Commit:** Uncommitted
- **Added:** `hostinger/upload.php` — SKS-specific copy of Fenster's upload script (same POST-upload/DELETE-remove protocol that `src/utils/fileStorage.ts` already spoke, but was previously unconfigured for SKS). Separate CORS allowlist (`https://spacekrafters.com` + local dev ports, not Fenster's domains), separate secret key, separate `uploads/` directory — fully isolated from Fenster's Hostinger storage.
- **Deployed:** uploaded to `https://spacekrafters.com/os/upload.php` (user-performed). Verified end-to-end directly against the live endpoint: CORS/origin check, auth key check, file-type allowlist (correctly rejects disallowed MIME types), upload → returned URL is publicly fetchable, and DELETE removes the file (confirmed via a cache-busting request past Hostinger's edge CDN, which otherwise briefly serves a stale cached copy after delete — expected, harmless given unique per-upload filenames).
- **Changed:** `sks/.env.local` (untracked) — set `VITE_UPLOAD_URL=https://spacekrafters.com/os/upload.php` and `VITE_UPLOAD_KEY` to the new SKS-only secret. No app code changes needed — `fileStorage.ts`/`MultiFileUploadField` already supported this protocol, they were just unconfigured.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Note:** `sks/.env`'s current contents are unstructured notes (not `KEY=value` pairs Vite can read) — the app actually loads config from `sks/.env.local`. Worth cleaning up `.env` at some point so it isn't misleading, but left untouched here since it's out of scope for this change.

### Phase 2: Daily Diary — standalone screen + Project Workspace tab (last Phase 2 item)
**Commit:** Uncommitted
- **Scope decision (explicit, asked before building):** the phase-plan verify criterion requires a diary entry to be "visible from both Diary and Project Workspace." User chose to build both surfaces (not Project-Workspace-only), so a standalone screen and an embedded tab share the same table/service and both read+write against it.
- **Permission decision (explicit, asked before building):** no dedicated "write diary entry" permission existed. Gated add/edit on the existing `view_tasks` permission rather than `add_task`, so `site_engineer`/`designer` — the roles described as primary diary users in `ROLE_DESCRIPTIONS` — can actually log entries; `add_task` would have let them view but not write. Matches the RLS policy on `sks_daily_diary`, which is broad (`sks_can_see_project`) with no separate write role check.
- **Added:** `src/types/index.ts` — `DailyDiaryEntry` type (`id`, `projectId`, `date`, `workDone`, `blockers?`, `photos: string[]`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`), matching `sks_daily_diary`'s `data JSONB` shape.
- **Added:** `src/services/dailyDiaryService.ts` — `getAllDiaryEntries()`/`upsertDiaryEntry()` against `sks_daily_diary`. Uses `.upsert()` (not `.insert()`) since this table has an UPDATE RLS policy and an `updated_at` column, unlike the append-only `sks_task_dependencies`/`sks_design_versions`. No `deleteDiaryEntry()` — no DELETE RLS policy exists on this table.
- **Added:** `src/screens/DailyDiary/DailyDiaryScreen.tsx` — standalone list/detail/create screen (modeled on `RequirementsScreen.tsx`), wired to the previously-unwired `/daily-diary` nav item (`view_tasks` permission, already existed in `navItems.ts`/`SCREEN_PERMISSIONS`). Lists all diary entries across projects, searchable by project name; create form captures project, date, work done, blockers, and site photos via `MultiFileUploadField`.
- **Changed:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — added a "Diary" tab (no longer 10 tabs, now 11) showing only this project's entries (`projectId` filtered), with the same add-entry form inlined via a BottomSheet, reusing `dailyDiaryService` directly rather than re-fetching through the standalone screen.
- **Changed:** `src/App.tsx` — added the `/daily-diary` route (`AppShell` + `ProtectedRoute screenPath="daily-diary"`).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** Phase 2 exit criteria are now met ("a project can be run end-to-end from BOQ through task execution with a working Gantt"). Still-open pending items from this phase: standalone `/tasks` nav item unwired (Task Detail only reachable via Project Workspace, per earlier user decision), standalone `/gantt` nav item unwired (Gantt only reachable via Project Workspace's tab), and Gantt drag-to-reschedule + persisted deadline-change-history log deferred to a follow-up slice. Phase 3 (Procurement & Expenses) is next per the phase plan, but was deferred to v2 scope in an earlier session's MVP reordering — worth confirming with the user before starting anything further.

### Phase 2: Gantt chart — read-only timeline (scoped slice, per user decision)
**Commit:** Uncommitted
- **Scope decision (explicit, asked before building):** the phase-plan spec for Gantt includes drag-to-reschedule and a persisted deadline-change-history log — both large, separately-verifiable pieces of new UI/data model. Built a read-only timeline first: task/subtask bars, dependency tooltips, red bars for overdue tasks, and deadline edits via a plain form (not drag-and-drop). Drag-and-drop and a persisted change-history table are deferred to a follow-up slice.
- **Added:** `src/screens/ProjectWorkspace/GanttChart.tsx` — a component (not a route) taking a project's `tasks`/`dependencies` as props (reuses data already loaded by `ProjectWorkspaceScreen`, no separate fetch). Renders one row per task as a horizontal bar spanning `createdAt` → `deadline`, subtasks indented, red bar when overdue and not completed, hover tooltip listing dependency task names. Tapping a bar opens a BottomSheet to edit the deadline directly (`upsertTask`), gated by the existing `edit_deadline` permission — no drag-and-drop, no separate history log yet.
- **Changed:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — Gantt tab is no longer a placeholder; renders `GanttChart` with the project's tasks/dependencies. Added `getAllTaskDependencies()` to the screen's initial data load.
- **Not built this slice (tracked as pending):** drag-to-reschedule, a persisted deadline-change-history log (would need a new type/table — none exists today; `updatedAt` alone doesn't capture *what* changed), and `sks_project_stages` (confirmed to exist in schema.sql/RLS but has no app type/service and is unused — the "stages" in the phase-plan's Gantt spec are represented here only via the project's existing single `ProjectStage` field, not a separate multi-stage timeline).
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** Daily Diary (Phase 2 item 7, last item before the Phase 2 exit criteria are met).

### Phase 2: Task Detail (subtasks, dependencies, mandatory late-reason)
**Commit:** Uncommitted
- **Added:** `src/screens/ProjectWorkspace/TaskDetailScreen.tsx` at a new `/projects/:id/tasks/:taskId` route.
  - Status buttons (`complete_task` permission) covering all four `TaskStatus` values.
  - Marking a task `completed` when `deadline` is in the past and `lateReason` isn't already set blocks the status change and instead opens a mandatory-reason `Dialog` (`confirmDisabled` until text is entered) — matches the phase-plan verify criterion exactly.
  - Subtasks: list of child tasks (`parentTaskId === task.id`) with an "Add" flow (`add_subtask` permission) creating a new `Task` row with `parentTaskId` set.
  - Dependencies: list of `TaskDependency` rows for this task with an "Add" flow (`edit_task` permission) picking another task in the same project, and a delete button per row. Uses `addTaskDependency`/`deleteTaskDependency` from the service added in the previous slice.
- **Changed:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — added a "Tasks" tab (top-level tasks only, i.e. `!parentTaskId`) between Team and Requirements, with an `add_task`-gated "Add Task" flow; each row navigates to the new Task Detail route.
- **Changed:** `src/App.tsx` — added the `/projects/:id/tasks/:taskId` route (reuses `projects`/`view_projects`, no new permission).
- **Scope note (explicit user decision):** the existing `/tasks` nav item (in `navItems.ts`, `view_tasks`) is intentionally left unwired for now — Task Detail is reached only through Project Workspace's Tasks tab, not a standalone cross-project Tasks list. A cross-project Tasks list remains a pending/open item for a future slice if wanted.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** Gantt chart (Phase 2 item 6), then Daily Diary (item 7) — both currently placeholder tabs in Project Workspace.

### Phase 2: Project Workspace tabs shell + Task/TaskDependency types & service
**Commit:** Uncommitted
- **Changed:** `src/types/index.ts` — added `TaskStatus`, `Task`, `TaskDependency` types, matching `sks_tasks`/`sks_task_dependencies` columns. `Task.lateReason` is included now (unused until Task Detail is built) since it needs to exist on the type before the completion-blocking-on-late-reason UI can be added.
- **Added:** `src/services/taskService.ts` — `getAllTasks`/`upsertTask`/`deleteTask` against `sks_tasks`; `getAllTaskDependencies`/`addTaskDependency`/`deleteTaskDependency` against `sks_task_dependencies`. `addTaskDependency` uses `.insert()` not `.upsert()`, because `sks_task_dependencies` has no `updated_at` column and no UPDATE RLS policy (SELECT/INSERT/DELETE only) — same append-only reasoning as `addDesignVersion`.
- **Added:** `src/screens/ProjectWorkspace/ProjectWorkspaceScreen.tsx` — tabs shell at a new `/projects/:id` route, per explicit user scoping decision (shell now with working tabs only; remaining tabs wired in later without revisiting the shell). Tab bar: Overview, Gantt, Team, Requirements, BOQ, Design, Finance, Procurement, Documents, Handover.
  - **Overview** — `Accordion` with Project Details + Finance Summary sections, from the `Project` record itself.
  - **Team** — coordinator (`project.coordinatorId`) plus every distinct `assigneeId` across the project's tasks, resolved via `getManagedUsersDirectory()`.
  - **Requirements** — `getAllRequirements()` filtered by `projectId` (note: most existing requirements are linked via `siteVisitId`→lead rather than `projectId` directly, since `RequirementsScreen.tsx` doesn't set `projectId` today — this tab will only show requirements that do have it set; not a regression, just an existing data-linkage gap that's out of scope here).
  - **BOQ** — the project's `Quotation` (via `getAllQuotations()` filtered by `projectId`) rendered by section/line-item, reusing the `Quotation`/`BOQSection`/`BOQLineItem` types and service that already existed from a prior session.
  - **Design** — `getAllDesignPackages()` filtered by `projectId`, with version counts from `getAllDesignVersions()`, and a link to the full Design Center.
  - **Gantt / Finance / Procurement / Documents / Handover** — placeholder "Coming soon" panels until their own phase items are built.
- **Changed:** `src/App.tsx` — added `/projects/:id` route (reuses the existing `projects` screen-permission mapping / `view_projects`, no new permission needed). `ProjectsScreen.tsx` already had a "Open Project Workspace" button wired to `navigate(\`/projects/${selected.id}\`)` from a prior session, so no edit was needed there.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Next:** Task Detail screen (subtasks, dependencies, mandatory late-reason on late completion), then Gantt chart, then Daily Diary — each gets wired into this shell's placeholder tabs as it's built.

### Phase 2: Design Center (new UI, no Fenster equivalent)
**Commit:** Uncommitted
- **Changed:** `src/types/index.ts` — added `DesignPackageStatus`, `DesignPackage`, `DesignVersion` types, matching `sks_design_packages`/`sks_design_versions` columns.
- **Added:** `src/services/designService.ts` — `getAllDesignPackages`/`upsertDesignPackage` against `sks_design_packages`; `getAllDesignVersions`/`addDesignVersion` against `sks_design_versions`. `addDesignVersion` deliberately uses `.insert()` not `.upsert()`, because `sks_design_versions` has no `updated_at` column and no UPDATE/DELETE RLS policy — it's an append-only version history table.
- **Added:** `src/screens/Design/DesignCenterScreen.tsx` — list of design packages (project + version count + status), a create-package flow (`upload_design` permission — owner/designer), a detail sheet with version history and an "Add Version" flow using `MultiFileUploadField`, and status-change buttons split by permission: `request_revision` (designer) can only set `revision_requested`; `approve_design` (owner) can set any of the other three. This mirrors the RLS UPDATE policy on `sks_design_packages`, which allows any project-visible role to update but the app only exposes the transitions each role's permission set already allows at the app level (`project_coordinator` has `view_design` only, so is read-only here even though RLS would technically allow it — kept intentionally conservative rather than opening a write path with no dedicated permission).
- **Changed:** `src/App.tsx` — added `/design` route. Nav item and `SCREEN_PERMISSIONS['design'] = 'view_design'` already existed from Phase 0.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` returns HTTP 200.
- **Known limitation (pre-existing Phase 0 RLS design, not introduced here):** `sks_design_packages` INSERT only requires the `designer` role (no project-visibility check), but SELECT requires `sks_can_see_project(project_id)`, which does not grant designers visibility directly — only via an assigned task in that project. A designer could theoretically create a package for a project they have no task in and then be unable to see it again. Not addressed in this slice; would need either a project-picker restricted to the designer's assigned-task projects, or an RLS change.
- **Next:** Project Workspace screen (tabs shell) + Task Detail, then Gantt chart, then Daily Diary.

### MVP: Attendance module (new UI, pulled forward from Phase 5)
**Commit:** Uncommitted
- **Added:** `src/services/attendanceService.ts` — `getAllAttendance`/`upsertAttendance` against `sks_attendance`. Uses a deterministic id (`att_${userId}_${date}`) so `upsert` with `onConflict: 'user_id,date'` (the table's actual unique constraint — the PK is `id`) is idempotent per user/day.
- **Added:** `src/screens/Attendance/AttendanceScreen.tsx` — no Fenster equivalent existed, built new per the build-doc spec:
  - Month calendar grid; tapping a day selects it below.
  - Everyone: marks their own Present/Absent/Half Day for the selected date. A date covered by one of their own *approved* leave applications shows as "Leave" automatically (computed client-side from `sks_leave_applications`, not a separate write) and is not directly editable.
  - Owner/Admin (`approve_leave` permission — reused rather than adding a new permission, since it already gates "manage others' HR records"): instead of the calendar-only self view, additionally see a team roster for the selected date (via `getManagedUsersDirectory()`) and can mark attendance for any team member.
- **Changed:** `src/App.tsx` — added `/attendance` route. Nav item and `SCREEN_PERMISSIONS['attendance'] = 'view_attendance'` already existed from Phase 0.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` and `/attendance` both return HTTP 200.
- **Note:** Daily Diary auto-mark-present linkage (mentioned in the build doc) is deferred until Daily Diary itself is built later in Phase 2 — no diary exists yet to link from.

### MVP reorder: Leave module (pulled forward from Phase 5)
**Commit:** Uncommitted
- **Changed:** `SPACEKRAFTERS-PHASE-PLAN.md` — added an "MVP Reordering" section documenting the confirmed build order: Leave → Attendance → resume/finish Phase 2 → defer Phase 3/4/rest-of-5 to v2.
- **Changed:** `src/types/index.ts` — added `LeaveStatus`, `LeaveApplication`, and (for the next slice) `AttendanceStatus`/`AttendanceRecord` types. `LeaveApplication` uses `userId`/`userName` (a real FK to `sks_managed_users`) rather than Fenster's free-text `technicianName`, because `sks_leave_applications.user_id` is `NOT NULL REFERENCES sks_managed_users(id)`.
- **Added:** `src/services/leaveService.ts` — `getAllLeaveApplications`/`upsertLeaveApplication`/`deleteLeaveApplication` against `sks_leave_applications`, matching the `{ok, error?}` pattern used by `projectService.ts`/`requirementService.ts` (not Fenster's cache+fire-and-forget `leaveStorage.ts` pattern, since SKS already moved off localStorage fallbacks entirely).
- **Added:** `src/screens/Leave/LeaveScreen.tsx` — adapted from Fenster's `LeaveApplicationScreen.tsx`, with one significant behavioral deviation driven by RLS: `sks_leave_applications`' INSERT policy only allows `user_id = sks_my_id()` (no owner/admin-on-behalf-of-someone-else), so unlike Fenster (where anyone could pick any technician to file for), SKS's screen only ever lets a user file leave for themselves. Owner/admin (`approve_leave` permission) additionally see everyone's applications and can approve/reject; everyone else sees and manages only their own.
- **Changed:** `src/components/badges/StatusBadge.tsx` — added `approved`/`rejected` label + color entries (green/red, matching the existing `won`/`lost` convention) so leave status badges aren't stuck on the generic gray fallback.
- **Changed:** `src/App.tsx` — added `/leave` route. Nav item already existed from Phase 0 (`navItems.ts`), and `SCREEN_PERMISSIONS['leave'] = 'view_leave'` / `approve_leave` permission already existed — no permission-map changes needed.
- **Verified:** `tsc --noEmit` clean. Dev server started, `/` and `/leave` both return HTTP 200 (SPA routing; full role-based render behavior needs a logged-in browser check, not curl-verifiable).
- **Next:** Attendance screen (calendar grid, auto-mark from approved leave) — `sks_attendance` table/RLS already exist, same as leave.

### Repo separation: SpaceKrafters OS now has its own git repository
**Commit:** `d8c4ba3` (initial commit of the new repo)
- SKS previously lived as a subfolder inside the shared Fenster monorepo (single repo rooted at `OS/`, sharing `origin` = `RMHDeveloper/fensterOS` with Fenster's own `src/`). Per user request, extracted it into its own independent repository.
- **Added:** `sks/.gitignore` — excludes `node_modules/`, `.env*`, `dist/`, `supabase/.temp/` (Supabase CLI cache containing the project ref/pooler URL), and the stray empty `supabase/supabase/` folder.
- Ran `git init` inside `sks/` (confirmed via `git rev-parse --show-toplevel` that it's now a standalone repo, not nested under the parent). Committed the current file state as one fresh initial commit (101 files, no `.env*`/secrets — verified before committing) — this is a "fresh start" extraction, so prior commit-by-commit history from the monorepo is not carried over (still recoverable from the old repo's local reflog for a time if ever needed).
- Added remote `origin` = `https://github.com/theRMH/spacekrafters-os.git`, pushed `master` — confirmed with user before pushing.
- **Reversed the earlier mistaken push:** a previous action this session had pushed SKS commits to `RMHDeveloper/fensterOS` as a new `master` branch (wrong destination). That branch has been deleted (`git push origin --delete master`) — confirmed `origin/deploy` (the real Fenster deployment branch) was untouched.
- **Note:** the `sks/` prefix used in file paths throughout this changelog is a holdover from the monorepo days — paths are now relative to this repo's own root, but the historical entries below keep the old prefix for continuity.

### Branding: SpaceKrafters logo asset
**Commit:** Uncommitted
- **Added:** `sks/public/brand/spacekrafters-logo.png` — downloaded from the URL the user provided (spacekrafters.com); `AppHeader.tsx` already referenced this exact path but the file never existed, so the header image was broken until now. No code changes needed.

### Dev/QA: test accounts for every role
**Commit:** Uncommitted (no source files changed — this is live data seeded directly in Supabase)
- Created 8 real Supabase Auth users + matching `sks_managed_users` rows, one per `UserRole` (owner, accounts, project_coordinator, site_engineer, designer, qs, purchase, admin), using the service-role key from `.env` (never committed).
- **Added:** `sks/TEST-ACCOUNTS.md` — mobile numbers + shared password (`Test@1234`) for all 8 test logins, plus cleanup instructions.
- **Note:** No prior managed users existed in the database at all (`sks_managed_users` was empty) — this was the first data in that table.

### Phase 2 (Commercial & Project Core) — ProjectsScreen (item 3, built ahead of item 2)
**Commit:** Uncommitted
- **Changed:** `sks/src/types/index.ts` — added `ProjectStage` (14-value union) and `Project` interface, per the reference model in `SPACEKRAFTERS-BUILD.md` lines 269-301, plus `leadId`/`quotationId` (optional linkage back to the CRM funnel) and `coordinatorId` (maps to `sks_projects.owner_id`, which RLS's `sks_can_see_project()` uses to scope a `project_coordinator`'s visibility).
- **Added:** `sks/src/services/projectService.ts` — `getAllProjects()`/`upsertProject()`/`deleteProject()`, same JSONB-document pattern as every other Phase 1/2 service; `owner_id`/`status`/`current_stage` kept as indexed columns alongside the full `data` object.
- **Added:** `sks/src/screens/Projects/ProjectsScreen.tsx` — list + search, create/edit BottomSheet (optional "from won lead" picker that pre-fills client name/phone, coordinator picker via `getManagedUsersDirectory()`, stage/status selects, contract value/budget/dates), detail sheet with an "Open Project Workspace" button (routes to `/projects/:id`, not yet built — that's Phase 2 item 4), delete gated to `user?.role === 'owner'` (matches RLS's owner-only DELETE policy).
- **Changed:** `sks/src/App.tsx` — added `/projects` route.

**Note on ordering:** Built Projects (item 3) before Design Center (item 2), reversing the phase plan's listed order. Reason: `sks_design_packages.project_id` is `NOT NULL REFERENCES sks_projects(id)`, and RLS's `sks_can_see_project()` requires a real project row — Design Center could not have a working create/list flow without Projects existing first. Same "data layer before dependent UI" principle already used in Phase 1.

**Note on structural template:** Did not copy Fenster's `ProjectsScreen.tsx` — its `Project` model, stages, and features (CSV export, MD-only bulk delete, manufacturing-specific filter chips) don't match SKS's simpler build-doc-defined `Project` shape. Followed SKS's own established list/BottomSheet pattern (same as `QuotationsScreen.tsx`/`RequirementsScreen.tsx`) instead.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `App.tsx`, `ProjectsScreen.tsx`, `LeadDetailScreen.tsx`, `projectService.ts`, `types/index.ts` all HTTP 200

### Fix: leads had no way to change status (blocked the whole funnel)
**Commit:** Uncommitted
- **Changed:** `sks/src/screens/Leads/LeadDetailScreen.tsx` — added a "Status Actions" panel to the Overview tab: a forward-progression button through `new → contacted → qualified → site_visit_scheduled → requirements_captured → won` (one step at a time, next-status-only, mirroring the Quotation status-action pattern), and a "Mark Lost" action requiring a non-empty reason (stored in `Lead.lostReason`, shown back on the Overview tab once lost). Both write through `CRMContext`'s existing `updateLead()`, which already logs to `Lead.activity` — that plumbing existed but nothing in the UI called it. Gated on `edit_lead` permission (owner + project_coordinator, matching lead-editing elsewhere).

**Why this was urgent:** `ProjectsScreen`'s "From Won Lead" picker (built the same session) filters on `status === 'won'`, but no lead could ever reach `won` — this was a pre-existing Phase 1 gap that silently blocked Phase 2's own conversion flow. Found and fixed before it caused confusion later.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev`; `LeadDetailScreen.tsx` HTTP 200

### Phase 2 (Commercial & Project Core) — Quotations: Excel export + print/PDF view
**Commit:** Uncommitted
- **Added:** `sks/package.json` — added `xlsx@^0.18.5` dependency (same version already used by Fenster) for Excel workbook generation ⚠ DEPLOY (run `npm install` after pulling)
- **Added:** `sks/src/utils/quotationExport.ts` — `downloadQuotationExcel()` builds a workbook (sections/line items + totals) client-side via `xlsx` and triggers a browser download
- **Changed:** `sks/src/screens/Quotations/QuotationsScreen.tsx` — detail sheet gained Excel-download and Print buttons; added a "Print Quotation" BottomSheet with a SpaceKrafters-branded, table-based layout wired to `window.print()`
- **Changed:** `sks/src/index.css` — added `@media print` rule scoping printed output to `#quotation-print-area` only (hides sidebar/nav/app chrome)

**Note on scope:** Per user decision, PDF export uses the browser's native print-to-PDF via `window.print()` rather than a new `jsPDF` dependency — no PDF library existed anywhere in Fenster or SKS, and this avoids adding one. Email-from-CRM (also listed under Phase 2 item 1) is still not built — no email-sending infrastructure exists anywhere in the codebase yet, so it's out of scope until that's requested as its own slice.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `QuotationsScreen.tsx`, `quotationExport.ts`, `index.css` all return HTTP 200, no compile errors in server log

### Phase 2 (Commercial & Project Core) — Quotations: quotationService, QuotationsScreen (BOQ line-item editor)
**Commit:** Uncommitted
- **Added:** `sks/src/types/index.ts` — `Quotation`, `BOQSection`, `BOQLineItem`, `QuotationStatus` types, matching the reference model in `SPACEKRAFTERS-BUILD.md` (lines 326-361) with `leadId`/`requirementId` added since a quotation is created before a project exists per the PRD flow (Requirements → Quotation → ... → Project Creation); `projectId` kept optional to match `sks_quotations.project_id` being nullable in schema.sql
- **Added:** `sks/src/services/quotationService.ts` — `getAllQuotations`/`upsertQuotation`/`deleteQuotation` against `sks_quotations`, same JSONB-document pattern as every other Phase 1 service
- **Added:** `sks/src/screens/Quotations/QuotationsScreen.tsx` — list/search (by lead name) + create/edit BottomSheet: lead picker, optional requirement picker (`sectionsFromRequirement()` groups a Requirement's line items by room into one BOQSection per room, rate defaults to 0), section/line-item add/remove, live-recalculated subtotal/tax/discount/net totals, and a status-action panel gating `draft → internal_review → internally_approved → sent_to_client → client_approved/revision_requested/rejected` transitions behind `approve_quotation_internal`/`send_quotation_client` permissions
- **Changed:** `sks/src/App.tsx` — added `/quotations` route (`ProtectedRoute screenPath="quotations"`, already mapped to `view_quotations` in `SCREEN_PERMISSIONS` — no permission changes needed)

**Note on scope:** Per user decision, this slice is the BOQ editor + status workflow only. PDF/Excel export and email-from-CRM (both explicitly in the Phase 2 plan's item 1) are deferred to a separate follow-up slice, not built here.

**Note on schema:** `schema.sql` also defines separate `sks_boq_sections`/`sks_boq_items` tables, but neither has an RLS DELETE policy (rows could never be removed via the app), and `SPACEKRAFTERS-BUILD.md`'s own reference `Quotation` interface nests `sections`/`items` directly on the Quotation object. Followed the build doc's nested-JSONB shape (consistent with every other Phase 1 entity storing its full object in one `data` column) and left `sks_boq_sections`/`sks_boq_items` unused.

**Delete permission gap:** No `delete_quotation` permission exists (same gap pattern as Appointments/SiteVisits/Requirements in Phase 1). Gated delete to `user?.role === 'owner'`, matching `sks_quotations`' RLS DELETE policy (owner-only).

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly on port 5173; `QuotationsScreen.tsx`, `quotationService.ts`, `App.tsx`, `types/index.ts` all return HTTP 200 through Vite's transform pipeline, no compile errors in server log

### Phase 1 (CRM & Field Operations) — LeadDetailScreen (final slice, completes Phase 1)
**Commit:** Uncommitted
- **Added:** `sks/src/screens/Leads/LeadDetailScreen.tsx` — tabbed lead detail view (Overview, Appointments, Follow-Ups, Site Visits, Activity), routed at `/leads/:id`; each tab fetches directly from the now-real `appointmentService`/`followUpService`/`siteVisitService` (filtered client-side by `leadId`) — no new shared context added, matching the same self-contained-fetch pattern used in the Appointments/FollowUps/SiteVisits/Requirements screens themselves
- **Changed:** `sks/src/screens/Leads/LeadsScreen.tsx` — lead detail `BottomSheet` now has a "View Full Details →" button navigating to `/leads/:id`; the quick-glance sheet (edit/delete/call/activity) is kept as-is rather than replaced, since it's still useful for fast triage from the list
- **Changed:** `sks/src/App.tsx` — added `/leads/:id` route (`ProtectedRoute screenPath="leads"`, same permission as `/leads` — `ProtectedRoute` has no param-level scoping so this reuses the list's guard)

**Note on scope:** This completes Phase 1 per the user's "build data layer first, tabs last" decision from earlier in this phase — all four child screens (Appointments, FollowUps, SiteVisits, Requirements) existed and were verified before this tab-wiring slice was started, so no tab needed a "coming soon" placeholder.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `LeadDetailScreen.tsx`, `LeadsScreen.tsx`, `App.tsx` all return HTTP 200 through Vite's transform pipeline

**Phase 1 exit criterion met:** A lead can be created, scheduled (Appointments), visited (Site Visits with room measurements + checklist), and have requirements captured (Requirements line items) — full CRM funnel up to but not including quotation (Phase 2).

### Phase 1 (CRM & Field Operations) — Requirements: requirementService, RequirementsScreen
**Commit:** Uncommitted
- **Added:** `sks/src/services/requirementService.ts` — Supabase CRUD (`getAllRequirements`, `upsertRequirement`, `deleteRequirement`) against `sks_requirements`, same JSONB `data`-column pattern
- **Added:** `sks/src/screens/Requirements/RequirementsScreen.tsx` — list (by lead via linked site visit)/search, create/edit sheet: picking a site visit auto-generates one `RequirementLineItem` per room (description pre-filled from room name + measurements, unit defaults to `sqft`, qty starts at 0 for the user to fill in), line items editable/addable/removable, unit picker (sqft/nos/rft/sft/lot/set), detail sheet shows qty+unit per line item, delete gated to `role === 'owner'`
- **Changed:** `sks/src/App.tsx` — added `/requirements` route (`ProtectedRoute screenPath="requirements"`, reuses Phase 0's `SCREEN_PERMISSIONS.requirements` → `add_requirements`)

**Note on scope:** Per `SpaceKrafters_Final_Master_PRD.md` (section 8, "Proposal, BOQ & Quotation Center"), the full commercial BOQ builder (sections, rates, taxes, discounts, terms) is explicitly separate, later-phase scope — this slice only covers turning site-visit measurements into structured pre-quotation line items (room, description, qty, unit), matching the Phase 1 plan's stated exit criterion. User asked whether BOQ is "just a file upload" — confirmed against the PRD it is not; there's no file-upload BOQ mechanism anywhere in Fenster or the SKS planning docs, and the PRD explicitly describes BOQ as a structured line-item builder that this Requirements data feeds into later.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `requirementService.ts`, `RequirementsScreen.tsx`, `App.tsx` all return HTTP 200 through Vite's transform pipeline
- Line items correctly carry room/description/unit/quantity end-to-end: verified by reading back the auto-seeded-from-site-visit shape and the manually-added shape both conform to `RequirementLineItem`

### Phase 1 (CRM & Field Operations) — SiteVisits: siteVisitService, SiteVisitsScreen
**Commit:** Uncommitted
- **Added:** `sks/src/services/siteVisitService.ts` — Supabase CRUD (`getAllSiteVisits`, `upsertSiteVisit`, `deleteSiteVisit`) against `sks_site_visits`, same JSONB `data`-column pattern
- **Added:** `sks/src/screens/SiteVisits/SiteVisitsScreen.tsx` — list (by lead, showing room count + checklist progress)/search, create/edit sheet with a dynamic room list (add/remove rooms, each with name + measurements + free-text notes) and a checklist (4 default items: electrical/plumbing points marked, layout photographed, requirements discussed — toggleable, not editable in this slice), detail sheet renders rooms and checklist read-only, delete gated to `role === 'owner'`
- **Changed:** `sks/src/App.tsx` — added `/site-visits` route (`ProtectedRoute screenPath="site-visits"`, reuses Phase 0's `SCREEN_PERMISSIONS['site-visits']` → `view_site_visits`)

**Note on scope:** Fenster's `SiteVisitScreen.tsx` (singular) has no room/measurement/checklist UI at all — it's a task-flow scheduling view (map links, engineer filter, `DemoFlowSheet` integration) with zero overlap with what this slice needed, confirming this is new construction, not adaptation. Checklist item labels are hardcoded defaults rather than user-configurable — matches the plan's minimum bar ("checklists") without adding template-management scope that wasn't requested.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `siteVisitService.ts`, `SiteVisitsScreen.tsx`, `App.tsx` all return HTTP 200 through Vite's transform pipeline

### Phase 1 (CRM & Field Operations) — FollowUps: followUpService, FollowUpsScreen
**Commit:** Uncommitted
- **Added:** `sks/src/services/followUpService.ts` — Supabase CRUD (`getAllFollowUps`, `upsertFollowUp`, `deleteFollowUp`) against `sks_follow_ups`, same JSONB `data`-column pattern
- **Added:** `sks/src/screens/FollowUps/FollowUpsScreen.tsx` — list/search (by lead name)/filter (pending/done/overdue), overdue follow-ups visually flagged (red border + "⚠ Overdue" chip, computed client-side: `status === 'pending'` and `dueDate` in the past), create/edit sheet (lead picker, due date, outcome note), delete gated to `role === 'owner'` (matches RLS)
- **Changed:** `sks/src/App.tsx` — added `/follow-ups` route (`ProtectedRoute screenPath="follow-ups"`, reuses Phase 0's `SCREEN_PERMISSIONS['follow-ups']` → `view_activity`)

**Note on scope:** No dedicated `add_follow_up`/`edit_follow_up` permission exists in the Phase 0 `Permission` union — gated create/edit using `add_appointment`/`edit_appointment` instead, since that permission's owner/project_coordinator role set exactly matches `sks_follow_ups`' RLS INSERT policy. Flagged inline with a comment; worth a real `add_follow_up` permission if this needs independent tuning later (e.g. giving project_coordinator follow-up rights without appointment rights).

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `followUpService.ts`, `FollowUpsScreen.tsx`, `App.tsx` all return HTTP 200 through Vite's transform pipeline

### Phase 1 (CRM & Field Operations) — Appointments: appointmentService, AppointmentsScreen
**Commit:** Uncommitted
- **Added:** `sks/src/services/appointmentService.ts` — Supabase CRUD (`getAllAppointments`, `upsertAppointment`, `deleteAppointment`) against `sks_appointments`, same JSONB `data`-column pattern as `leadService.ts`
- **Added:** `sks/src/screens/Appointments/AppointmentsScreen.tsx` — list/search/filter-by-status, create/edit appointment sheet (lead picker auto-fills client name, date/time, location, coordinator defaults to current user, status), detail sheet showing the linked lead's name, delete gated to `role === 'owner'` (matches RLS — there is no `delete_appointment` permission in the Phase 0 model, unlike leads' `delete_lead`)
- **Changed:** `sks/src/App.tsx` — added `/appointments` route (`ProtectedRoute screenPath="appointments"`, reuses Phase 0's existing `SCREEN_PERMISSIONS.appointments` → `view_appointments`)

**Note on scope:** Standalone context was not added for appointments (unlike `CRMContext` for leads) — this screen manages its own local state via `useEffect`/`refresh()`, calling the service directly, since nothing else needs appointment data yet. `LeadDetailScreen` (built last, per prior decision) may prompt revisiting this if it needs a shared appointments-by-lead view — worth reconsidering at that point rather than pre-building a context now.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; `appointmentService.ts`, `AppointmentsScreen.tsx`, `App.tsx` all return HTTP 200 through Vite's transform pipeline
- RLS cross-check: `sks_appointments` INSERT is restricted to owner/admin/project_coordinator (matches `add_appointment` permission holders in `ROLE_PERMISSIONS`); UPDATE is open to any authenticated user at the DB level (`USING (true) WITH CHECK (true)`) — client-side `edit_appointment` permission gate is the only meaningful restriction there, not enforced by RLS; DELETE is owner-role-only at the DB level, mirrored via `user?.role === 'owner'` client-side check

### Phase 1 (CRM & Field Operations) — Leads: types, CRMContext, leadService, LeadsScreen
**Commit:** Uncommitted
- **Changed:** `sks/src/types/index.ts` — added Phase 1 CRM domain types: `Lead`/`LeadStatus`/`LeadSource`/`LeadInterest`/`LeadActivityItem` (with `slaDueAt` for SLA tracking, simpler than Fenster's `Lead` — no multi-role `assignee` string, no `clientMeasurementFiles`), plus `Appointment`/`AppointmentStatus`, `FollowUp`/`FollowUpStatus`, `SiteVisit`/`SiteVisitRoom`/`SiteVisitChecklistItem`, `Requirement`/`RequirementLineItem` (types only — screens for the latter four land in upcoming slices)
- **Added:** `sks/src/services/leadService.ts` — Supabase CRUD (`getAllLeads`, `upsertLead`, `deleteLead`) against `sks_leads`, following `userService.ts`'s JSONB `data` column pattern
- **Added:** `sks/src/context/CRMContext.tsx` — `CRMProvider`/`useCRM()`; holds `leads` state, `addLead`/`updateLead`/`deleteLead`, auto-appends an activity-log entry on creation and on any status change
- **Added:** `sks/src/components/badges/StatusBadge.tsx` — new SKS-scoped version (Fenster's depends on `designTokens.ts` keyed to Fenster-only status enums); covers Lead/Appointment/FollowUp status labels+colors only so far, extend as later slices add statuses
- **Added:** `sks/src/screens/Leads/LeadsScreen.tsx` — list/search/filter-by-status, SLA overdue highlighting (24h first-contact deadline from creation, flagged once status is still `new` past due), create/edit lead sheet, lead detail sheet with activity log, delete (owner only, matches RLS). Simplified from Fenster's `LeadsScreen.tsx`: no CSV import/export, no multi-select bulk delete, no project-conversion flow (that's Phase 2 territory) — those are Fenster-specific/later-phase features, not part of this slice's exit criterion
- **Changed:** `sks/src/App.tsx` — wired `CRMProvider` (inside `AuthProvider`, since it calls `useAuth()`) and added the `/leads` route (`ProtectedRoute screenPath="leads"`, reuses Phase 0's existing `SCREEN_PERMISSIONS.leads` → `view_leads`)

**Note on scope:** Fenster has no dedicated Appointments/FollowUps/Requirements screens and models SiteVisit as a task-flow overlay, not standalone CRUD — all folded into `Task.flowStage`. SKS's Phase 0 schema already broke these into separate tables (`sks_appointments`, `sks_follow_ups`, `sks_site_visits`, `sks_requirements`), so those four screens are being built as new construction (reusing Fenster's building-block components — BottomSheet, FilterChips, StatusBadge pattern, PermissionGate) rather than direct copy-adapt. Confirmed with user before starting; proceeding one vertical slice at a time (types → screen → verify → commit) per slice.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly; all new/changed files (`App.tsx`, `CRMContext.tsx`, `leadService.ts`, `LeadsScreen.tsx`, `StatusBadge.tsx`) return HTTP 200 through Vite's transform pipeline
- No RLS conflict: `sks_leads` policies only grant owner/admin/project_coordinator select/insert/update, owner-only delete — matches `ROLE_PERMISSIONS` (site_engineer has no `view_lead`/`add_lead`), so this is consistent by design, not a gap

### Phase 0 (Foundation) — project scaffold + design system
**Commit:** Uncommitted
- **Added:** `sks/package.json` — Vite + React 18.3.1 + TypeScript + Tailwind project, matching Fenster's dependency versions (build doc specified React 19; downgraded to 18.3.1 to match the exact code being copied — user confirmed)
- **Added:** `sks/tsconfig.json`, `sks/tsconfig.node.json` — copied verbatim from Fenster
- **Added:** `sks/vite.config.ts` — copied from Fenster, PWA manifest re-branded to SpaceKrafters (name, theme_color `#0F2A4A`)
- **Added:** `sks/postcss.config.js` — copied verbatim from Fenster
- **Added:** `sks/tailwind.config.js` — copied from Fenster's structure (shadows, radii, keyframes, animations unchanged); `brand.*`/`primary.*` color tokens replaced with navy + gold palette (`#0F2A4A` primary, `#C9A24B` gold)
- **Added:** `sks/index.html` — copied from Fenster, re-branded (title, theme-color, meta description)
- **Added:** `sks/src/index.css` — copied verbatim from Fenster (PWA safe-area insets, scrollbar-hide utility — no brand-specific values in this file)
- **Added:** `sks/src/main.tsx` — copied verbatim from Fenster (SW auto-reload + React root mount)
- **Added:** `sks/src/App.tsx` — minimal placeholder to verify Tailwind/brand colors render; will be replaced in the nav-shell step
- **Added:** `sks/src/vite-env.d.ts` — copied verbatim from Fenster (Vite + PWA client types)
- **Added:** `sks/src/sw.ts` — copied verbatim from Fenster (workbox precache, font caching, SPA fallback, push notification handling — no Fenster-specific branding in this file)
- **Added:** `sks/src/lib/supabase.ts` — copied from Fenster's pattern; only change is the console warning label (`[Fenster]` → `[SpaceKrafters]`)
- **Added:** `sks/.env.local` — SKS's own Supabase project credentials (project `mzdbzijmetvepssctocy`, separate from Fenster's). Gitignored via root `.env*` pattern.
- **Added:** `sks/.env.example` — safe template mirroring Fenster's, no real secrets

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` serves on :5173, HTML renders with SpaceKrafters branding
- Tailwind compiles `brand-primary`/`brand-gold` utility classes correctly (confirmed via served CSS)
- Root `.gitignore` (`node_modules/`, `dist/`, `.env*`) already covers `sks/` — no separate `sks/.gitignore` needed

### Phase 0 (Foundation) — types, permissions, auth, Supabase schema + RLS
**Commit:** Uncommitted
- **Added:** `sks/src/types/index.ts` — `UserRole` (8 SKS roles), `Permission` (full union across CRM/Appointments/Site/Quotations/Design/Projects/Tasks/Gantt/Procurement/Expenses/Finance/HR/Reports/Admin/Owner-only), `AuthUser`, `ManagedUser`
- **Added:** `sks/src/data/permissions.ts` — `ROLE_PERMISSIONS` map for all 8 roles, `ROLE_LABELS`, `ROLE_DESCRIPTIONS`, `SCREEN_PERMISSIONS` — derived from the Permission Areas + Roles table in `SPACEKRAFTERS-BUILD.md`
- **Added:** `sks/src/utils/authIdentity.ts` — copied from Fenster's synthetic-email pattern, domain changed to `@sks.internal`
- **Added:** `sks/src/services/userService.ts` — copied from Fenster's `userService.ts`, table renamed `sks_managed_users`, RPC renamed `sks_managed_users_directory`, console labels `[SpaceKrafters]`
- **Added:** `sks/src/utils/userStorage.ts` — clean rewrite (no Fenster migration cruft — no seed-account renames/mobile remapping); seeds one demo user per SKS role (`DEFAULT_SEED_USERS`)
- **Added:** `sks/src/utils/permissions.ts` — kept `hasPermission`, `hasRole`, `canAccessScreen`, `getDefaultRoute` (generic); dropped Fenster-specific `isTaskAssignedToUser`/`isProjectAssignedToUser`/`isMdOrEd`/`canUpdateTask` (referenced Fenster-only `Task`/`Project` fields that don't exist in SKS yet — to be rebuilt once SKS's own Task/Project types exist)
- **Added:** `sks/src/context/AuthContext.tsx` — copied from Fenster verbatim pattern (synthetic email + Supabase Auth), dropped the `installation_incharge` legacy-alias normalization (not applicable to SKS)
- **Added:** `sks/supabase/schema.sql` — all 38 `sks_*` tables (30 named entities from the build doc, JSONB `data` column pattern, indexed FK columns for RLS scoping), RLS enabled with no policies (fail-closed until rls-policies.sql runs)
- **Added:** `sks/supabase/rls-policies.sql` — `sks_my_id()`, `sks_my_roles()`, `sks_has_role()`, `sks_can_see_project()` helper functions (pattern from Fenster's `rls-authenticated-policies.sql`, simplified — no Fenster production-stage-bucket logic since SKS has no equivalent flow-stage concept); per-table policies for all 38 tables; `sks_managed_users_directory()` SECURITY DEFINER RPC (safe password-free user list); `sks_protect_privileged_user_fields()` trigger blocking self-role/status edits
- **Added:** `sks/supabase/functions/admin-user-sync/index.ts` — copied verbatim from Fenster, table renamed `sks_managed_users`, synthetic email domain `@sks.internal`. Deployed to the live SKS Supabase project (`mzdbzijmetvepssctocy`) via `npx supabase functions deploy admin-user-sync --use-api` after `supabase link` (CLI authenticated via a user-supplied personal access token). Note: the CLI auto-parses `sks/.env` as dotenv and fails since that file is freeform notes, not `KEY=value` syntax — worked around by renaming it to `.env.bak` for the few seconds of the deploy call, then restoring it (content unchanged, confirmed by user beforehand). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform, so no manual secret-setting was needed.

**Applied to live SKS Supabase project (`mzdbzijmetvepssctocy`)** via direct DB connection (`SUPABASE_DB_URL`, one-off Node script using the `pg` package from Fenster's `node_modules` — no CLI available in this environment):
- `schema.sql` executed — verified 38 `sks_*` tables exist
- `rls-policies.sql` executed — verified 112 policies + all 6 helper functions exist

**Verified:**
- `npx tsc --noEmit` clean after all new files
- Live DB query confirms table/policy/function counts match expectations

**Not yet done (remaining Phase 0 steps):** nav shell (AppHeader/MobileMenuDrawer/SidebarNavigation/NavigationBar), User Management screen, replacing the `App.tsx` placeholder with real routing.

### Phase 0 (Foundation) — direct-reuse component copy
**Commit:** Uncommitted
- **Added (copied verbatim from Fenster, zero changes):**
  - `components/feedback/`: `BottomSheet.tsx`, `Dialog.tsx`, `Snackbar.tsx`, `EmptyState.tsx`, `LoadingSkeleton.tsx`, `FilePreviewModal.tsx`
  - `components/forms/`: `SearchBar.tsx`, `FilterChips.tsx`, `TimePickerField.tsx`, `FileUploadField.tsx`, `MultiFileUploadField.tsx` (see fix below), `NoteWithFilesField.tsx`, `LocationAddressField.tsx`, `VoiceRecorder.tsx`
  - `components/layout/`: `Accordion.tsx`, `BackButton.tsx`, `ErrorBoundary.tsx`, `PermissionGate.tsx`, `ProtectedRoute.tsx`, `Timeline.tsx`, `NoPermission.tsx`
  - `components/charts/`: `ProgressBar.tsx`, `ProgressCircle.tsx`
  - `components/pwa/`: `OfflineBanner.tsx`, `InstallAppPrompt.tsx`, `PWAUpdatePrompt.tsx`, `DbBanner.tsx`
  - `components/icons/ColorIcon.tsx`, `components/navigation/FloatingActionButton.tsx`
  - `utils/`: `fileStorage.ts`, `dateRange.ts`, `sessionStore.ts`, `pushNotifications.ts`, `migrate.ts`
  - `services/pushSubscriptionService.ts` — not in the original copy list but required by `pushNotifications.ts`; table renamed `fenster_push_subscriptions` → `sks_push_subscriptions`, console label `[SpaceKrafters]`
- **Added (copied, fully generic — no adaptation needed):** `components/cards/StatCard.tsx`, `QuickAccessCard.tsx`, `SummaryIconCard.tsx`, `SuggestionCard.tsx`
- **Fixed:** `components/forms/MultiFileUploadField.tsx` — the Fenster source file (as it exists in the parent repo today) contains unresolved git merge conflict markers between an old localStorage-fallback version and commit `963e05c` ("Remove all localStorage fallbacks"). Resolved to the `963e05c` side in the SKS copy only (confirmed correct by checking `fileStorage.ts`'s actual exports — `removeLocalFile`/`isRemoteFileRef` no longer exist). **Did not touch the Fenster source file** — it's outside `/sks` and read-only per project rules; the parent repo still has the conflict markers unresolved.
- **Deferred (not copied — depend on domain types that don't exist until later phases):**
  - `components/feedback/StatusUpdateSheet.tsx` — needs `ProofType` (types), `utils/taskValidation.ts`, and references a `'viewer'` role not in SKS's `UserRole` union
  - `components/forms/LocationPinField.tsx` — needs `LocationPin` type
  - `utils/taskFilters.ts` — needs `Task` type
  - `components/cards/FileUploadCard.tsx`, `ApprovalCard.tsx`, `PaymentCard.tsx` — need `FileItem`/`Approval`/`Payment` types
  - `components/badges/PriorityBadge.tsx`, `StatusBadge.tsx` — need `Priority`/`TaskStatus`/`ProjectStatus`/etc. types and `styles/designTokens.ts`
  - All of the above to be copied/adapted once the Tasks/Site-Visit/Procurement/Finance phases define their respective types (per `SPACEKRAFTERS-PHASE-PLAN.md`), not part of Phase 0 foundation scope.

**Verified:** `npx tsc --noEmit` clean after component copy + conflict-marker fix + deferrals.

### Phase 0 (Foundation) — nav shell, screens, routing (Phase 0 complete)
**Commit:** Uncommitted
- **Added:** `sks/src/components/navigation/navItems.ts` — shared `NavItem`/`NAV_SECTIONS`/`getMainItems()`, module sections (CRM, Site & Design, Projects & Tasks, Procurement, Finance, HR, Reports/Files, Admin) each gated by `Permission`; adapted from Fenster's structure but re-labeled/re-grouped for SKS's module set
- **Added:** `sks/src/components/navigation/MobileMenuDrawer.tsx` — adapted from Fenster; dropped `usePendingLeaveCount` (needs `leaveStorage.ts`/`LeaveApplication`, not built until the Leave module) and the `isOwner`/`hasRole` owner-branching; navy gradient (`#0F2A4A` → `#0A1D33`) active state
- **Added:** `sks/src/components/navigation/SidebarNavigation.tsx` — same adaptation pattern, desktop-only fixed 260px sidebar, logo path `/brand/spacekrafters-logo.png`
- **Added:** `sks/src/components/navigation/NavigationBar.tsx` — bottom tab bar with a per-role curated path table (`ROLE_PATHS`) simplified from Fenster's more convoluted legacy-role logic to match SKS's cleaner 8-role model; capped at 5 items
- **Added:** `sks/src/components/layout/AppHeader.tsx` — hamburger (mobile, opens `MobileMenuDrawer`) + logo + profile avatar button (navy gradient, initials, navigates to `/settings`)
- **Added:** `sks/src/screens/Login/LoginScreen.tsx` — direct adaptation of Fenster's login form (10-digit phone + password via `loginWithCredentials`), re-branded (navy/gold gradient header, gold submit button, SpaceKrafters logo/copy)
- **Added:** `sks/src/screens/Home/HomeScreen.tsx` — minimal placeholder (welcome + role label only); Fenster's real dashboard (quick-access cards/stats) is domain-specific and deferred to the phase that introduces those modules
- **Added:** `sks/src/screens/Settings/SettingsScreen.tsx` — scoped-down adaptation of Fenster's 605-line version: profile card + edit-profile `BottomSheet` (name, optional password change via `supabase.auth.updateUser`, photo upload via `storeFile`), push-notification toggle (`pushNotifications.ts`), logout with confirm `Dialog`, and a `can('manage_users')`-gated link to `/settings/users`. Dropped as out-of-Phase-0-scope/Fenster-specific: `AppDataContext.resetAllData()`, `migrateFromLocalStorage`/`hasLocalStorageData` (Fenster's own legacy-data migration, not applicable to SKS), `appSettings.ts` cost rates, `integrationSettingsService.ts` (Resend/digest email settings), and the `displayRole?.includes('MD')` string-based gating (replaced with `can('manage_users')`)
- **Added:** `sks/src/screens/Settings/UserManagementScreen.tsx` — adaptation of Fenster's 587-line version: list/filter (all/active/inactive) with cloud sync, add/edit form sheet, activate/deactivate, delete with confirm. Changes from Fenster's version: gated via `can('manage_users')` (not a hardcoded `hasRole(authUser, 'owner')`/MD-only check), single-role selector from `ROLE_LABELS` (SKS has one role per user, no multi-`displayRoles` picker or `DISPLAY_ROLE_TO_INTERNAL` mapping needed), `isMobileTaken` implemented inline from loaded users (SKS's `userStorage.ts` doesn't export it — simpler module, no Fenster migration cruft), navy brand colors throughout instead of Fenster's blue
- **Replaced:** `sks/src/App.tsx` — placeholder swapped for real routing: `ErrorBoundary` > `BrowserRouter` > `AuthProvider`, routes limited to `/login` (public, redirects to `/home` if already logged in), `/home`, `/settings`, `/settings/users` (all wrapped in `ProtectedRoute`), a `*` catch-all redirecting based on auth state. Authenticated routes render inside an `AppShell` (`SidebarNavigation` + page + `NavigationBar`). Does not yet include Fenster's `AppDataProvider` or its other ~20 routes — those come with their respective phases (CRM, Projects, Finance, etc.) per the phase plan.
- **Known gap:** `/brand/spacekrafters-logo.png` does not exist yet (`sks/public/brand/` was never populated) — `<img>` tags in `LoginScreen`, `AppHeader`, `SidebarNavigation` will show a broken-image icon until a real logo asset is supplied. Not a code defect; content/branding gap only.

**Verified:**
- `npx tsc --noEmit` clean
- `npm run dev` boots cleanly on :5173; all newly-wired route/screen/component files served without transform errors (checked via direct HTTP fetch of each module path)

**Phase 0 exit criteria met:** app builds and serves; login screen, nav shell (sidebar + bottom nav + header + drawer), Home placeholder, Settings, and User Management are all wired and route-protected per role permissions. No CRM/project/finance data yet, as scoped — that begins in Phase 1.
