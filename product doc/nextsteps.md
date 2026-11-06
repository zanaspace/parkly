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

## Agreed Decisions (Nov 6, 2026)

1. **Free courtesy windows:**
   - Free hold for "Park now": **60 minutes**.
   - Free early arrival: **30 minutes** (built in ADR 0023 stage 1).
2. **Holding fee:**
   - **Share of hourly rate (25% per 15 minutes / 100% per hour held)** with a ₦150 floor. Accrued holding fees to be collected at checkout to avoid micro-transaction fees.
3. **Refund for leaving early:**
   - **Deferred to Phase 2 (post-pilot)** to prevent card refund processing delays and gateway fee losses.
4. **Roadmap & Sprint Timing:**
   - ADR 0023 Stages 1 & 2 (clear check-in timer + paid early start when space is free) are **built and committed** on `feat/early-start`.
   - **Proceed immediately with completing Sprint 7** (Task 4: Daily reconciliation job, Task 5: Revenue reports, Task 6: Admin finance views).
   - Package the remaining flexible booking features (hold-then-start clock, holding fee billing, hold capacity caps) into **Sprint 8**.

---

## 5. Operator Financial Dashboard & Payout Views (Scheduled Next)

### Context & Gap Analysis
In Sprint 7 Task 5, we engineered and verified the complete backend financial reporting engine (`GET /v1/operators/{operatorId}/reports/revenue` and `GET /v1/operators/{operatorId}/reports/statements` with PDF generation). However, the **Operator Portal (`apps/portal`)** currently only displays operational and compliance metrics (lots, bookable bays, live gate scanner, KYB status, and staff counts). 

Car park owners cannot currently view their financial KPIs (gross cash collected from drivers, platform commissions, net payouts, or overstay revenue) on their portal dashboard or download their monthly financial statements.

### Feature Scope & Deliverables
1. **Executive Financial Cards on Operator Dashboard (`apps/portal/app/(protected)/page.tsx`)**:
   - **Total Driver Cash Collected (Gross)**: Real-time sum of completed booking and overstay payments.
   - **Net Operator Earnings**: Actual revenue credited to the operator's bank account.
   - **Platform Commission (10%)**: Clear visibility into fees deducted.
   - **Overstay Revenue & Counts**: Extra earnings captured from overstaying vehicles.
2. **Dashboard Period Filter**:
   - Dynamic range toggles: `Today` | `This Week` | `This Month` | `All Time`.
3. **Operator Financial & Statements Hub (`apps/portal/app/(protected)/finance/page.tsx`)**:
   - Daily breakdown table showing date, bookings count, gross intake, commission, and net earnings.
   - Monthly Financial Statement list with one-click official PDF downloads for accounting and tax filing.
   - Payout subaccount destination indicator (verifying linked bank account).

### Timeline & Build Order
- **Timing**: **To be built immediately next** (bridges Sprint 7 reporting to the Operator Portal UI before kicking off the Admin Support & NDPA Console).
- **Effort**: Low-to-medium (backend APIs, ledger accounting, and statement generators are already implemented, tested, and operational).
