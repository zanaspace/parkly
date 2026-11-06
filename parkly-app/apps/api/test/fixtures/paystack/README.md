# Paystack fixtures

Response bodies the Paystack adapters are tested against (doc 02 §12.5).

These were written from Paystack's public API reference, **not recorded** from
the sandbox, because no test keys were available when the adapter was built
(2026-10-21). Replace each with a recorded sandbox response once
`PAYSTACK_SECRET_KEY` (test mode, `sk_test_…`) is available, and keep the file
names. Never commit live-mode responses or real account numbers.

## Settlements (S7 task 3, 2026-11-06)

- `settlements-empty.json` is **recorded** from the test-mode account. Test
  mode never pays out, so the list is always empty there.
- `settlements-assumed.json` is **written from Paystack's documented fields**,
  not recorded: one paid-out subaccount settlement, one still processing, and
  three the adapter must refuse to trust (unknown status, other currency,
  fractional amount). Once live payouts exist, replace it with a **sanitised copy** of a real
  list (ids, names and account numbers swapped for fake values; never the raw
  live response) and keep the file name.
