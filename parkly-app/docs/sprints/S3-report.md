# Sprint 3 — Lot discovery: progress report

- **Status:** In progress. Stories 1–5 are done (pricing engine, availability, driver lot API, demo data + latency check, driver website).
- **Updated:** 2026-10-22
- **Entry check:** S2 is done (code complete); its open items are in `S2-report.md` § Carried over and doc 20 §6. The Google Maps key is being created by the owner (PRD §12: needed by S3); work that needs it comes last.

## Goal (doc 20)

Drivers find verified lots near a destination and see accurate prices and availability, on the mobile app and on the web.

## Stories (in build order)

| # | Story | FR / task | Status |
|---|---|---|---|
| 1 | Pricing engine (`packages/domain/pricing`): hourly (minimum stay + 15-min blocks, daily cap per Lagos day), daily, monthly, service fee, commission split, extension and overstay | FR-BOOK-002, task 1 | **Done** |
| 2 | Availability: `lot_slot_inventory` table + read path (`availableCount` for a window), booking window limits, opening hours | task 2 | **Done** |
| 3 | Driver lot API: `GET /v1/lots/search` (PostGIS, LIVE only, distance, price and availability for the window), `GET /v1/lots/:idOrSlug`, availability, `POST /v1/lots/:id/quote`; public photo links | FR-LOT-101/102, task 3 | **Done** |
| 4 | Seed script with realistic Victoria Island lots; latency check | task 7, exit criterion | **Done** |
| 5 | Web: search + results + lot page (public, SEO) | FR-LOT-101/102, task 6 | **Done** |
| 6 | Mobile: home/search, results list + map, lot detail, time picker, quote | task 5 | To do |
| 7 | Places autocomplete + place details proxied through the API (Google key) | FR-LOT-101, task 4 | Waiting for the Google Maps key |
| — | Fix: operators change prices on live lots; rejected changes show their reason | FR-LOT-005 | **Done** |

### Story 1: pricing engine

- `quote({ratePlan, startAt, endAt, settings})` returns the price, service fee, total, commission and operator share with display lines, or `PRICING_INVALID_DURATION` (off the 15-min grid, empty, or shorter than the minimum stay).
  - **HOURLY:** the minimum stay is charged as one amount (`rate × minMinutes / 60`), then each 15-minute block at `round_half_up(rate / 4)`. The minimum belongs to the start day; each block to the Lagos day it starts in; `dailyCapKobo` caps each Lagos day.
  - **DAILY:** the daily rate for every Lagos calendar day the stay touches.
  - **MONTHLY:** a flat rate for 30 days from the start date (period end = start + 29 days), no service fee.
  - **Service fee** below 24 h; **commission** on the parking price only, never on the fee.
- `extensionQuote` charges the whole new stay minus what was paid (never negative, no fee), so blocks and caps stay consistent; `overstayCharge` charges whole blocks past `endAt + grace` at the hourly block price, or daily rate / 24 per hour.
- **Tests:** the 8 mandatory worked examples of doc 02 §4 plus boundaries, rounding, minimum-stay variants, Lagos vs UTC midnight, multi-day caps, the fee threshold, extensions into the cap, overstay grace and the daily fallback (30 tests). Domain: 365 tests.

### Story 2: availability

- **Domain** (`packages/domain/availability`): `availableInWindow` (minimum over the window's slots of capacity − booked − held − pass − blocked; a slot without a row offers the lot's bookable capacity; never negative); `checkSearchWindow` (15-minute grid, from the next slot + `booking.min_lead_min`, at most `booking.max_advance_days` ahead, hourly stays at most `booking.max_duration_hours` → `SEARCH_INVALID_WINDOW`); `isOpenDuring` (every slot inside the Lagos opening hours, 24-hour days and overnight windows; a daily stay needs hours on each day it touches).
- **Database:** `lot_slot_inventory` (migration `20261021234755_lot_slot_inventory` + grants `20261021234800`): primary key (lot, slot), checks for the 15-minute grid, non-negative counts and `booked + held + pass + blocked ≤ capacity`; RLS with the API policy; no id or timestamps (high-volume, doc 02). Rows are written by the booking functions in S4, so for now every slot is free up to the bookable capacity.
- **Store:** `inventory.slots(lotIds, from, to)`.
- **Checked against the dev database** (rolled back): both migrations apply, RLS on, the window query returns the right rows, off-grid slots and over-capacity counts are refused.
- **Tests:** +13 domain (availability), +1 schema. ADR 0006 stays Proposed until `fn_hold_booking` (S4).
- **Owner step:** apply the two migrations on dev in the SQL editor, as before.

### Story 3: driver lot API

