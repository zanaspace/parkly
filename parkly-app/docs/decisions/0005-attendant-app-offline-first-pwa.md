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
