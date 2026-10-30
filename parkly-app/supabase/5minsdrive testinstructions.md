
Things you'll notice:
- 5-minute stays disappear on dev. To keep testing overstay, set TEST_SHORT_STAYS=on on the dev API, NEXT_PUBLIC_TEST_STAYS=on on dev web, and EXPO_PUBLIC_TEST_STAYS=on for mobile.
- Four new migrations need applying on dev before this code is deployed there. Dev migrations are still applied by hand, as noted in earlier sprint reports.
- The refund webhook field names come from memory, not from a Paystack sandbox payload. Check a real event before relying on it.
- Two fixes are only partial:
  - Money that arrives after a checkout was abandoned is now refunded automatically.
  - A wrong-amount charge is still only logged for finance; there's no incidents table until Sprint 8.
- Ledger entries already double-posted on dev stay as they are. The ledger is append-only, so they need a correcting entry rather than a code fix.
- CI is still red on the lint and format errors that were already in the codebase (Wave 3, item 11). My new code is clean, and this branch regenerates the OpenAPI file, which fixes the stale OpenAPI check.

Next is Wave 2, the security fixes: the token in receipt URLs, unescaped receipt HTML, attendant phone approval and unblocking, gate codes, and OTP hardening. Shall I continue, or do you want to review this branch first?