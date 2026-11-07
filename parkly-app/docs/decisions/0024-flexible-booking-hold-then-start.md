# 0024 — Flexible booking: "Park now" hold-then-start, holding fees, and hold capacity caps

- **Status:** Accepted
- **Date:** 2026-11-06
- **Deciders:** Product owner, engineering lead
- **Amends:** ADR 0023 (implements Stage 3); doc 02 §3.1 booking timing and inventory rules; doc 03 driver booking and check-in flows
- **Related:** ADR 0004 (Paystack split payments, no stored value), ADR 0016 (overstay pricing and driver timer), ADR 0023 (flexible arrival), FR-BOOK-001, FR-BOOK-005, FR-BOOK-008, Never-do #1 (no stored value), #8 (prices only from server)

## Context

Under ADR 0023 Stage 1 & 2, drivers benefit from clear check-in opening times (30 minutes prior to reservation) and optional paid early start. However, when a driver needs to park immediately ("on my way" / emergency / variable Lagos traffic):
1. In a fixed-window model, drivers lose time if traffic delays their arrival, or their booking expires after 30 minutes under the standard no-show rule.
2. Conversely, letting drivers reserve indefinite holding without payment risks operator inventory being tied up for free.
3. Car park operators need guarantee that inventory is protected, exposure to speculative holds is bounded, and every minute a space is held or used is either paid for or capped.

As decided in `product doc/nextsteps.md` (Agreed Decisions, Nov 6, 2026), Stage 3 introduces "Park now" alongside "Reserve for later".

## Decision

### 1. Two Booking Modes
- **`RESERVE` (Reserve for later):**
  - Scheduled booking window fixed in advance (`startAt` to `endAt`), as before.
  - Check-in opens 30 minutes before `startAt` (ADR 0023 Stage 1).
  - Subject to standard 30-minute no-show release if gate is operational.
- **`PARK_NOW` (Park now / on my way):**
  - The driver prepays for an initial duration (at least the lot's minimum stay, e.g. 1 hour).
  - A space is immediately reserved and held for the driver upon payment confirmation.
  - Check-in is open immediately.
  - **Hold-then-start clock:** The actual parking stay timer starts at **check-in**, not at booking time. If a driver booked 1 hour, their parking stay duration runs for 1 hour starting from the moment the gate checks them in.

### 2. Courtesy Hold Window & Holding Fees
- **Free Courtesy Window:**
  - The first **60 minutes** (`free_hold_minutes`) from booking confirmation are free of holding fees.
- **Accrued Holding Fee:**
  - If check-in occurs after the free hold window, a holding fee accrues for the additional time held:
    - Rate: **25% of the hourly rate per started 15-minute block** (equivalent to 100% of the hourly rate per hour held).
    - "Hourly rate" is the booking's own rate plan (`rate_plans.hourly_rate_kobo`), or, for a plan without one, the booking's price per hour booked. It is never the booking's total price (fixed 2026-11-07: a 3-hour hold was charged three times over).
    - Minimum floor: **₦150 (15,000 kobo)** per 15-minute holding block.
  - **Checkout Collection:** To avoid micro-transaction fees and gateway overhead, accrued holding fees are **not** charged upfront or as separate intermediate transactions. Instead, they are tallied and collected at **checkout** alongside any overstay fees (or on the final settlement). As built: at check-out (gate sync or self check-out) the fee is added to the session's overstay amount, and the overstay payment charges the total. A stay closed automatically after 12 hours (G-9) charges nothing, so its holding fee is not collected.
- **Hold Release Cap (No-Show):**
  - Holds are capped at **`max_hold_minutes`** (default **180 minutes / 3 hours**).
  - If the driver has not checked in by `holdStartedAt + max_hold_minutes`, the hold is released, freeing the space for other drivers.
  - The booking status transitions to `NO_SHOW`.
  - The prepaid initial stay is retained by the operator to cover the dedicated hold, preserving operator revenue.

### 3. Operator Protection & Hold Capacity Caps
- To prevent "Park now" holds from blocking an entire car park:
  - Each lot configures **`hold_cap_percent`** (default **30%**, range 0–100%).
  - Maximum concurrent active holds: $\lfloor \text{capacityBookable} \times \frac{\text{hold\_cap\_percent}}{100} \rfloor$.
  - An active hold is any booking in `PENDING_PAYMENT` (during the 10-minute payment hold) or `CONFIRMED` where `checkedInAt IS NULL` and the hold has not expired.
  - If active holds reach the lot's cap, new `PARK_NOW` quotes/bookings are rejected with `HOLD_CAP_REACHED` (`409 Conflict`), prompting the driver to reserve a scheduled slot instead.

### 4. Server-Calculated Pricing & No Stored Value
- In strict adherence to Non-Negotiables #1 (no stored value) and #8 (prices only from server):
  - Clients never calculate holding fees or remaining hold allowances.
  - The server evaluates rates, caps, and accrued fees.
  - All holding fee revenue is split according to the lot's commission terms at settlement.

## Consequences

- Drivers gain immense flexibility: getting stuck in traffic does not waste their paid parking time.
- Operators are protected against inventory lockup through capacity caps, courtesy window limits, and holding fee accumulation.
- The gate attendant manifest and QR scanner continue to work seamlessly: `PARK_NOW` bookings are immediately valid for check-in once paid.

