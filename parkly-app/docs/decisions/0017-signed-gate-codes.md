# 0017 — Signed gate codes for driver self check-in

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Product owner
- **Supersedes:** the "as built (S5)" poster format in ADR 0016 §4
- **Related:** ADR 0016, ADR 0007, gap review G-1, G-2 (`docs/sprints/S0-S6-gap-review.md`)

## Context

Self check-in accepted `PKG1.<lotId>` from the entrance poster and `PKGA.<lotId>` from the attendant's phone. Every booking carries its lot id, and the lot's location is public. A driver could therefore build either code and send the lot's coordinates from anywhere. Checking out early from home stopped the overstay charge while the car stayed parked. `PKGA` also bypassed the owner's "self check-in off" switch.

## Decision

1. **The poster code is signed:** `PKG1.<lotId>.<sig>`, where `sig` is the first 16 base64url characters of HMAC-SHA256(server pepper, `gate-poster:<lotId>`). Only the owner's portal receives it, to print. Driver apps never do.
2. **The attendant's phone shows a code that changes every minute:** `PKGA.<lotId>.<minute>.<sig>`, where `sig` = HMAC-SHA256(lot gate key, `PKGA.<lotId>.<minute>`), truncated the same way. The lot gate key is HMAC(pepper, `gate-attendant-key:<lotId>`). It is sent only in the attendant manifest, so the phone can make codes offline. A code is accepted for 2 minutes. The raw text is no longer displayed.
3. The API checks the signature before anything else and answers `QR_WRONG_LOT` when it is wrong. The geofence, booking window and the owner's switch apply as before.
4. Driver apps refuse mocked locations (Android) and fixes less accurate than the 150 m radius.

## Consequences

- **Posters printed before this change stop working.** Owners must print the poster again from `/lots/:lotId/poster`.
- A photo of the poster still works for anyone who has been to the lot. The poster proves "was here once", not "is here now". The attendant's code is the stronger proof. Self check-out against the poster is still a residual risk, for the S7 dashboard to surface (method `SELF`).
- Rotating the pepper (`HASH_PEPPER_V1`) replaces every poster and gate key at once. Per-lot rotation needs a version column (not built).
- A stolen attendant phone exposes only that lot's gate key, until the pepper rotates.
