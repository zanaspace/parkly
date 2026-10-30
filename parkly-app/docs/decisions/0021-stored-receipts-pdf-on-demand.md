# 0021 — Receipts are stored and numbered; the PDF is drawn on demand

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** Product owner, engineering lead
- **Amends:** gap review L-5 fix ("store the PDF in a private bucket"); doc 20 S6 task 5 ("private bucket")
- **Related:** FR-BOOK-009; doc 06 §3 (receipts row); ADR 0020 (email goes through the outbox)

## Context

Gap review L-5 found the receipt was rebuilt from live records on every view: no receipt number, `issuedAt` changed each time, pending refunds showed as refunded, there was no permit number, no VAT note, no PDF and no email.

The fix proposed a PDF stored in a private Storage bucket. Doc 06 already says receipts are "generated on demand from booking/payment". A stored PDF would be a second copy of C3 data to secure, retain and delete, and it would go stale on the next refund.

Parkly's VAT position is not settled yet. The product owner asked for VAT to be designed in but switchable.

## Decision

1. **One `receipts` row per booking** (RLS on, API role only). It holds a frozen JSON `content`, the operator's sequence number (`R-000123`, from `receipt_counters` under a row lock), a `revision`, and `issued_at`/`revised_at`.
2. **Issued when money comes in.** Settling a payment issues the receipt (first payment) or revises it (extension, overstay). Viewing it also brings it up to date, so a refund shows on the next view. Unchanged content never makes a new revision.
3. **Identity is fixed at first issue:** the issuer (operator trading name), lot name and address, LASPA permit number, vehicle, driver and VAT terms. Later revisions change only money and status, so renaming a lot or renewing a permit never rewrites an old receipt.
4. **The PDF is drawn from the stored content on each request** with `pdf-lib` (MIT, no native code). Every copy of a revision is the same. No bucket. The standard PDF font has no ₦ sign, so the PDF shows `NGN`.
5. **The confirmation email carries the PDF** as an attachment, through the email provider interface (Resend supports attachments).
6. **VAT is off by default.** `fees.vat_enabled` (false), `fees.vat_rate_bps` (750) and `company.vat_number` live in `platform_settings`. Prices already include any VAT, so switching it on changes only what the receipt shows: "Includes VAT at 7.5%: ₦X", computed on what was kept after refunds.

## Consequences

- Two views of a revision are identical, and numbers have no gaps per operator except where a first issue failed and rolled back.
- No Storage bucket, lifecycle rule or signed download for receipts. The API renders a PDF per request (tens of milliseconds).
- `pdf-lib` has had no release since 2021. It is small and has no dependencies; if it ever needs replacing, only `receipt-pdf.ts` changes.
- Switching VAT on affects receipts issued after the switch; earlier receipts keep their first terms.
