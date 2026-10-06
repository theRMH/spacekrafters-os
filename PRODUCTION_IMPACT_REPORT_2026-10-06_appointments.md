# Production Impact Report — MD Appointments / Scheduled Appointments

**Date:** 2026-10-06
**Area:** MD → Appointments → Scheduled Appointments (reschedule flow)
**Reported by:** Client, via live-site testing
**Investigated by:** Code audit + read-only production database queries (no browser/live-UI access was available this session — see Verification section)

## Summary

Four distinct, confirmed bugs were found in the appointment scheduling/reschedule flow, all in code the client's reported area directly exercises. The most serious — a timezone/format bug — is confirmed live in production data: **every one of the 8 appointments that have ever had an MD-approved reschedule (100%) currently has a malformed, timezone-ambiguous `scheduledAt` value.** The other three are a real approval bypass and two missing safeguards (past-time validation, duplicate-submission guard) that match the client's checklist exactly. All four are fixed; see Verification for what was and wasn't possible to confirm without live access.

## Root causes found and fixed

### 1. Reschedule approval could be bypassed (client's point: "do not bypass approval")
**File:** `src/screens/Appointments/AppointmentsScreen.tsx`

The intended flow is: a coordinator requests a reschedule from the Lead screen (reason + optional new date) → the MD reviews and accepts/rejects it in MD Tasks. But the separate "Edit Appointment" form on the Appointments screen let anyone with `edit_appointment` permission — **owner and Project Coordinator alike** — directly change an existing appointment's date/time and status, with zero connection to the approval mechanism: no reason captured, no MD notification, no `rescheduleRequestStatus` set. A Project Coordinator could silently move an appointment's time with nobody ever reviewing it.

