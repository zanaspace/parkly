# 0023 — Flexible arrival: book now or for later, arrive when you can, pay for what you use

- **Status:** Accepted (stage 1 built; stages 2 to 4 planned)
- **Date:** 2026-11-06
- **Deciders:** Product owner, engineering lead
- **Amends:** doc 02 §3.1 booking timing and no-show rules (as each stage lands); doc 03 driver booking and check-in flows
- **Related:** ADR 0016 (overstay), FR-BOOK-005 (extensions), FR-BOOK-008 (unpaid overstay block), Never-do #1 (no stored value), #8 (prices only from the server)

## Context

Parkly is a timed-reservation system. The driver picks a start and an end and pays up front. The space is counted as theirs per 15-minute slot. The gate lets the car in from 30 minutes before the start (`booking.early_arrival_min`). A car not in 30 minutes after the start is a no-show and its space is released.

That protects capacity and price, but it fails real drivers:

- **Arriving early.** A driver who arrives early when there is free space is refused with "It's too early or too late for this booking", which doesn't even say which. Reported on dev, 2026-11-06.
- **Emergencies.** A driver who books "now" and is stuck in Lagos traffic loses the space at 30 minutes.
- **Committing to a time.** Drivers have to commit to an arrival time they can't know.

The product owner asked for a model that rewards drivers and creates value rather than restricting them, is dynamic, and stays safe for operators to make money.

## Decision

**Principles:** pay for what you use; a held space is never free for long; never turn away a paying driver when there is space; operators set the prices and limits, and Parkly applies them on the server.

One flexible booking, three moments:

1. **Booking.**
   - **Reserve for later:** timed, as today.
   - **Park now:**
     - The driver pays a minimum stay up front and the space is held until they arrive.
     - The **first 60 minutes of holding are free**. After that, a **holding fee of 25% of the hourly rate** is charged per 15 minutes held, up to a cap set by the operator. At the cap the hold is released.
     - The parking clock starts at check-in.
2. **Arriving.**
   - **Up to 30 minutes early is free** if a space is free.
   - Earlier than that, the driver is offered a **paid early start** priced from the booking's own plan, when there is space. If the car park is full, they're told the exact time they can come in.
   - A **"Running late?"** action extends the hold for a fee instead of losing the space. Without it, the no-show rule still frees abandoned spaces.
3. **Leaving.**
   - Late: overstay is charged at the booking's own rate (ADR 0016, unchanged).
   - Early: refunding unused whole hours to the card is **deferred**. It's a refund, never credit, and can be added once pilot volumes are steady.

**Operator safety:**
- Held time is paid for and capped.
- Each car park caps the share of its spaces that can be held as "Park now" (default 30%).
- Drivers always prepay a minimum.
- Early starts, late holds and overstays are extra revenue.
- Optional peak pricing within the operator's bounds.

**Staging:**

| Stage | What | When |
|---|---|---|
| 1 | Show when check-in opens instead of a refusal: `checkInOpensAt` on the booking, mobile and web show "Check-in opens at 11:30 (30 minutes before your booking)", the button appears on time, and a refused check-in says "You're early. You can check in from 11:30." or "This booking ended at 14:00." | **Built** (2026-11-06) |
| 2 | Paid early start when there is space (reuses extension holds, payments and journals, at the start instead of the end) | Next, before S7 task 4 |
| 3 | Park now: hold-then-start clock, free 60 min, holding fee, per-lot hold cap, "Running late?" | Its own sprint after S7 |
| 4 | Peak pricing; refund unused time | After the pilot settles |

## Consequences

- Drivers aren't refused for things that aren't mistakes, and emergencies keep their space.
- New revenue lines for operators (early start, holding fee), each priced on the server from the booking's own plan.
- Stage 3 changes the booking model (`start` becomes "arrive by"), slot inventory and the no-show job, and needs its own design pass and tests before it starts.
- The offline gate still decides from the manifest. A paid early start needs the driver's phone online (it is a payment), and the attendant manifest carries the new start once paid.
