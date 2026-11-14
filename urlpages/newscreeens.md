1. Driver Mobile App (apps/mobile)

Passes List Screen (passes.tsx)

Displays active, upcoming, and past 30-day monthly passes with status chips (ACTIVE, HELD, EXPIRED, CANCELLED).
Shows active waitlist entries when a lot's pass capacity is sold out.
Direct shortcut added to the bottom tab bar (BottomNav.tsx).

Pass Detail & QR Screen (pass/[id].tsx)

Renders the Ed25519-signed 30-day Pass QR code (t: 'P').
Displays validity dates, lot address, vehicle plate snapshot, and pass status.
Vehicle Swap Action: Lets drivers swap their registered plate up to 2 times per billing month (FR-PASS-004).
One-Tap Renew: Seamlessly renews the pass for another 30 days before expiration.
Self check-in / check-out buttons.

Account & KYC Verification Screen (account.tsx)

Driver Identity Verification (Tier 2 KYC) flow (FR-AUTH-009): Input for FRSC Driver’s License + Date of Birth, or 11-digit NIN via Dojah.
Displays the green ✓ Verified Driver badge once verified.

Lot Detail Screen (lot/[slug].tsx)

Highlights monthly pass pricing and shows if a car park enforces the "Verified Driver Required" restriction.
2. Driver Web App (apps/web)

Passes Dashboard (app/passes/page.tsx)

Web view for commuters to manage their monthly parking subscriptions and view waitlist positions.

Pass Detail & QR Page (app/passes/[id]/page.tsx)

Full-page pass view with QR code, pass code, vehicle details, swap modal, and renewal checkout.

Pass Modals & Forms (components/pass-forms.tsx)

Buy Monthly Pass modal and checkout form.
Join Waitlist modal (appears automatically when a lot reaches its 50% monthly pass cap).
Swap Vehicle modal with counter for remaining swaps.
3. Operator Portal & Attendant PWA (apps/portal)

Capacity Blackout Management Screen (components/capacity-blocks.tsx)

Embedded inside Lot Management (lots/[lotId]/page.tsx).
Allows operators to schedule full or partial maintenance/event blackouts (blocking either a set number of bays or the entire facility) with conflict prevention against existing bookings.
Toggle switch to require Verified Driver status for entry on that lot (FR-PASS-005).

Attendant Gate Screen (components/attend/attend-app.tsx & gate.ts)

Scanner UI updated to recognize t: 'P' pass QR codes (both online and offline).
Displays distinct blue PASS badge and ✓ Verified Driver tag.
Enforces the one-vehicle-in-lot rule, flashing an alert if the pass is already checked in.