**Fix:** The Date & Time fields in the Edit form are now read-only for non-owner roles (shown as plain text, with a note pointing to the proper "Rescheduled" action on the Lead), exactly like the existing read-only treatment of the Lead field in edit mode. The MD retains direct-edit ability (they're the approval authority, so nothing is being bypassed). Also removed `"Rescheduled"` as a manually-pickable option in the Status dropdown for everyone — that status has no meaning outside the proper request flow (setting it manually, with none of the reason/notification fields that flow needs, created a dead-end state nobody could act on).

### 2. Timezone-ambiguous date on MD-approved reschedules (client's point: timezone/date conversion)
**Files:** `src/screens/Leads/LeadStatusSheet.tsx`, `src/screens/MDTasks/MDTasksScreen.tsx`

Every appointment's `scheduledAt` is normally stored as a proper UTC ISO string (e.g. `2026-10-02T03:06:00.000Z`) via `new Date(...).toISOString()`. But the reschedule flow's "new date/time" input was stored as the **bare** string the date/time picker fields produce (e.g. `2026-10-06T09:00` — no timezone marker at all), and that bare value was copied directly into `scheduledAt` the moment the MD approved it, with no conversion anywhere in that path.

A bare date-time string is interpreted as **local time by whoever reads it** — the browser that created it, a different browser in a different timezone, or a server process (commonly UTC by default). It happened to display correctly so far because everyone using the app today is in the same timezone, but it's silently inconsistent with how every other appointment in the system is stored, and would visibly shift (by whatever the timezone offset is) the moment it's read somewhere that isn't IST.

**Confirmed live** (read-only queries against production):
- 8 of 8 appointments with `rescheduleRequestStatus = 'accepted'` have a `scheduledAt` missing the `Z` suffix.
- 0 appointments that were never rescheduled have this problem — their `scheduledAt` is a proper ISO string, confirming the bug is specific to the reschedule-approval path, not appointment creation generally.

**Fix:** Both the point where the new date is first captured (`LeadStatusSheet.tsx`, reschedule request) and the point where it's copied into `scheduledAt` (`MDTasksScreen.tsx`, MD approval) now run the value through a new shared `toProperIso()` helper (`src/screens/Appointments/appointmentDate.ts`), which always produces a proper `...Z` UTC ISO string. Fixing it at approval time (not just at request time) also means it self-heals for the existing 8 affected records the next time any of them goes through another reschedule cycle — but **it does not retroactively fix their current stored value** (see "Existing data" below).

### 3. No past-time validation when editing (client's point: "past appointment times cannot be incorrectly selected")
**File:** `src/screens/Appointments/AppointmentsScreen.tsx`

Creating a new appointment correctly blocks picking a past date/time. Editing an existing one didn't call that same check at all — an owner editing an appointment's date/time could silently save a past value with no warning, inconsistent with the create flow.

**Fix:** The same `isPastScheduledAt()` check now also runs on update, only when the date/time value was actually changed from what it was (so editing notes/location on an appointment that's already in the past — because it already happened — isn't incorrectly blocked).

### 4. No duplicate-submission guard (client's point: "no duplicate appointments are created")
**File:** `src/screens/Appointments/AppointmentsScreen.tsx`

The Schedule/Save button had no `saving` state — nothing prevented a user from tapping it twice (or the network being slow enough that a second tap registers before the first request completes), each tap firing its own `upsertAppointment()` call and potentially creating two separate rows for one intended appointment. No evidence of this having happened in production data was found (see Verification), but the gap was real and matches the client's explicit concern.

**Fix:** Added a `saving` state; both the create and update handlers now guard against re-entry and the button disables itself (reading "Saving…") while a request is in flight.

## Checked and confirmed NOT broken

To avoid inventing fixes for things that already work, these specific client checklist items were checked and found correct, with no change made:
- **Appear immediately after creation** — the list updates via an optimistic local-state push immediately after a successful save; not dependent on a refetch.
- **Status correct after refresh/re-login** — fully persisted through Supabase (`sks_appointments`), reloaded fresh on every mount; no caching layer that could serve stale data.
- **Assigned user/client details shown correctly** — `assigneeSummary()` correctly falls back to the legacy single-coordinator field for older records without the newer multi-assignee list.
- **Date/time display formatting** — consistent across the list, detail sheet, and MD review card (`fmtDateTime`, one shared formatter); the only actual inconsistency was in the *stored* value (bug #2 above), not the display formatting.

## Existing production data — not modified, needs your decision

The 8 appointments listed above currently have a malformed `scheduledAt`. This is **not fixed automatically** — repairing already-stored production data is outside what I'll do without your explicit go-ahead, per the standing rule not to modify production data unnecessarily. Practically, since everyone using the app today is in the same timezone, these 8 records almost certainly display correctly right now — this is a latent correctness/consistency issue, not a currently-visible display bug for your current users.

If you'd like them repaired, the exact fix is a one-time `UPDATE` that re-parses and re-stores each `scheduledAt` as a proper ISO string (a pure reformat — the actual moment in time represented does not change, only its string representation):
```sql
update sks_appointments
set data = jsonb_set(data, '{scheduledAt}', to_jsonb(to_char((data->>'scheduledAt')::timestamp at time zone 'Asia/Kolkata' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
where data->>'scheduledAt' is not null and data->>'scheduledAt' not like '%Z';
```
I have not run this. Let me know if you want it applied, and I'll run it as a separate, explicit, confirmed action.

## Regression tests added

`src/screens/Appointments/appointmentDate.ts` — the date/time logic (`isPastScheduledAt`, `toLocalInputValue`, `toProperIso`, etc.) was extracted out of the screen component into a plain, testable module (this project has no component-rendering test setup — only plain-function tests, matching the existing convention in `src/utils/permissions.test.ts`).

`src/screens/Appointments/appointmentDate.test.ts` (8 tests) — covers:
- `isPastScheduledAt`: past/future/unparseable cases.
- `toLocalInputValue`: correct bare-string shape, unparseable-input handling.
- `toProperIso`: **the core regression test for bug #2** — asserts a bare date/time-field string always converts to a proper `...Z` ISO string, that an already-proper ISO string round-trips unchanged (safe to call defensively), and that the converted value represents the same absolute instant the browser would already resolve the bare string to (i.e. the fix only changes the *representation*, never the *meaning*, of the time).

The approval-bypass fix (#1), the past-time-on-edit fix (#3), and the duplicate-submit guard (#4) are UI/state-level changes inside the React component — verified by code review and `tsc`, not independently unit-testable without a component-rendering test harness this project doesn't currently have.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 22/22 tests passing (14 pre-existing + 8 new).
- `npm run build` — clean production build.
- Live, read-only production database queries — confirmed the exact scope and mechanism of bug #2 (8/8 correlation above), and confirmed no duplicate-appointment rows currently exist in production (candidate-duplicate query, by lead + time + location within 60 seconds of each other, returned zero matches).
- **No browser/live-site access was available this session** — I could not literally click through the production Appointments UI as the task asked ("first reproduce the issue on the live flow"). Reproduction here was done via direct code tracing plus the live read-only database queries above, which is why the report leads with concrete, queried evidence rather than a UI screen-recording. **I'd recommend a manual pass through the full flow this report was asked to verify** — Schedule → MD Appointments → Refresh → Re-login → Verify → Reschedule → MD Approval — once this is deployed, to confirm the fixes hold up in the real UI, since that step genuinely wasn't possible from here.

## Deployment

No database schema change, no migration, no edge function change. This is a pure `src/` code change — same Vercel git-based deploy as every other fix this session. Nothing has been committed or pushed yet.
