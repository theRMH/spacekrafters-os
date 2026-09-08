## 2026-09-08

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
