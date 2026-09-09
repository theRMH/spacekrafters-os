# "Update Status" Workflow Engine — Implementation Plan

## Origin

Changing a Lead's or Project's stage today requires opening the full multi-field Edit form — cumbersome. Fenster solves this with a big, obvious "Update Status" button that opens a stage-and-role-specific form; submitting it advances the record's stage and reassigns who owns the next action. This plan ports that pattern into Spacekrafters (sks), sized to sks's actual data model and the stages defined in `SpaceKrafters-Flow-Chart.md`.

## How Fenster actually does it (confirmed by reading the real code, not assumed)

- The button lives on `ProjectDetailScreen.tsx` as a "Current Action Needed" banner, gated to specific roles, showing the active task's stage label and a big "Update Status →" button.
- It opens `DemoFlowSheet.tsx` (5,535 lines) — one monolithic sheet, gated by `task.flowStage` + `user.role`, containing ~30 `submitXxx()` functions (one per stage transition) and a shared `save()` helper.
- **Key finding:** `src/utils/workflow.ts`'s task-chain helper functions (`onEngineerSiteVisitComplete`, `onOwnerApprovedQuotation`, etc.) are dead code on this path. All real stage-transition logic — validating inputs, building the update, appending a history entry, syncing the project's stage — is written inline in `DemoFlowSheet.tsx`'s `submit*` functions and its local `save()` helper, which calls `onUpdate(updates)` → a plain `updateTask()`/`updateProject()` merge. There is no separate "chain helper" layer in the live code path.
- Each stage's form captures data directly onto the task itself (photos, measurements, amounts, approve/reject) — it does not delegate to other screens/entities.

## Correction made during planning: what a "box" is

Initial framing assumed Fenster's carrier ("task") maps to sks's `Task` entity (`sks_tasks`, project-scoped to-do items). The user clarified: "task" in the Fenster description means the generic flow-chart *box* — i.e., whichever record is currently being advanced through the pipeline. In sks this means:

- **Lead** is the box/carrier for pre-project stages (flow chart steps 3–10: site visit → advance payment).
- **Project** is the box/carrier for post-project stages (steps 11–18: procurement → closure).

No new `sks_tasks`-based engine is being built. `Task`/`taskService.ts`/`TasksScreen.tsx` are untouched by this plan.

## Confirmed decisions (asked and answered during planning)

1. **Data capture**: inline, own fields on the record being advanced (Lead or Project) — matches Fenster. Not a write-through into other entities' tables.
2. **Handoff**: full auto-reassignment — completing a stage changes who owns the next action (`assignedRole`/`assignedToId`/`assignedToName`), matching Fenster's task-chain handoff spirit, but expressed as reassignment on the Lead/Project record itself rather than spawning new rows in a separate table.
3. **Chain scope**: full chain, flow-chart steps 3–18 — both Lead-side and Project-side, not just post-project.
4. **DesignPackage timing conflict**: the flow chart's Design step (7) happens before a Project exists, but `DesignPackage.projectId` is currently required. Resolution: make `DesignPackage.projectId` optional and add `leadId?`, mirroring the existing `Requirement`/`Quotation` pattern (both already have optional `projectId` alongside a Lead-side FK).
5. **Build sequencing**: Lead side first (steps 3–10), verified end-to-end, then Project side (steps 11–18) as a second pass reusing the same pattern. This document covers both, but implementation proceeds in that order.

## Flow chart reference (`SpaceKrafters-Flow-Chart.md`, Stage Summary table)

| # | Stage | Role | Key Output |
|---|---|---|---|
| 1 | Lead capture & follow-up | Project Coordinator | Lead record, SLA tracking |
| 2 | Appointment | Project Coordinator | Confirmed meeting |
| 3 | Site visit | Site Engineer | Measurements, photos, room requirements |
| 4 | Requirements & BOQ inputs | QS / Project Coordinator | Specifications |
| 5 | Proposal / Quotation | QS / Project Coordinator | Client-facing BOQ + internal cost plan |
| 6 | Internal approval | Owner | Approved quotation |
| 7 | Design package | Designer / Architect | Drawings, moodboards, client approval |
| 8 | Send to client | Project Coordinator | Quotation + design emailed |
| 9 | Client approval | — | Signed/confirmed approval |
| 10 | Advance payment | Accounts | 1st milestone collected, posted to finance |
| 11 | Project creation | Project Coordinator | Workspace, WBS, Gantt, team assigned |
| 12 | Procurement | Purchase | PO, material received, vendor bill → payable |
| 13 | On-site execution | Site Engineer | Tasks completed, daily diary, evidence |
| 14 | Mid-project collections | Accounts | Milestone invoices collected |
| 15 | Handover preparation | Project Coordinator / QS | Punch list cleared, client sign-off |
| 16 | Final payment | Accounts | Balance collected, posted to finance |
| 17 | Financial reconciliation | Accounts | Actuals vs budget, payables cleared |
| 18 | Project closure | Owner / Accounts | Closed, immutable, audit locked |

