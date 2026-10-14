# 0004 — Paystack split payments; no stored balances; Flutterwave fallback

- **Status:** Accepted — pending counsel confirmation (doc 00 Q3)
- **Date:** 2026-10-14
- **Deciders:** Product lead, engineering lead
- **Related:** doc 00 §3.9–3.10, doc 01 §5.2, doc 05 payments, FR-PAY-*

## Context

Holding customer funds in Nigeria requires a CBN mobile money operator licence (₦2bn capital). Operators expect daily settlement. Drivers expect upfront, cashless prices.

## Options considered

1. **Wallet with stored balances:** best UX for repeat payments, but needs an MMO licence. Rejected.
2. **Collect to Parkly, pay operators out ourselves:** Parkly would hold funds in transit — same licensing problem and settlement risk.
3. **Licensed gateway with split settlement (chosen):** Paystack charges the driver; each operator has a Paystack **subaccount**; the split sends the operator share directly to them (T+1) and Parkly's commission + service fee to Parkly.

## Decision

- Paystack is the primary `PaymentProvider`; Flutterwave implements the same interface behind flag `payments_flutterwave_enabled`.
- No wallet, no stored value, no cash-redeemable credits. Discounts only.
- Bookings are confirmed only by a verified webhook or a server-side verify call; amounts are re-checked server-side.
- Internal double-entry ledger records what the provider moved; it never holds money.

## Consequences

- Operators must complete Paystack subaccount KYC before a lot goes live.
- Refunds go back through the provider; settlement timing is the provider's.
- Reconciliation against provider settlement reports is required daily (Sprint 7).
- If counsel's opinion changes the structure, this ADR is superseded.
