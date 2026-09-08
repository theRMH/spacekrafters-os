# SpaceKrafters OS — Test Accounts

One test login per role, created directly in Supabase Auth + `sks_managed_users`. Use these to check role-based access while building.

Login screen asks for **mobile number** + **password** (not email — the email is a synthetic internal identifier the app generates from the mobile number and never shows you).

**Password for all test accounts:** `Test@1234`

| Role | Mobile | Display Role |
|---|---|---|
| owner | 9000000001 | Owner |
| accounts | 9000000002 | Accounts |
| project_coordinator | 9000000003 | Project Coordinator |
| site_engineer | 9000000004 | Site Engineer |
| designer | 9000000005 | Designer |
| qs | 9000000006 | QS |
| purchase | 9000000007 | Purchase |
| admin | 9000000008 | Admin |

## Notes
- These are real rows in the live Supabase project (`mzdbzijmetvepssctocy`) — not a local/mock mode. They exist in both `auth.users` and `sks_managed_users`.
- Each account has exactly one role (no multi-role test accounts).
- To delete these later, remove the `sks_managed_users` rows with `id` like `usr_test_*` and the matching `auth.users` rows (by email `u900000000X@sks.internal`).
- Do not use these credentials in production-facing demos — they're for internal dev/QA only.
