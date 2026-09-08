# SpaceKrafters OS — Phase-Wise Execution Plan

Companion to `SPACEKRAFTERS-BUILD.md` (the reference/pattern doc). This file sequences the actual work into phases with verification checkpoints, per [sks/CLAUDE.md](CLAUDE.md) goal-driven execution rules.

**All build output lives inside `sks/`** — app scaffold, `src/`, `supabase/`, everything. The parent `OS/src` tree is the read-only Fenster reference; nothing gets written there.

**Supabase project:** `mzdbzijmetvepssctocy` (dedicated to SKS — confirmed via `.env`, separate from Fenster's project). Credentials live in `sks/.env`, which is covered by the repo's root `.gitignore` (`.env*` pattern) — do not commit it, do not `git add -A` inside `sks/`.

**Changelog discipline:** per `sks/CLAUDE.md`, every session must append a dated block to `sks/CHANGES.md` (create it in Phase 0) listing files added/changed/deleted, with `⚠ DEPLOY` on any undeployed migration or edge function.

**Design system:** copy Fenster's `tailwind.config.js` + `src/index.css` structurally (shadows, radii, keyframes, PWA safe-area handling, `Inter` font) — only the `brand.*`/`primary.*` color tokens change. Since every Fenster component is styled via these semantic classes (not hardcoded hex), rebranding is a single-file edit.

```js
// SKS brand palette — dark blue + gold, replaces Fenster's green in tailwind.config.js
brand: {
  primary: '#0F2A4A',   // deep navy — primary actions, headers
  dark:    '#081B32',   // darker navy — pressed states, dark surfaces
  gold:    '#C9A24B',   // gold accent — highlights, CTAs, active states
  goldSoft:'#E8D9B0',   // soft gold — subtle accents, badges
  surface: '#EEF2F7',   // light blue-grey surface
  soft:    '#F5F3EC',   // warm off-white soft surface
  mint:    '#E9EEF5',   // replaces Fenster's "mint" slot — light card bg
  border:  '#D7DEE8',
  text:    '#0B1626',
  muted:   '#5B6B80',
},
primary: {
  50:  '#EEF2F7',
  100: '#DCE4EF',
  500: '#0F2A4A',
  600: '#0F2A4A',
  700: '#081B32',
  800: '#050F1D',
},
```
Mobile responsiveness (bottom nav vs. sidebar breakpoints, safe-area insets, BottomSheet slide animations) carries over unchanged from Fenster — it's structural, not brand-specific.

---

## MVP Reordering (client needs to start using the app)

Phases below stay as the source of truth for scope/verification per item, but **build order deviates** from Phase-number order for the MVP handoff:

1. **Leave** (Phase 5, item 1) — pulled forward, no dependency on Phase 3/4 Finance. Direct reuse of Fenster's `LeaveApplicationScreen`/`leaveStorage.ts`/`leaveService.ts`.
2. **Attendance** (Phase 5, item 2) — pulled forward with Leave, since it auto-marks from approved leave. `sks_attendance`/`sks_leave_applications` tables + RLS already exist from Phase 0 — zero schema work needed.
3. **Resume and finish Phase 2** — remaining items: Design Center → Project Workspace (tabs shell) + Task Detail → Gantt chart → Daily Diary.
4. **Phase 3 (Procurement & Expenses), Phase 4 (Finance), and the rest of Phase 5** (Owner Command Center, Personal Finance, Combined Finance, Audit Log) are deferred past MVP — v2 scope.

Reasoning: attendance/leave were the client's most urgent ask and carry no data dependency on unbuilt Finance features, so pulling them forward doesn't block or get blocked by anything.

---

## Phase 0 — Foundation

**Goal:** A running, empty SKS app with auth, nav shell, and all direct-reuse components in place — nothing domain-specific yet.

1. Scaffold Vite + React 19 + TypeScript + Tailwind project in `sks/`, create `sks/CHANGES.md`
   → verify: `npm run dev` serves a blank page with Tailwind working
2. Copy `tailwind.config.js` + `src/index.css` from Fenster, swap in the navy/gold palette (see Design System section below)
   → verify: a test element with `bg-brand-primary` and `text-brand-gold` renders the new colors
3. Create all `sks_*` Supabase tables + RLS policies (see table list in build doc)
   → verify: tables visible in Supabase dashboard, RLS enabled on each
4. Copy all "zero changes needed" components verbatim (feedback, forms, layout, charts, cards, PWA, icons, badges, nav button, utils)
   → verify: `tsc --noEmit` passes, no broken imports
5. Adapt `AuthContext`, `authIdentity.ts`, `userService.ts` — same synthetic-email + Supabase Auth pattern, SKS roles
   → verify: can create a user via Edge Function and log in with mobile number
6. Adapt `userStorage.ts` and `permissions.ts` — SKS roles (`owner`, `accounts`, `project_coordinator`, `site_engineer`, `designer`, `qs`, `purchase`, `admin`) and `ROLE_PERMISSIONS` map
   → verify: logging in as each seed role shows correct nav items only
7. Deploy `admin-user-sync` Edge Function (copy verbatim, update allowed-roles check)
   → verify: admin can create/deactivate a user end-to-end
8. Build nav shell — `AppHeader` (SKS branding), `MobileMenuDrawer`, `SidebarNavigation`, `NavigationBar` per the Navigation Structure section
   → verify: all module sections render, role-gated items hide correctly
9. User Management screen (direct reuse)
   → verify: owner/admin can list, create, edit, deactivate users

**Exit criteria:** Can log in as any of the 8 roles, see the correct nav shell, and manage users. No CRM/project/finance data yet.

---

## Phase 1 — CRM & Field Operations

**Goal:** Leads flow through to a site visit with requirements captured.

1. `CRMContext` (split out of monolithic `AppDataContext` per the adapt note) + `leadService.ts` (Supabase CRUD)
2. `LeadsScreen` — list/filter/search, SLA status, activity log, appointment link
   → verify: create/edit/filter a lead; SLA deadline displays and highlights when overdue
3. `LeadDetailScreen` — tabs: Overview, Appointments, Follow-ups, Site Visits, Activity log
4. `AppointmentsScreen` — client, date/time, location, coordinator, status
   → verify: appointment created from a lead appears linked on both sides
5. `FollowUpsScreen` — lead, due date, owner, status, outcome note
   → verify: overdue follow-ups are visually flagged
6. `SiteVisitsScreen` — adapt with room-wise measurements + checklists
   → verify: a site visit records multiple rooms with measurements
7. `RequirementsScreen` — converts site visit data into BOQ-ready line items
   → verify: requirement line items carry through with correct units/qty

**Exit criteria:** A lead can be created, scheduled, visited, and have requirements captured — full CRM funnel up to (not including) quotation.

---

## Phase 2 — Commercial & Project Core

**Goal:** Requirements become a priced, approved quotation; a project exists with tasks and a Gantt.

1. `QuotationsScreen` + **BOQ line-item table editor (new UI)** — sections, line items, subtotals, tax, versioning, draft → internal approval → client send
   → verify: adding/removing rows recalculates section + grand totals correctly; PDF/Excel export produces a branded file
2. `DesignCenterScreen` — design packages, versions, moodboards, revision tracking, client approval
   → verify: uploading a new design version preserves history of prior versions
3. `ProjectsScreen` — projects list with contract value, margin, design status
4. `ProjectContext` + `ProjectWorkspaceScreen` — tabs shell: Overview, Gantt, Team, Requirements, BOQ, Design, Finance, Procurement, Documents, Handover
   → verify: converting a won lead creates a project pre-populated with its requirements/quotation
5. `TaskDetailScreen` — subtasks, dependencies, mandatory late-reason on late completion
   → verify: completing a task past deadline blocks submission until a reason is entered
6. **Gantt chart (new UI)** — stages → tasks → subtasks, dependencies, drag-to-reschedule, deadline change history, red bar for late tasks
   → verify: dragging a task deadline updates dependent tasks and logs the change
7. `DailyDiaryScreen` — per-project log, blockers, photos, site progress
   → verify: diary entry for a project/date is visible from both Diary and Project Workspace

**Exit criteria:** A project can be run end-to-end from BOQ through task execution with a working Gantt.

---

## Phase 3 — Procurement & Expenses

**Goal:** Money going out is requested, approved, and tracked from PR to paid bill.

1. `VendorMasterScreen` — profile, quotations, POs, bills, payments, outstanding tabs
2. `ProcurementScreen` — flow-sheet pattern: PR → Vendor quotes → Comparison → Approval → PO → GRN → Vendor Bill
   → verify: a PR moves through every stage and the vendor's outstanding balance updates on bill entry
3. `ExpenseRequestScreen` — lifecycle: Requested → Approved → Committed → Paid → Closed
   → verify: approving an expense does **not** create a cashflow entry; only recording payment does (Finance Rule #4)
4. `CompanyAccountsScreen` — bank/cash/UPI accounts, opening balances, reconciliation
   → verify: a recorded payment reduces the correct account balance

**Exit criteria:** Full procurement and expense lifecycle enforced, with approval/payment kept distinct per finance rules.

---

## Phase 4 — Finance

**Goal:** Full company financial picture — receivables, payables, cashflow, reports — with the non-negotiable finance rules enforced everywhere.

1. `ReceivablesScreen` + `PaymentMilestone` model — milestone-based, partial receipts, ageing, overdue follow-up
   → verify: partial receipt against a milestone updates status to `partial`, not `received`, until fully paid
2. `PayablesScreen` — vendor/employee payables, due dates, ageing
3. `FinanceContext` — company finance dashboard (stat cards), rolling up expenses + receivables + payables to cashflow
   → verify: one cash movement never appears as more than one transaction row even when split across projects (`transaction_allocations`)
4. `ProjectFinancialsScreen` (tab on Project Workspace) — contract value, internal budget, actual, collections, margin, variance
5. **Statement Import (new UI)** — upload CSV/OFX/PDF → parse → preview → auto-classify → user correction → confirm → post to Company Accounts
   → verify: a sample bank statement imports, classifies at least common categories, and posted rows match account balance delta
6. `ReportsScreen` — lead conversion, project margin, cashflow, procurement, team accountability metrics
   → verify: report totals reconcile against underlying screens (e.g., cashflow report total = sum of Company Accounts transactions)

**Exit criteria:** Company finance is fully modeled with correct separation of approval vs. payment, immutable rejected records, and FY boundaries respected.

---

## Phase 5 — HR & Owner Intelligence

**Goal:** Attendance/leave operational; Owner has full visibility including personal finance, without breaking domain separation.

1. Leave module — direct reuse of `LeaveApplicationScreen`, `leaveStorage.ts`, `leaveService.ts` (table/role renames only)
   → verify: submit → approve/reject flow works unchanged from Fenster behavior
2. **Attendance (new UI)** — calendar grid, per-user/team view, present/absent/half-day marking, auto-mark leave days, linked to Daily Diary (diary entry ⇒ present)
   → verify: approving a leave for a date auto-updates that day's attendance to `leave`; a diary entry auto-marks `present`
3. `OwnerCommandCenter` dashboard — finance snapshot, procurement alerts, CRM snapshot, team accountability
4. `PersonalFinanceScreen` — integrate existing personal tracker, Owner-only route guard
   → verify: no non-owner role can reach this screen even via direct URL
5. `CombinedFinanceView` — read-only aggregation of Company + Personal
   → verify: no create/edit/delete controls render anywhere on this screen, confirmed by both UI inspection and permission check
6. Audit Log viewer — surfaces `sks_audit_log` (approvals, rejections, FY reopens, deadline changes)
   → verify: a rejected expense and a reopened FY both appear with reason, actor, and timestamp

**Exit criteria:** All modules from the build doc are live; Owner-only domains are provably isolated; audit trail is queryable.

---

## Cross-Phase Rules (apply throughout, not a phase)

- Every finance-adjacent feature must satisfy the 8 Finance Architecture Rules in the build doc before being marked done — check them at the end of Phases 3, 4, and 5 specifically.
- Never delete rejected/cancelled records — status + reason only.
- `.env` stays untracked; never paste its contents into commits, PRs, or generated docs.
- No `git push` without explicit confirmation each time (per CLAUDE.md), even mid-phase.

---

## Suggested Verification Loop Per Screen

```
1. Read the mapped Fenster source file
2. Adapt fields/roles per the build doc table
3. Wire to its sks_* service (typed CRUD, no logic in the service)
4. Manual verify: the specific check listed above for that item
5. tsc --noEmit clean, no unused imports left behind
```
