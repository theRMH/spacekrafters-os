# QA / Production Testing — SpaceKrafters OS

Test and comparison checklist derived from auditing the app against `SpaceKrafters_Final_Master_PRD.md` and `SpaceKrafters-Flow-Chart.md`. This document records **what to test/compare**, not current pass/fail results — re-run against the live app state at review time.

---

## 1. End-to-end flow tracing (PRD §4, Flow-Chart primary flow)

For each link in the chain below, check: does an actual code path connect the two steps (shared ID/FK write, or an automated derivation), or is the connection manual/duplicated/absent?

- [ ] Lead → Client/Project: does converting/using a lead create or link a project without duplicating client identity (name/phone/email re-entered as free text vs. referencing a shared client record)?
- [ ] Appointment → Site Visit: scheduling continuity and status handoff.
- [ ] Site Visit → Requirements: does the requirement record retain a link back to its originating site visit AND to the project it belongs to?
- [ ] Requirements → Project Workspace: do requirements created for a project actually surface in that project's Requirements tab (check the filter key used matches the field actually written on save)?
- [ ] Requirements/BOQ → Quotation: do quotation line items draw from captured requirements, or is the quotation built from scratch?
- [ ] Quotation → Internal Approval gate: is there an actual approval state/permission check before a quotation can be sent to the client, or is it just a status label?
- [ ] Quotation → Design Package: is a design package linked to the quotation/version it was designed against?
- [ ] Design → Client Approval: does an approval/revision-request state actually gate progression, or is it a freely-settable status field?
- [ ] Accepted Quotation → Project Contract Value: does accepting/approving a quotation automatically populate `Project.contractValue`, or is it manually re-typed?
- [ ] Accepted Quotation → Payment Milestones: are milestones auto-generated from the quotation's payment terms, or manually created one at a time?
- [ ] Advance/Milestone Payment → Company Finance: does recording the milestone receipt post a transaction to company accounts?
- [ ] Project Creation → Work Breakdown Structure: Stage → Task → Subtask hierarchy actually enforced, with dependencies?
- [ ] Tasks → Gantt: is Gantt a true visualization of task dates, or a static card list?
- [ ] Late task handling: is a mandatory reason captured on late completion, and does it escalate (notification/flag to Coordinator+Owner), or is the field present but never read/written?
- [ ] Procurement: Requirement → Purchase Request → Vendor Quotes → Comparison → Approval → PO → Material Received → Vendor Bill — confirm each transition exists in code, not just as adjacent screens.
- [ ] Vendor Bill → Payable: does the bill created in Procurement link to (or become) a payable that can be paid from that same record, or does Accounts have to re-enter it as a new Payable?
- [ ] Payable → Payment: does recording a payment update the payable's paid amount/status and post one company transaction?
- [ ] On-site Execution → Daily Diary: are progress notes/photos/evidence actually captured and stored, or is the field cosmetic?
- [ ] Mid-project Collections → Company Finance + Project Financials: same milestone-receipt check as advance payment, for every subsequent milestone.
- [ ] Handover Preparation: does a punch-list/snag-tracking/client-sign-off feature exist, or is the Handover tab a placeholder?
- [ ] Final Payment → Company Finance: full/balance payment correctly closes out the last milestone.
- [ ] Financial Reconciliation: is there any computed "actual vs budget" / "receivables settled" / "payables cleared" check, or only separate unconnected reports?
- [ ] Project Closure gating: can a project be set to "closed" regardless of outstanding payables/receivables/open expense commitments, or does closure require those to be resolved first?

## 2. Company Expense Lifecycle (PRD §15, Flow-Chart parallel flow)

- [ ] Requested → Approved → Due/Commitment → Paid → Closed: confirm this is ONE record moving through states, not separate duplicate records at each stage.
- [ ] Does approval alone affect cashflow/account balance? (Should not — only payment should.)
- [ ] Is a rejection reason mandatory and permanently retained/searchable?
- [ ] Does an expense request support attachments/evidence at creation?
- [ ] Does payment recording support a proof/receipt file attachment?
- [ ] Are partial payments against one expense supported?

## 3. Multi-project allocation (PRD §18.1, §28)