Steps 1–2 already work today (`LeadsScreen`, `AppointmentsScreen`) and are out of scope. This plan covers steps 3–18.

---

## Phases

Each phase is independently shippable and verifiable — `tsc --noEmit` clean, a manual smoke test, and a `CHANGES.md` entry before moving to the next. Phases 1–4 (Lead side) ship first; Phases 5–7 (Project side) follow once Lead side is verified in real use.

| Phase | Covers | Depends on |
|---|---|---|
| 1 | Lead-side type changes | — |
| 2 | Lead-side role lookup + `LeadStatusSheet.tsx` logic | 1 |
| 3 | Lead-side UI placement | 2 |
| 4 | Lead → Project handoff | 3 |
| 5 | Project-side type changes | 4 (Lead side verified) |
| 6 | Project-side role lookup + `ProjectStatusSheet.tsx` logic | 5 |
| 7 | Project-side UI placement | 6 |

---

## PART A — Lead side (steps 3–10), build first

### Phase 1 — Lead-side type changes (`sks/src/types/index.ts`)

**Extend `LeadStatus`** from the current 7 flat values to flow-chart granularity. Current:
```ts
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'site_visit_scheduled' | 'requirements_captured' | 'won' | 'lost'
```
Proposed (exact final list to be reconciled against `SiteVisit`/`Requirement`/`Quotation`/`DesignPackage` statuses during implementation, so nothing is duplicated):
```ts
export type LeadStatus =
  | 'new' | 'contacted' | 'qualified'
  | 'site_visit_scheduled' | 'site_visit_done'
  | 'requirements_captured'
  | 'quotation_drafted' | 'internally_approved'
  | 'design_in_progress' | 'design_approved'
  | 'sent_to_client' | 'negotiating' | 'client_approved'
  | 'won' | 'lost'
```

