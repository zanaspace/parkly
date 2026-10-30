
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/rls.int-spec.ts > RLS deny-all baseline (doc 02 §1, AGENTS.md rule 14) > every Storage bucket is private and clients have no storage.objects policies (doc 05 V12)
AssertionError: expected [ { id: 'lot-photos-public' } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "lot-photos-public",
+   },
+ ]



0s
Post job cleanup.
(node:2493) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
Error: Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.
