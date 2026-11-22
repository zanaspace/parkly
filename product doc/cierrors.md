2s
Run pnpm db:generate

> parkly@ db:generate /home/runner/work/parkly/parkly/parkly-app
> pnpm --filter @parkly/db generate


> @parkly/db@0.0.0 generate /home/runner/work/parkly/parkly/parkly-app/packages/db
> drizzle-kit generate

No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/runner/work/parkly/parkly/parkly-app/packages/db/drizzle.config.ts'
57 tables
driver_verifications 15 columns 2 indexes 1 fks
user_roles 6 columns 1 indexes 2 fks
users 16 columns 3 indexes 0 fks
audit_logs 12 columns 2 indexes 0 fks
feature_flags 6 columns 0 indexes 0 fks
platform_settings 6 columns 0 indexes 0 fks
consents 7 columns 1 indexes 1 fks
data_subject_requests 10 columns 2 indexes 1 fks
devices 16 columns 2 indexes 1 fks
erasure_log 4 columns 1 indexes 0 fks
vehicles 11 columns 3 indexes 1 fks
files 17 columns 4 indexes 1 fks
operator_kyb_documents 10 columns 3 indexes 3 fks
operator_members 16 columns 5 indexes 3 fks
operators 20 columns 3 indexes 2 fks
payout_accounts 15 columns 1 indexes 1 fks
lot_closures 8 columns 2 indexes 2 fks
lot_opening_hours 7 columns 1 indexes 1 fks
lot_photos 11 columns 4 indexes 4 fks
lots 28 columns 5 indexes 2 fks
permits 16 columns 5 indexes 4 fks
rate_plans 21 columns 5 indexes 3 fks
verification_items 7 columns 1 indexes 1 fks
verification_records 14 columns 3 indexes 3 fks
lot_slot_inventory 7 columns 0 indexes 1 fks
booking_extensions 15 columns 5 indexes 2 fks
booking_status_history 8 columns 1 indexes 1 fks
bookings 27 columns 10 indexes 5 fks
idempotency_keys 10 columns 1 indexes 0 fks
ledger_accounts 5 columns 2 indexes 1 fks
ledger_entries 10 columns 5 indexes 4 fks
payments 27 columns 7 indexes 4 fks
refund_requests 12 columns 4 indexes 3 fks
refunds 11 columns 3 indexes 3 fks
settlements 16 columns 2 indexes 1 fks
webhook_events 12 columns 3 indexes 0 fks
pass_waitlist 8 columns 2 indexes 2 fks
passes 25 columns 5 indexes 4 fks
lot_signing_keys 9 columns 3 indexes 1 fks
attendant_sync_batches 9 columns 3 indexes 2 fks
checkin_events 21 columns 5 indexes 3 fks
lot_walk_ins 4 columns 0 indexes 1 fks
sessions 17 columns 6 indexes 5 fks
notifications 13 columns 4 indexes 2 fks
receipt_counters 3 columns 0 indexes 1 fks
receipts 10 columns 3 indexes 2 fks
reconciliation_items 10 columns 3 indexes 3 fks
reconciliation_runs 13 columns 2 indexes 0 fks
incident_notes 6 columns 2 indexes 2 fks
incidents 16 columns 5 indexes 4 fks
corporate_accounts 13 columns 2 indexes 0 fks
corporate_bookings 13 columns 4 indexes 4 fks
corporate_branding 8 columns 0 indexes 1 fks
corporate_cost_centers 7 columns 2 indexes 1 fks
corporate_domains 7 columns 4 indexes 1 fks
corporate_fleet_drivers 11 columns 3 indexes 2 fks
corporate_members 8 columns 3 indexes 3 fks

[✓] Your SQL migration file ➜ ../../supabase/migrations/20261122222035_secret_miracleman.sql 🚀
HEAD detached at pull/125/merge
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   supabase/migrations/meta/_journal.json

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	supabase/migrations/20261122222035_secret_miracleman.sql
	supabase/migrations/meta/20261122222035_snapshot.json

no changes added to commit (use "git add" and/or "git commit -a")
Run pnpm db:generate and commit the migration
Error: Process completed with exit code 1.






⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/rbac-matrix.spec.ts > RBAC matrix > covers every authenticated route in the OpenAPI document
AssertionError: expected [ Array(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "GET /v1/corp/{slug}/bookings",
+   "GET /v1/corp/{slug}/finance",
+ ]

 ❯ test/rbac-matrix.spec.ts:796:21
    794|       .filter((r) => r.startsWith('GET /v1') || r.includes(' /v1/'))
    795|       .filter((r) => !inMatrix.has(r) && !COVERED_ELSEWHERE.has(r));
    796|     expect(missing).toEqual([]);
       |                     ^
    797|   });
    798| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 65 passed (66)
      Tests  1 failed | 1564 passed (1565)
   Start at  22:21:32
   Duration  26.69s (import 41%, tests 34%, transform 23%, worker 2%)

    Isolate  66 workers spawned · ~120ms startup each (spawn + environment, per file)
             at least ~2.51s faster with isolate: false — reuses workers across files instead of one per file


Error: AssertionError: expected [ Array(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "GET /v1/corp/{slug}/bookings",
+   "GET /v1/corp/{slug}/finance",
+ ]

 ❯ test/rbac-matrix.spec.ts:796:21


 ELIFECYCLE  Test failed. See above for more details.

 Tasks:    16 successful, 17 total
Cached:    6 cached, 17 total
  Time:    28.844s 
Failed:    @parkly/api#test

 ELIFECYCLE  Test failed. See above for more details.
Error: Process completed with exit code 1.