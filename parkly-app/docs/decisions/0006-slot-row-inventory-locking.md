# 0006 — Slot-row inventory with `SELECT … FOR UPDATE` in `fn_hold_booking`

- **Status:** Proposed (implemented and accepted in Sprint 4)
- **Date:** 2026-10-14
- **Deciders:** Engineering lead
- **Related:** doc 01 §6, doc 02 §5, FR-BOOK-001, ADR 0002

## Context

A lot sells N interchangeable bays (capacity count, no numbered bays). Two drivers must never both get the last bay for overlapping 15-minute slots, including under retries and concurrent requests.

## Options considered

1. **Exclusion constraint on booking ranges:** only works for one-per-resource; a lot has N bays.
2. **Count overlapping bookings at insert time:** racy without serialisable isolation; serialisation failures under load.
3. **One inventory row per lot per 15-minute slot, locked in order (chosen):** `lot_slot_inventory(lot_id, slot_start, capacity, booked, held, pass_reserved, blocked)`; `fn_hold_booking` locks the window's rows with `SELECT … FOR UPDATE ORDER BY slot_start`, checks every slot has room, increments `held` and inserts the booking in one transaction.

## Decision

Option 3, as a `SECURITY DEFINER` SQL function with pinned `search_path`, executable only by `parkly_api`. Holds expire after `booking.hold_minutes` via a pure-SQL `pg_cron` job.

## Consequences

- Deterministic, testable with concurrent integration tests.
- Row count grows with lots × slots; rows are created on demand and pruned after use.
- Monthly passes reserve capacity via `pass_reserved`; passes themselves use an exclusion constraint (one active pass per vehicle, lot and period).
