# Paystack fixtures

Response bodies the Paystack adapters are tested against (doc 02 §12.5).

These were written from Paystack's public API reference, **not recorded** from
the sandbox, because no test keys were available when the adapter was built
(2026-10-21). Replace each with a recorded sandbox response once
`PAYSTACK_SECRET_KEY` (test mode, `sk_test_…`) is available, and keep the file
names. Never commit live-mode responses or real account numbers.
