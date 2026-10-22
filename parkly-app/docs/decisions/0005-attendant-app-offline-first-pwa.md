# 0005 — Attendant app as an offline-first PWA

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Product lead, engineering lead
- **Related:** doc 00 §3.10 rule 5, doc 01 §5.3 and §7, FR-CHK-*, NFR-OFFLINE

## Context

Attendants use low-end Android phones with little storage, unreliable data and power. Check-in must keep working for 8+ hours offline. Attendants change often, so installing and updating an app is a real cost.

## Options considered

1. **React Native app (shared with driver app code):** strong offline storage and camera, but Play Store install and update friction per attendant device.
2. **Offline-first PWA in the operator portal (chosen):** opened from a link, installable to home screen, updates silently; service worker + IndexedDB for the manifest and event queue; camera QR scanning via the browser.

## Decision

The attendant app lives at `/attend` in `apps/portal` as a PWA. It caches the lot's booking manifest and the lot's Ed25519 public key, verifies QR tickets offline, queues check-in/out events with idempotency ids, and syncs signed batches when online.

## Consequences

- No store release needed for attendant changes.
- iOS PWA storage limits matter less (Android-first pilot); revisit if operators use iPhones.
- Camera scanning depends on browser support; manual code and plate lookup are always available.
- Revisit if offline storage proves unreliable on pilot devices.

## Implementation (Sprint 5)

- **Where:** `apps/portal/app/attend` (page) and `components/attend/*` (screens A-01 to A-06 and the issue report). Gate logic is in `lib/attend/*`, which uses `@parkly/domain/checkin` and `@parkly/domain/qr`, so the phone and the API decide the same way.
- **API access:** a same-origin bridge `/attend/api/{lots|devices|manifest|sync}` adds the access token from the httpOnly session cookie, so the page never handles tokens. Only those four calls are passed on.
- **Offline:** IndexedDB holds the settings (device id, lot, PIN hash, clock offset), the manifest and the event queue. A service worker (`public/attend-sw.js`) serves the last good `/attend` page and Next's hashed files, so the app opens with no network. Events leave the queue only on APPLIED, DUPLICATE or CONFLICT; REJECTED events are kept for the sync screen.
- **Camera:** the browser's `BarcodeDetector` (Chrome on Android), with `jsqr` on a canvas otherwise. Code and plate lookup always work.
- **PIN:** 6 digits, kept as PBKDF2-SHA256 with a random salt. The app locks after 5 minutes idle, and 5 wrong tries wipe the phone's Parkly data. A blocked phone (`DEVICE_REVOKED`) is wiped too.
- **Sign-in:** for now, the person's portal account. Owners' and managers' phones are approved automatically; attendant phones need a manager's approval. Attendant email-code sign-in and invites by email follow ADR 0015.
- **Not yet:**
  - batches signed with a device key
  - a delta manifest
  - background sync while the app is closed