- **Endpoints** (public, no sign-in; doc 02 §6.3):
  - `GET /v1/lots/search?lat&lng&radiusM(≤5000, default 2000)&startAt&endAt&product(HOURLY|DAILY)&amenities&sort(distance|price)`: up to 50 lots, nearest first (PostGIS `ST_DWithin` / `ST_Distance` on `geography`), each with the server quote for the window, free spaces, "closed at that time" and the first public photo. A lot that doesn't sell the product, or whose minimum stay is longer than the search, is left out.
  - `GET /v1/lots/{idOrSlug}`: the public lot page (no operator internals): hours, amenities, approved photos (up to 8), ACTIVE prices, and the verified sheet (permit number's last 4, visit date, checks passed). `cache-control: public, s-maxage=60`.
  - `GET /v1/lots/{lotId}/availability` and `POST /v1/lots/{lotId}/quote` (HOURLY, DAILY, MONTHLY).
- **Listing gate in SQL** (doc 00 non-negotiable 2): LIVE, operator ACTIVE with KYB APPROVED, an APPROVED permit and an APPROVED verification both valid on today's Lagos date. Search, the lot page, availability and quotes all use it, so a permit that expires before the 06:00 job runs is already hidden.
- **Prices** come only from the domain engine with the operator's commission and `platform_settings` fees; responses carry price, fee, total and lines, never commission or the operator's share.
- **Public photos:** migration `20261022010000_public_lot_photos` makes `lot-photos-public` a public bucket (doc 06: C1, "public read"); links are permanent CDN URLs built by `StorageProvider.publicUrl`. Only approved, EXIF-stripped WebP copies are ever written there.
- **Checked against the dev database** (rolled back): the 2 km search finds only the near lot with its distance, 5 km finds both in order, a lot without a permit is never shown, an expired date hides lots, lookups by id and slug, prices, hours, current permit and visit.
- **Tests:** +15 API (discovery, incl. the PRD Gherkin scenario and a check against the domain engine), +1 storage adapter, +3 contracts. API: 540 tests, branches 86.4 %.
- **Errors:** `SEARCH_INVALID_WINDOW`, `BOOKING_WINDOW_INVALID`, `BOOKING_OUTSIDE_OPENING_HOURS`, `PRICING_INVALID_DURATION`, `LOT_NOT_BOOKABLE` (product not sold), `LOT_NOT_FOUND`.
- **Owner step:** apply `20261022010000_public_lot_photos.sql` on dev.

### Fix: price changes on live lots (FR-LOT-005)

Found while testing search on dev: the "Testing" lot's hourly price had been rejected, and the operator could not submit a new one because prices were editable only on draft lots.

- Prices can now change while a lot is DRAFT, LIVE or PAUSED (still not while under review, suspended or archived). On a live lot the current price stays live; the change waits for admin approval and then applies to new bookings only (approval retires the old price, S2 slice E2).
- The operator's lot page shows a rejected change with its reason ("Not approved: …") until they submit a new one.
- The admin lot queue shows "Price changes: N to review" on each lot, so changes on live lots are noticed.
- **Checked against the dev database** (rolled back): the Testing lot's rejected hourly price is returned with its reason; a new change shows as 1 to review in the LIVE queue.
- **Tests:** +3 API, +1 store contract. API: 543 tests.

### Story 4: demo data and the latency check

- **Script** `pnpm --filter @parkly/api seed:demo -- --confirm-dev` (`apps/api/scripts/seed-demo.ts`): 12 demo car parks on real street names in Victoria Island (8), Ikoyi (2) and Lekki Phase 1 (2), each with its own operator named "… (demo)" (KYB approved), an approved permit, an approved site visit, live prices, hours and amenities, so they are LIVE and listable. No real business names; descriptions say "Not a real Parkly partner".
  - `--perf 500` adds 500 synthetic lots for the latency check; `--remove` deletes every demo lot and operator; `--dry-run` does the work and rolls it back.
  - Safety: needs `--confirm-dev`, refuses `APP_ENV=prod`/`staging`, data only (never schema), idempotent (existing slugs are skipped), batched inserts.
  - The data is checked by tests: inside Lagos State, unique `demo-` slugs, prices and hours the domain accepts, centred on Victoria Island (doc 00 Q1).
- **On dev now:** the 12 demo lots are loaded. A 5 km search around Victoria Island returns 10 of them (the two Lekki lots are just over 5 km away).
- **Latency** (exit criterion: p95 < 800 ms with 500 lots): with 512 lots loaded on dev, 40 searches from Lagos against the live dev API (5 km radius, 50 results each) took **p50 325 ms, p95 508 ms, max 665 ms**, network included. The 500 extra lots were then removed. `tests/load/search.js` is the k6 scenario of doc 02 §12.9 (100 users, p95 < 500 ms) for staging before launch.
- **Tests:** +3 (demo data).

### Story 5: driver website (`apps/web`)

- **Home (D-10/D-11)** `/`: search by area (9 Lagos areas, Victoria Island first, doc 00 Q1) or "Near me" (browser location), date (today to 30 days ahead), arrival time on the quarter hour and duration (1–12 hours or a full day); popular-area shortcuts. A plain GET form, so it works before JavaScript loads.
- **Results (D-12)** `/search`: verified car parks nearest first (or cheapest), each with photo (or placeholder), area and distance, facilities, the "Verified" badge, spaces band ("Few left" under 5, "Full", "Closed at that time") and the server's total for the window. Nothing within 2 km widens to 3 km automatically (doc 03 §1.2), then an empty state with "Search within 5 km". Not indexed by search engines.
- **Lot page (D-13, public SEO page)** `/lots/{slug}`: photos, address, the exact price for the chosen time with the server's breakdown and total, free spaces, "Booking opens soon" (S4), directions (Google Maps link, no key needed), entrance notes, rate card, opening hours with today highlighted, facilities, the verified sheet (visit date, permit last 4, checks passed, operator) and policies. Page title, description and schema.org `ParkingFacility` data for search engines; the lot data is cached for 60 s.
- **Prices are never computed in the browser** (doc 00 §3.4): every amount shown comes from the API's quote; the site only formats kobo as naira.
- **Checked against the live dev API** (local run): Victoria Island returns 9 demo car parks with totals and spaces; Ikeja widens to 3 km and shows the empty state; the lot page prices 10 hours at ₦5,000 + ₦100 fee = ₦5,100; unknown lots return 404; a past date shows a plain message.
- **Until the Google Maps key is ready** there is no interactive map and no typed-address search (story 7); the area list and "Near me" cover search.
- **Tests:** +11 (web search helpers: defaults, Lagos time, full days, links, labels).
