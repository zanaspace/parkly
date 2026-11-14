8s
Run pnpm test

> parkly@ test /home/runner/work/parkly/parkly/parkly-app
> turbo run test


   • Packages in scope: @parkly/admin, @parkly/api, @parkly/config, @parkly/contracts, @parkly/db, @parkly/domain, @parkly/mobile, @parkly/portal, @parkly/tokens, @parkly/ui, @parkly/ui-native, @parkly/web
   • Running test in 12 packages
   • Remote caching disabled

@parkly/domain:build
@parkly/contracts:build
@parkly/tokens:build
@parkly/db:build
@parkly/ui-native:build
@parkly/ui:build
@parkly/web:test
@parkly/ui-native:test
@parkly/tokens:test
@parkly/db:test
cache miss, executing 4f95315624a07a14

> @parkly/db@0.0.0 test /home/runner/work/parkly/parkly/parkly-app/packages/db
> vitest run


 RUN  v5.0.4 /home/runner/work/parkly/parkly/parkly-app/packages/db

 ❯ src/schema/schema.spec.ts (122 tests | 2 failed) 125ms
   ❯ schema conventions (doc 02 §1) (109)
     × finds the tables 33ms
     ✓ users enables RLS with an API policy 11ms
     ✓ user_roles enables RLS with an API policy 0ms
     ✓ driver_verifications enables RLS with an API policy 0ms
     ✓ audit_logs enables RLS with an API policy 0ms
     ✓ platform_settings enables RLS with an API policy 0ms
     ✓ feature_flags enables RLS with an API policy 0ms
     ✓ vehicles enables RLS with an API policy 0ms
     ✓ devices enables RLS with an API policy 1ms
     ✓ consents enables RLS with an API policy 0ms
     ✓ data_subject_requests enables RLS with an API policy 0ms
     ✓ erasure_log enables RLS with an API policy 0ms
     ✓ files enables RLS with an API policy 18ms
     ✓ operators enables RLS with an API policy 0ms
     ✓ operator_members enables RLS with an API policy 0ms
     ✓ operator_kyb_documents enables RLS with an API policy 0ms
     ✓ payout_accounts enables RLS with an API policy 0ms
     ✓ lots enables RLS with an API policy 0ms
     ✓ lot_opening_hours enables RLS with an API policy 0ms
     ✓ lot_closures enables RLS with an API policy 0ms
     ✓ lot_photos enables RLS with an API policy 0ms
     ✓ permits enables RLS with an API policy 0ms
     ✓ verification_records enables RLS with an API policy 0ms
     ✓ verification_items enables RLS with an API policy 0ms
     ✓ rate_plans enables RLS with an API policy 0ms
     ✓ lot_slot_inventory enables RLS with an API policy 0ms
     ✓ bookings enables RLS with an API policy 0ms
     ✓ booking_status_history enables RLS with an API policy 0ms
     ✓ payments enables RLS with an API policy 0ms
     ✓ refunds enables RLS with an API policy 0ms
     ✓ refund_requests enables RLS with an API policy 0ms
     ✓ webhook_events enables RLS with an API policy 0ms
     ✓ idempotency_keys enables RLS with an API policy 0ms
     ✓ ledger_accounts enables RLS with an API policy 0ms
     ✓ settlements enables RLS with an API policy 0ms
     ✓ ledger_entries enables RLS with an API policy 0ms
     ✓ booking_extensions enables RLS with an API policy 0ms
     ✓ passes enables RLS with an API policy 0ms
     ✓ pass_waitlist enables RLS with an API policy 0ms
     ✓ lot_signing_keys enables RLS with an API policy 0ms
     ✓ sessions enables RLS with an API policy 0ms
     ✓ checkin_events enables RLS with an API policy 10ms
     ✓ attendant_sync_batches enables RLS with an API policy 0ms
     ✓ lot_walk_ins enables RLS with an API policy 0ms
     ✓ notifications enables RLS with an API policy 0ms
     ✓ receipts enables RLS with an API policy 0ms
     ✓ receipt_counters enables RLS with an API policy 0ms
     ✓ reconciliation_runs enables RLS with an API policy 0ms
     ✓ reconciliation_items enables RLS with an API policy 0ms
     ✓ incidents enables RLS with an API policy 0ms
     ✓ incident_notes enables RLS with an API policy 0ms
     ✓ corporate_accounts enables RLS with an API policy 0ms
     ✓ corporate_domains enables RLS with an API policy 0ms
     ✓ corporate_branding enables RLS with an API policy 0ms
     ✓ corporate_cost_centers enables RLS with an API policy 0ms
     ✓ corporate_members enables RLS with an API policy 0ms
     ✓ users has created_at 0ms
     ✓ user_roles has created_at 0ms
     ✓ driver_verifications has created_at 0ms
     ✓ audit_logs has created_at 0ms
     ✓ platform_settings has created_at 0ms
     ✓ feature_flags has created_at 0ms
     ✓ vehicles has created_at 0ms
     ✓ devices has created_at 0ms
     ✓ consents has created_at 0ms
     ✓ data_subject_requests has created_at 0ms
     ✓ erasure_log has created_at 0ms
     ✓ files has created_at 10ms
     ✓ operators has created_at 0ms
     ✓ operator_members has created_at 0ms
     ✓ operator_kyb_documents has created_at 0ms
     ✓ payout_accounts has created_at 0ms
     ✓ lots has created_at 0ms
     ✓ lot_opening_hours has created_at 0ms
     ✓ lot_closures has created_at 0ms
     ✓ lot_photos has created_at 0ms
     ✓ permits has created_at 0ms
     ✓ verification_records has created_at 0ms
     ✓ verification_items has created_at 0ms
     ✓ rate_plans has created_at 0ms
     ✓ bookings has created_at 0ms
     ✓ booking_status_history has created_at 0ms
     ✓ payments has created_at 0ms
     ✓ refunds has created_at 0ms
     ✓ refund_requests has created_at 0ms
     ✓ idempotency_keys has created_at 0ms
     ✓ ledger_accounts has created_at 0ms
     ✓ settlements has created_at 0ms
     ✓ ledger_entries has created_at 0ms
     ✓ booking_extensions has created_at 0ms
     ✓ passes has created_at 0ms
     ✓ pass_waitlist has created_at 0ms
     ✓ lot_signing_keys has created_at 0ms
     ✓ sessions has created_at 8ms
     ✓ checkin_events has created_at 0ms
     ✓ attendant_sync_batches has created_at 0ms
     ✓ lot_walk_ins has created_at 0ms
     ✓ notifications has created_at 0ms
     ✓ receipts has created_at 0ms
     ✓ receipt_counters has created_at 0ms
     ✓ reconciliation_runs has created_at 0ms
     ✓ reconciliation_items has created_at 0ms
     ✓ incidents has created_at 0ms
     ✓ incident_notes has created_at 0ms
     ✓ corporate_accounts has created_at 0ms
     ✓ corporate_domains has created_at 0ms
     × corporate_branding has created_at 8ms
     ✓ corporate_cost_centers has created_at 0ms
     ✓ corporate_members has created_at 0ms
   ✓ enums match the domain (no silent drift) (10)
     ✓ lot_status 0ms
     ✓ verification_item 0ms
     ✓ role 0ms
     ✓ booking_status 0ms
     ✓ booking_type 0ms
     ✓ payment_status 0ms
     ✓ pass_status 0ms
     ✓ driver_verification_method 0ms
     ✓ driver_verification_status 0ms
     ✓ permit_status is the review statuses plus EXPIRED 0ms
   ✓ geography point (EWKB) (3)
     ✓ reads lng/lat from a point with an SRID 0ms
     ✓ reads a big-endian point without an SRID 0ms
     ✓ rejects anything that is not a point 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/schema/schema.spec.ts > schema conventions (doc 02 §1) > finds the tables
