# Sprint 3 — Lot discovery: progress report

- **Status:** In progress. Story 1 (pricing engine) is done.
- **Updated:** 2026-10-22
- **Entry check:** S2 is done (code complete); its open items are in `S2-report.md` § Carried over and doc 20 §6. The Google Maps key is being created by the owner (PRD §12: needed by S3); work that needs it comes last.

## Goal (doc 20)

Drivers find verified lots near a destination and see accurate prices and availability, on the mobile app and on the web.

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Pricing engine (`packages/domain/pricing`): hourly (minimum stay + 15-min blocks, daily cap per Lagos day), daily, monthly, service fee, commission split, extension and overstay | FR-BOOK-002, task 1 | **Done** |
| 2 | Availability: `lot_slot_inventory` table + read path (`availableCount` for a window), booking window limits | task 2 | To do |
| 3 | Driver lot API: `GET /v1/lots/search` (PostGIS, LIVE only, distance, price and availability for the window), `GET /v1/lots/:idOrSlug`, availability, `POST /v1/lots/:id/quote`; public photo links | FR-LOT-101/102, task 3 | To do |
| 4 | Seed script with realistic Victoria Island lots | task 7 | To do |
| 5 | Web: search + results + lot page (public, SEO) | FR-LOT-101/102, task 6 | To do |
| 6 | Mobile: home/search, results list + map, lot detail, time picker, quote | task 5 | To do |
| 7 | Places autocomplete + place details proxied through the API (Google key) | FR-LOT-101, task 4 | Waiting for the Google Maps key |

### Story 1: pricing engine

- `quote({ratePlan, startAt, endAt, settings})` returns the price, service fee, total, commission and operator share with display lines, or `PRICING_INVALID_DURATION` (off the 15-min grid, empty, or shorter than the minimum stay).
  - **HOURLY:** the minimum stay is charged as one amount (`rate × minMinutes / 60`), then each 15-minute block at `round_half_up(rate / 4)`. The minimum belongs to the start day; each block to the Lagos day it starts in; `dailyCapKobo` caps each Lagos day.
  - **DAILY:** the daily rate for every Lagos calendar day the stay touches.
  - **MONTHLY:** a flat rate for 30 days from the start date (period end = start + 29 days), no service fee.
  - **Service fee** below 24 h; **commission** on the parking price only, never on the fee.
- `extensionQuote` charges the whole new stay minus what was paid (never negative, no fee), so blocks and caps stay consistent; `overstayCharge` charges whole blocks past `endAt + grace` at the hourly block price, or daily rate / 24 per hour.
- **Tests:** the 8 mandatory worked examples of doc 02 §4 plus boundaries, rounding, minimum-stay variants, Lagos vs UTC midnight, multi-day caps, the fee threshold, extensions into the cap, overstay grace and the daily fallback (30 tests). Domain: 365 tests.
