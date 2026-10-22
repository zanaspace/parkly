# 0007 — Offline QR tickets: per-lot Ed25519 signed tokens, static QR

- **Status:** Accepted (issuing and display in Sprint 4; scanning and manifest sync in Sprint 5)
- **Date:** 2026-10-22
- **Deciders:** Engineering lead
- **Related:** doc 01 §7, doc 02 §2.4 (`lot_signing_keys`), doc 05 §7 and §10, ADR 0005, FR-BOOK-003

## Context

Attendants must check a driver in with no network for 8+ hours (AGENTS.md non-negotiable 5). The phone at the gate must prove, offline, that a QR was issued by Parkly for this lot, this window and this plate.

Two docs described the ticket differently:

- **Doc 01 §7:** a signed token, shown as a **static** QR. Validity is bound to the lot, the window and the plate, and replays are caught by the attendant's local "already checked in" record and by server dedupe.
- **Doc 05 §10:** the same signed token **plus a rotating 30-second code** derived from a per-booking seed. The attendant manifest would carry check data for every seed.

## Decision

1. **Each lot has its own Ed25519 key pair** in `lot_signing_keys`. At most one key per lot is ACTIVE.
   - The private key is stored only as FieldCrypto envelope ciphertext (`ENC_KEY_V<n>`) and never leaves the API.
   - The public key and its `kid` go to attendant devices.
   - The key is created on the lot's first paid booking. `kid` is a 12-character random id, kept short because it appears in every QR.
2. **Token format** (`packages/domain/src/qr`):
   ```
   PK1.<b64url({kid})>.<b64url(claims)>.<b64url(Ed25519 signature)>
   claims = {b: bookingId, t: "B", l: lotId, p: plateNorm, s: start, e: end, c: code, i: issuedAt, x: start…end + 24 h}
   ```
   The signature covers `"<header>.<claims>"`.
3. **The QR is static** (doc 01 §7), with **no rotating code**.
   - Rotating codes only stop a screenshot being reused. The signed window, plate match, single use at the gate and server dedupe already cover that.
   - Rotating codes also need a per-booking seed kept in secure storage and seed data in every attendant manifest, which is extra offline state to get wrong at the gate.
   - The booking code and plate appear beside the QR as the manual fallback.
4. **Byte mode, error correction L.**
   - QR alphanumeric mode can't hold base64url, so byte mode is used.
   - A ticket is about 370 characters, which gives a 69×69 module code. Level L (7%) is enough for screens, and the app draws the code at 280 px.
5. **One verification routine everywhere:** `verifyQrToken` uses `@noble/ed25519` (Web Crypto, no native modules).
   - It checks the known, unrevoked `kid`, the signature, the lot, and that now is between start − early arrival and end + overstay allowance, before the hard expiry.
   - The attendant PWA (S5) and the API use the same function.
6. **The API signs at read time.** `GET /v1/bookings` and `GET /v1/bookings/:id` return `qrToken` while a booking is CONFIRMED or CHECKED_IN. The driver app keeps paid tickets in secure storage so they open with no signal.

## Consequences

- No new native dependency: the app draws the QR with plain views, and the website draws it as an SVG path. `qrcode-generator` and `@noble/ed25519` are pure JavaScript and MIT-licensed.
- A screenshot can be shown by someone else during the same window. The attendant still matches the plate, and the first check-in wins (doc 02 conflict rules). The rotating code can be added later without changing the token, if fraud data asks for it.
- **Key rotation:** a lot key stays ACTIVE until it is rotated. RETIRING keys stay valid until their bookings end, and REVOKED keys are listed in the manifest (doc 01 §7: 90-day rotation). The rotation job and revocation list arrive with the manifest in Sprint 5.
- Doc 05 §10 now points here for the rotating-code decision.
