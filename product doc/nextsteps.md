Agreed. The aim is to make booking feel generous to drivers, while every minute a space is held or used is either paid for or capped, so operators never lose money. Here's a concrete design for us to react to.

Principles

1. Pay for what you use. Drivers shouldn't lose money because traffic or plans changed.
2. A held space is never free for long. Short courtesy windows are free; longer holds cost a little.
3. Never block a paying driver when there's space. Arriving early or staying late becomes a sale, not an error.
4. Operators set the prices and limits; Parkly applies them automatically. Clients still never compute prices (non-negotiable #8).

The design: one flexible booking, three moments

1. Booking: "Park now" or "Reserve for later"
- Park now (emergencies, "on my way"):
  - The driver pays for a minimum stay, say 1 hour, and the space is held for them.
  - The first 60 minutes of holding are free. After that, a small holding fee per 15 minutes applies, up to a cap (e.g. 3 hours), and then the hold is released.
  - The parking clock starts when they check in, not when they book.
  - So a driver stuck in traffic keeps their space; they just pay a little for keeping it waiting.
- Reserve for later: a timed booking as today, with softer edges (below).

2. Arriving: early or late is fine
- Early, with space:
  - Up to 15–30 minutes early is free.
  - Earlier than that, the gate offers "Start now for ₦X?" and charges the extra automatically.
  - If the car park is full, the driver sees the exact time they can come in.
- Running late:
  - A "Running late?" button extends the hold for a fee, instead of losing the space at 30 minutes.
  - Without it, the no-show rule stays, so operators can resell genuinely abandoned spaces.

3. Leaving: pay for actual time
- Leaving late: the overstay is charged automatically at the booking's own rate. This already exists (pay link, and new bookings blocked until it's paid).
- Leaving early (optional, a strong incentive): unused whole hours are refunded to the card. This is a refund, not credit, so it respects the no-wallet rule. Operators can turn it off per car park.

How operators stay safe and earn

- Held time is paid for (holding fees), and the total held time is capped.
- Limited exposure: each car park sets what share of its spaces can be held as "Park now", e.g. at most 30%, so holds can't block the whole lot.
- Prepaid minimum: drivers always pay a minimum up front, so no-shows still earn something.
- Extra time is extra revenue: early starts and overstays are sales, not losses.
- Dynamic pricing within the operator's bounds: peak and off-peak rates, and optionally a higher holding fee when the car park is nearly full. Prices are always computed on the server.

Effort

Much of this reuses what's already built: extensions (for early start and "running late"), overstay pricing and pay links, refunds, the no-show job, and per-plan pricing. The genuinely new parts are the hold-then-start clock, holding fees, the per-car-park hold cap, and peak pricing. I'd suggest an ADR and a short spec first, then building it in stages after S7.

Decisions I need from you

1. Free courtesy windows. Free hold for "Park now": 60 minutes? Free early arrival: 30 minutes? My suggestion is yes to both.
2. Holding fee. A fixed fee (e.g. ₦100 per 15 minutes), or a share of the hourly rate (e.g. 25%)? I'd go with a share of the rate, so it scales with each car park's price.
3. Refund for leaving early. Offer it at launch, or later? I'd say later: start without it and add it once pilot volumes are stable.
4. Timing. Finish S7 (reconciliation, revenue report, finance views) first and then build this as its own sprint, or bring part of it forward now? I'd bring only the clearer check-in message and the early-start-when-space-is-free forward. They're small and fix today's pain.

What do you think of the overall shape before we lock in the numbers?