**Add to `Lead`:**
```ts
assignedRole?: UserRole
assignedToId?: string
assignedToName?: string
```
(`Lead.ownerId`/`ownerName` stay as-is — those represent the lead's original/primary owner, a different concept from "who currently must act next.")

Lead's existing `activity: LeadActivityItem[]` is reused as the status-change history trail — no new history type needed here.

**`DesignPackage`** (fix required for step 7 to work pre-project):
```ts
export interface DesignPackage {
  id: string
  projectId?: string   // was required — now optional
  leadId?: string       // new
  quotationId?: string
  name: string
  status: DesignPackageStatus
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}
```
Matches the existing `Requirement`/`Quotation` pattern (`projectId?: string` alongside a Lead-side FK).

**Verify:** `tsc --noEmit` clean. No UI or runtime behavior changes yet — this phase is types only.

### Phase 2 — Lead-side role lookup + `LeadStatusSheet.tsx` logic

#### 2a. Role-per-stage lookup

New small map (location: alongside `LeadStatus` in `types/index.ts`, or a new `sks/src/utils/leadWorkflow.ts` if it grows):
```ts
const ROLE_FOR_LEAD_STATUS: Partial<Record<LeadStatus, UserRole>> = {
  site_visit_scheduled:  'site_engineer',
  site_visit_done:       'project_coordinator', // or 'qs' — confirm during build
  requirements_captured: 'project_coordinator',
  quotation_drafted:     'owner',
  internally_approved:   'designer',
  design_in_progress:    'designer',
  design_approved:       'project_coordinator',
  sent_to_client:        'project_coordinator', // awaiting client outcome
  negotiating:           'project_coordinator',
  client_approved:       'accounts',
}
```
This drives both the "who does the sheet show as responsible" label and the reassignment on submit.

#### 2b. `LeadStatusSheet.tsx` (new component)

Replaces/extends the current ad-hoc `NEXT_STATUS` single-button pattern in `LeadDetailScreen.tsx`. One sheet, gated by `lead.status` + `user.role`, containing one `submitXxx()` per transition:

- `submitSiteVisitScheduled` — confirms an `Appointment`/`SiteVisit` exists, advances to `site_visit_done` (site_engineer role).
- `submitSiteVisitDone` — done via existing `SiteVisitsScreen` completing a visit; sheet reflects the linked `SiteVisit` and advances to `requirements_captured` once present (or links to Requirements screen to capture, matching how these entities work today).
- `submitQuotationDrafted` — links to/reflects the `Quotation` record; advances to `internally_approved` once one exists in `internal_review`/`internally_approved` state.
- `submitInternalApproval` — owner approve/reject with a reason (reject sends back to `quotation_drafted` for rework, matching flow chart's `G -->|Rejected| F`).
- `submitDesignApproval` — designer marks `design_in_progress` → `design_approved` (or "revision requested" loop, matching flow chart's `H -->|Revision requested| H`), linked to a `DesignPackage` (now Lead-attachable per A1).
- `submitSendToClient` — project_coordinator marks quotation+design as sent.
- `submitClientDecision` — outcome: `negotiating` (loops back to `sent_to_client`), `lost` (existing lost flow), or `client_approved`.
- `submitAdvancePayment` — accounts captures `advancePaymentAmount`/`advancePaymentRef` directly on the Lead (new optional fields — no Project/PaymentMilestone exists yet at this point, so there's nothing to record a Receipt against), sets `status: 'won'`, and triggers the Lead→Project handoff (Part A4). Phase 4 creates the real `Receipt` against the auto-generated starter milestone once the Project exists, so the payment becomes visible in Receivables at that point rather than as an orphaned/invisible record.

Each `submitXxx` ends in a shared `save(updates, note?)` that:
1. Appends an entry to `lead.activity` (reusing the existing `LeadActivityItem` type).
2. Sets `assignedRole`/`assignedToId`/`assignedToName` to the next stage's responsible person (looked up via `getManagedUsersDirectory`, same directory Fenster's role dropdowns use).
3. Calls `updateLead(lead.id, updates, note)` (existing `useCRM()` method already used by `handleAdvanceStatus`).

Forms capture only what's genuinely new at that step (approve/reject + reason, "sent" confirmation) — everything already captured by `SiteVisitsScreen`/`RequirementsScreen`/`QuotationsScreen`/`DesignCenterScreen` is *linked to*, not duplicated.

`LeadStatusSheet` is built and wired to a temporary/dev-only trigger in this phase (not yet the real banner button) so its logic can be exercised before UI placement lands in Phase 3.

**Verify:** exercise every `submitXxx` via the temporary trigger — confirm `assignedRole`/`assignedToId`/`assignedToName` update correctly and `lead.activity` gets a new entry each time. `tsc --noEmit` clean.

### Phase 3 — Lead-side UI placement

`LeadDetailScreen.tsx`: replace the current "Status Actions" card (the `NEXT_STATUS`-driven single button) with a "Current Action Needed" banner — current stage label + responsible role/person + a big `w-full py-3.5 rounded-xl font-bold` "Update Status →" button (same visual weight as the existing `Call {name}` button), opening `LeadStatusSheet`. Remove the temporary dev-only trigger from Phase 2.

**Verify:** manual smoke test — open a lead at each stage, confirm the banner shows the right stage/role label and the button opens the right form.

### Phase 4 — Lead → Project handoff (step 10 → 11)

When `submitAdvancePayment` completes, reuse the existing lead-to-project conversion logic (already built: `ProjectsScreen.tsx`'s `?leadId=` handling, client picker/auto-match, quotation carry-over via `quotationId`/`contractValue`, starter `PaymentMilestone` auto-created in `handleSave()`). This is the one moment the carrier switches from Lead to Project — after this point, the Lead's job is done (`status: 'won'`) and the Project's chain (Part B) takes over.

Additionally, once the Project + starter milestone are created, create a real `Receipt` (via `addReceipt`) for the Lead's captured `advancePaymentAmount`/`advancePaymentRef`, linked to that milestone — this is what makes the advance payment actually visible in `ReceivablesScreen.tsx` (which only lists receipts scoped to a milestone). Confirmed with the user: Phase 2 deliberately does NOT create a Receipt (no Project/Milestone exists yet at that point — would be an orphaned, invisible record); this phase is where it becomes real.

**Verify:** walk a lead through every stage from `new` to `client_approved`, complete the advance-payment step, confirm a Project is created with the right client/contract value/starter milestone and the Lead flips to `won`. This is the checkpoint before starting Project-side work — Lead side should be fully working in real use here.

---

## PART B — Project side (steps 11–18), build second

Same pattern as Part A, applied to `Project`/`ProjectStage`.

### Phase 5 — Project-side type changes

**`Project`** gains:
```ts
assignedRole?: UserRole
assignedToId?: string
assignedToName?: string
statusHistory?: StatusHistoryItem[]   // new type, see below — Project has no activity trail today
```

**New shared type** (used by Project; Lead reuses its existing `LeadActivityItem` instead):
```ts
export interface StatusHistoryItem {
  stage: string
  note?: string
  files?: string[]
  updatedBy: string
  updatedRole: UserRole
  updatedAt: string
}
```

**`ProjectStage`** — review against flow chart steps 12–18 (procurement, execution, mid-project collections, handover, final payment, reconciliation, closure). The existing 14-value enum already covers most of this (`procurement`, `execution`, `handover_prep`, `final_payment`, `reconciliation`, `closed`); confirm exact mapping during implementation rather than inventing new values speculatively.

**Verify:** `tsc --noEmit` clean. Types only, no behavior change yet.

### Phase 6 — Project-side role lookup + `ProjectStatusSheet.tsx` logic

#### 6a. Role-per-stage lookup

```ts
const ROLE_FOR_PROJECT_STAGE: Partial<Record<ProjectStage, UserRole>> = {
  procurement:      'purchase',
  execution:         'site_engineer',
  handover_prep:     'project_coordinator',
  final_payment:     'accounts',
  reconciliation:    'accounts',
  closed:            'owner',
}
```

#### 6b. `ProjectStatusSheet.tsx`

Same shape as `LeadStatusSheet.tsx` — gated by `project.stage` + `user.role`, one `submitXxx()` per transition, ending in a shared `save()` that appends to `statusHistory`, sets `assignedRole`/`assignedToId`/`assignedToName`, and calls `upsertProject`. Reuses/links to `PurchaseOrder`/`VendorBill` (procurement), `Task`/daily diary (execution — sks's existing WBS/Gantt, not re-implemented), `PunchListItem` (handover, already built), `PaymentMilestone`/`Receipt` (collections/final payment), and the existing warn-and-confirm closure gate (already built) for step 18.

Built and exercised via a temporary/dev-only trigger in this phase, same as Phase 2.

**Verify:** exercise every `submitXxx` via the temporary trigger — confirm `assignedRole`/`assignedToId`/`assignedToName` and `statusHistory` update correctly at each stage. `tsc --noEmit` clean.

### Phase 7 — Project-side UI placement

- `ProjectsScreen.tsx` detail `BottomSheet`: banner + button above Edit/Delete.
- `ProjectWorkspaceScreen.tsx`: same banner at the top of the Overview tab, above the "Project Details" accordion.
- Remove the temporary dev-only trigger from Phase 6.

**Verify:** walk a project through every stage from creation to closure using only the new banner/button, confirming existing screens (Procurement, Punch List, Receivables, closure gate) stay correctly linked rather than duplicated.

---

## What is deliberately NOT ported from Fenster

- No voice notes.
- No owner "override/take control" mode.
- No history time-travel/browsing UI.
- No per-stage checklists (availability/production/pack) — sks's procurement and execution already have their own dedicated multi-record flows (PO/GRN/Bill, Tasks/Diary) that this plan links to rather than reimplements.
- No new `Task`-entity-based engine — confirmed out of scope; `sks_tasks` stays exactly as it is today.

## Cross-cutting rules (apply to every phase)

- `tsc --noEmit` clean before moving to the next phase.
- Update `CHANGES.md` per phase while context is fresh, marking any migration `⚠ DEPLOY` (expect: none required across this whole plan — all new fields are additive to existing JSONB-backed columns, no new tables).
- No `git push` without explicit confirmation, per standing instruction — commit locally per phase, confirm with the user before any push.
- Don't start a phase whose "Depends on" phase hasn't been verified yet.

## Open items to resolve during implementation (not blocking plan approval)

- Exact final `LeadStatus` value list (reconcile against `SiteVisit`/`Requirement`/`Quotation` statuses so nothing duplicates).
- Whether `site_visit_done` reassigns to `project_coordinator` or `qs` (flow chart lists "QS / Project Coordinator" jointly for step 4).
- Exact `ProjectStage` value reconciliation for steps 12–18 against the current 14-value enum.
