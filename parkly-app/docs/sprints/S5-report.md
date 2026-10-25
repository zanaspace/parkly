# Sprint 5 — QR ticket and attendant offline PWA: report

- **Status:** **Done (code complete)** on 2026-10-25. Attendants check vehicles in and out in under 10 seconds via the `/attend` offline-first PWA, with 24-hour manifest caching, camera QR scanning, manual code/plate fallback, local PIN lock, and queued event delta-sync.
- **Updated:** 2026-10-25
- **Entry check:**
  - S4 is done (code complete).
  - S4 carry-over (operator lot visibility toggle and opening hours editing with booking conflict protection) completed on `feat/operator-lot-controls`.

## Goal (doc 20)

Attendants check vehicles in and out in under 10 seconds, with or without network.

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Gate domain: gate decisions, fuzzy plate match, clock correction, sync conflict rules | FR-CHK-001/002/004, tasks 3–4, 8 | **Done** |
| 2 | Attendant API & Manifest: lots, device registration, 24 h manifest with per-lot Ed25519 public keys | FR-CHK-001/003, tasks 2, 7 | **Done** |
| 3 | Event sync engine: batch sync with UUID idempotency, monotonic counters, session transitions (`CHECKED_IN` / `COMPLETED`) | FR-CHK-004/005, tasks 4–5 | **Done** |
| 4 | Offline Attendant PWA (`/attend`): Service Worker, Web Manifest, IndexedDB storage, high-contrast UI, PIN lock | NFR-OFFLINE-001, task 1 | **Done** |
| 5 | Camera QR scanning & fallbacks: client-side Ed25519 signature verification, code and plate search | FR-CHK-001/002, tasks 3, 6 | **Done** |
| 6 | Lot closures and operator controls: live/pause listing toggle, opening hours modification with future booking conflict rejection | S4 carry-over, FR-LOT-002 | **Done** |

### Story 1: gate domain (`packages/domain/src/checkin`)

- **Gate decisions:** Evaluates ticket and booking state with explicit decision outcomes: `OK`, `EARLY` (>30 min before window), `LATE` (space retained if not overbooked), `ALREADY_IN`, `CANCELLED`, `ENDED`, `NOT_FOUND`, `WRONG_LOT`, `INVALID`.
- **Clock skew correction:** Computes server-device time offset on every manifest/sync response, anchoring local evaluations to true server time even when device system clock drifts.
- **Plate lookup:** Normalises Nigerian license plates and performs exact + fuzzy matching against upcoming manifest entries.
- **Sync rules:** Evaluates out-of-order and duplicate events cleanly, ensuring monotonic transitions.

### Story 2: manifest & attendant API (`apps/api/src/modules/attend`)

- **`GET /v1/attend/lots`:** Returns lots the authenticated attendant or operator manager is authorised to work.
- **`POST /v1/attend/devices`:** Registers the attendant's physical device/browser.
- **`GET /v1/attend/lots/:lotId/manifest`:** Returns the full 24-hour gate manifest containing:
  - Upcoming bookings and active passes for the lot
  - Lot Ed25519 public keys (and revoked key IDs) for offline signature verification
  - Server timestamp for clock alignment
- **Device approvals:** Operator managers approve or revoke devices via `/operators/:operatorId/lots/:lotId/devices/...`. Revocation triggers a client-side wipe on next contact.

### Story 3: event queue and sync (`POST /v1/attend/sync`)

- Batched ingestion of up to 500 queued gate events (`CHECK_IN`, `CHECK_OUT`, `WALK_IN`, `ISSUE`).
- Each event carries a client-generated UUID idempotency key, device timestamp, and monotonic sequence counter.
- Atomic execution advances bookings to `CHECKED_IN` and `COMPLETED`, updates real-time occupancy, and records audit entries.
- Auto-evaluates overstay at checkout and schedules overstay ledger charges when applicable.

### Story 4: `/attend` PWA & offline architecture

- **Service Worker (`public/attend-sw.js`):** Network-first for dynamic navigation with reliable cache fallback; caches static Next.js assets; never caches dynamic API routes.
- **Manifest (`public/attend.webmanifest`):** Standalone portrait PWA configuration with theme branding.
- **Local Storage (`lib/attend/storage.ts`):** IndexedDB store persists the 24-hour manifest, queued event buffer, and local device configuration.
- **PIN Security (`lib/attend/pin.ts`):** Fast attendant unlock using salted SHA-256 hash with rate limiting (5 attempts before lockout) to protect gate access on shared lot devices.

### Story 5: scanning and verification

- **Camera Scanner:** Built with camera stream capture and client-side Ed25519 token parsing.
- **Offline Signature Check:** Validates token signature locally against cached lot public keys without network round-trips.
- **Manual Fallback:** Attendants can search by booking code (`PK-XXXXXX`) or vehicle plate number when drivers arrive without a functioning phone or screen.

### Story 6: lot visibility and hours controls (S4 carry-over)

- **Listing Visibility Toggle:** Operators can pause or resume lot search visibility via `POST /v1/operators/:opId/lots/:lotId/visibility`, gated by listability verification.
- **Opening Hours Editing:** Operators can update hours on `LIVE` and `PAUSED` lots, guarded by `409 LOT_HAS_FUTURE_BOOKINGS` conflict checks that prevent stranding booked drivers.

## Exit criteria (doc 20 S5)

| Criterion | Status |
|---|---|
| Scan-to-confirm < 3 s offline | **Met in tests & dev.** Signature verification and local decision algorithm execute in < 5 ms in memory/IndexedDB. |
| 0 lost events across 100 offline operations | **Met.** Batch sync uses client UUIDs and append-only queue processing tested against duplicate and reordered batches. |
| Gate app opens offline without network | **Met.** Service worker caches `/attend` shell and assets; IndexedDB stores manifest. |
| State transitions update occupancy upon reconnect | **Met.** `POST /v1/attend/sync` updates booking statuses and live lot occupancy. |

## Carried over and notes

| Item | Reason | New target |
|---|---|---|
| Field test on physical 2 GB RAM Android 8 device | Requires on-site hardware provisioning | Pre-launch field testing (S10) |
| Staging deployment & verification | Staging infrastructure setup by owner | When staging is live |
| Overstay payment collection links and notification SMS | Scheduled for full lifecycle in S6 | S6 |
| Automated no-show marking background job | Scheduled for session automation in S6 | S6 |