AssertionError: expected [ 'attendant_sync_batches', …(54) ] to deeply equal [ 'attendant_sync_batches', …(49) ]

- Expected
+ Received

@@ -4,10 +4,15 @@
    "booking_extensions",
    "booking_status_history",
    "bookings",
    "checkin_events",
    "consents",
+   "corporate_accounts",
+   "corporate_branding",
+   "corporate_cost_centers",
+   "corporate_domains",
+   "corporate_members",
    "data_subject_requests",
    "devices",
    "driver_verifications",
    "erasure_log",
    "feature_flags",

 ❯ src/schema/schema.spec.ts:15:62
     13| describe('schema conventions (doc 02 §1)', () => {
     14|   it('finds the tables', () => {
     15|     expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
       |                                                              ^
     16|       'attendant_sync_batches',
     17|       'audit_logs',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/schema/schema.spec.ts > schema conventions (doc 02 §1) > corporate_branding has created_at
AssertionError: expected [ 'corporate_id', 'logo_url', …(5) ] to include 'created_at'
 ❯ src/schema/schema.spec.ts:88:62
     86|       .map((t) => [getTableConfig(t).name, t] as const),
     87|   )('%s has created_at', (_name, table) => {
     88|     expect(getTableConfig(table).columns.map((c) => c.name)).toContain…
       |                                                              ^
     89|   });
     90| });


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 120 passed (122)
   Start at  21:58:12
   Duration  4.84s (import 58%, transform 39%, tests 3%)


Error: AssertionError: expected [ 'attendant_sync_batches', …(54) ] to deeply equal [ 'attendant_sync_batches', …(49) ]

- Expected
+ Received

@@ -4,10 +4,15 @@
    "booking_extensions",
    "booking_status_history",
    "bookings",
    "checkin_events",
    "consents",
+   "corporate_accounts",
+   "corporate_branding",
+   "corporate_cost_centers",
+   "corporate_domains",
+   "corporate_members",
    "data_subject_requests",
    "devices",
    "driver_verifications",
    "erasure_log",
    "feature_flags",

 ❯ src/schema/schema.spec.ts:15:62



Error: AssertionError: expected [ 'corporate_id', 'logo_url', …(5) ] to include 'created_at'
 ❯ src/schema/schema.spec.ts:88:62


 ELIFECYCLE  Test failed. See above for more details.
@parkly/contracts:test
@parkly/mobile:test
@parkly/api:test
@parkly/portal:test
@parkly/ui:test
@parkly/domain:test
Error: command (/home/runner/work/parkly/parkly/parkly-app/packages/db) /home/runner/setup-pnpm/node_modules/.bin/pnpm run test exited (1)
@parkly/admin:test

 Tasks:    9 successful, 17 total
Cached:    6 cached, 17 total
  Time:    7.266s 
Failed:    @parkly/db#test

 WARNING  no output files found for task @parkly/tokens#test. Please check your `outputs` key in `turbo.json`
 WARNING  no output files found for task @parkly/ui-native#test. Please check your `outputs` key in `turbo.json`
 WARNING  no output files found for task @parkly/web#test. Please check your `outputs` key in `turbo.json`
 ERROR  run failed: command  exited (1)
 ELIFECYCLE  Test failed. See above for more details.
Error: Process completed with exit code 1.