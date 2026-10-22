# 0016 — Operators set the overstay price; drivers see a live timer; owners can allow self check-in

- **Status:** Accepted (build: timer and self check-in in Sprint 5; overstay price, Extend and reminders in Sprint 6)
- **Date:** 2026-10-23
- **Deciders:** Product owner
- **Related:** doc 02 §4 (OVERSTAY), §8 settings, FR-BOOK-005 Extend, FR-BOOK-008 Overstay, FR-CHK-002/003, ADR 0004, ADR 0007

## Context

Drivers pay in advance for a booked window (ADR 0004). Some don't know how long they will stay. Overstay was priced at the lot's hourly rate per started 15 minutes, after a platform grace of 10 minutes. Some car parks have no one at the gate.

## Decision

1. **Prepaid booking stays.** Drivers who don't know their stay book a minimum, then **Extend** from the app (S6). Time past the end becomes overstay at check-out.
2. **The driver's timer** starts at check-in. It counts down to the end, which moves with each extension. Reminders go out before the end, e.g. 15 minutes before and at the end, each with **Extend**. If the driver doesn't extend, then after the grace it **counts up the overstay** and shows the charge growing. At check-out it shows the total time parked and the final overstay.
3. **Operators set the overstay price; Parkly regulates it:**
   - an optional overstay price per 15 minutes on the rate plan; when it is empty, the hourly rate ÷ 4 is used (today's behaviour)
   - Parkly approves it with the rest of the price, as for every rate plan change
   - a platform maximum, `fees.overstay_max_multiplier` (default 2× the hourly block), refused above that
   - the grace is at least the platform's `session.overstay_grace_min` (10); operators may give more
   - the overstay price is shown on the lot page, at review and pay, and on the ticket
4. **Self check-in is an owner's choice per car park (off by default):**
   - when on, the lot shows a Parkly QR at the entrance, which the driver scans in the app to check in and to check out
   - it is accepted only near the lot (phone location within about 150 m) and only inside the booking window (30 min early allowed)
   - self check-ins are marked `SELF` for the operator
   - the gate phone (owner, manager or attendant) keeps working as before
   - *as built (S5):* the poster's QR holds `PKG1.<lotId>` (not secret: being there, in time, with your own paid booking is what counts); the owner switches it on the lot page and prints the poster from `/lots/:lotId/poster`; the driver app shows "Check in yourself" / "Check out yourself" on the ticket; the server applies it as a normal check-in event with method `SELF`, so overstay pricing and occupancy are the same; the phone's position is checked and not stored

## Consequences

- No pay-at-exit for the pilot: a saved-card option (`saved_cards_enabled`) can come later if drivers ask for it.
- A photographed entrance QR is useless away from the lot. Location can be spoofed by a determined user, so self check-in stays optional and visible to operators.
- Price changes (including overstay) keep going through admin approval and apply to new bookings only.