- [ ] Confirm the data model supports splitting one company transaction across N project allocations (one transaction row, many allocation rows).
- [ ] Confirm at least one real screen lets a user actually perform a split-across-projects payment through the UI (not just single-allocation calls from Expenses/Payables/Receivables/Statement Import).

## 4. Error handling audit (every financial/state-changing write)

For each of the following operations, check whether a failed write is caught and shown to the user (e.g. Snackbar/toast), or silently logged/ignored:
- [ ] Lead status change / conversion
- [ ] Quotation status transitions (draft → internal approved → sent → client approved/rejected)
- [ ] Project create / update / close
- [ ] Expense request: approve / reject / pay / close
- [ ] Procurement: PO creation, goods receipt, vendor bill entry
- [ ] Payable: payment recording
- [ ] Receivable: receipt recording
- [ ] Statement import: confirm & post
- [ ] Any call to `addTransactionAllocations()` — confirm the result is checked, not just the primary transaction write (a passing primary write with a silently failed allocation write is a distinct failure mode to test for).

## 5. File uploads (PRD §7, §9, §15.1, §16, §21)

For each area that should support file/photo attachments, confirm: (a) a file input actually exists, (b) upload goes through the correct storage path (not a bare filename), (c) upload failure is shown to the user, (d) the stored reference is later retrievable/displayed correctly (not "Unavailable").

- [ ] Site Visits: photos/evidence/checklist attachments
- [ ] Requirements: supporting documents/images
- [ ] Quotations: generated PDF is a real stored artifact vs. browser print-to-PDF only
- [ ] Design Center: moodboards, drawings, revision files
- [ ] Expense Requests: purchase/evidence attachments
- [ ] Expense Payment: proof of payment attachment
- [ ] Procurement: vendor bill/PO documents
- [ ] Daily Diary: progress photos
- [ ] Project Documents tab / central document vault
- [ ] Confirm only one upload component/pattern is used across the app (check for a duplicate/older component that bypasses the correct storage path — a known past regression class, see commit `8231278`).

## 6. Payment ↔ Account/Ledger linkage (PRD §12, §14, §17)

- [ ] Company account balance: confirm it reflects `opening balance + credits − debits` correctly after a transaction is posted (whether computed on read or via stored/triggered balance).
- [ ] Transfers between company accounts: confirm they do NOT count as income/expense.
- [ ] Expense payment ↔ originating expense request: same record, not a disconnected duplicate.
- [ ] Vendor bill payment ↔ originating bill/PO: same record/FK chain, not a disconnected duplicate.
- [ ] Receivable receipt ↔ originating milestone: milestone balance/status updates correctly; partial receipts supported.
- [ ] Client advance: confirm advances are NOT double-counted as new revenue when later allocated to a milestone.
- [ ] Owner ↔ Company funding movements: confirm explicit transfer/loan/reimbursement treatment, not counted as normal revenue/expense.

## 7. Audit trail coverage (PRD §1.1, §23, §28)

- [ ] Enumerate every screen that performs a "material business change" (approve, reject, create, close, pay, delete).
- [ ] For each, confirm an audit log entry is written (actor, action, record, old/new value, timestamp) — not just a subset of screens.

## 8. Personal Finance isolation (PRD §2.1, §13, §28)

- [ ] Confirm RLS policies block non-Owner roles from all `sks_personal_*` tables at the database layer (not just UI hiding).
- [ ] Confirm Combined Financial View has no create/edit/delete actions anywhere in its UI.
- [ ] Confirm personal transactions are never synced into Company Finance as editable records, and vice versa.

## 9. Flowchart-specific checks (`SpaceKrafters-Flow-Chart.md`)

- [ ] Internal Approval gate (node G) before client send — real gate or status label only?
- [ ] Material availability loop (node N1/N2) — does "awaiting material" actually loop the PO/bill status, or is it implicit?
- [ ] Late/blocked task loop (node O1/O2) — mandatory reason + escalation, per §1 above.
- [ ] Handover preparation (node Q) — punch list / snag fixes / client sign-off, per §1 above.
- [ ] Financial reconciliation (node S) — actual computed check vs. separate unconnected reports.

---

**How to use:** Re-run this checklist after any change to the flows above. Record results (date, verdict, evidence file:line) separately per review — this document intentionally holds only the test definitions so it doesn't go stale as gaps are fixed.
