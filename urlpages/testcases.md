# Parkly — Test Plan, Sprints 1–6 and gap fixes

28 Oct 2026

This plan checks that Sprints 1 to 6 work end to end, and that the gap-review fixes on branch `fix/s6-wave1` close the loopholes they target. It has 55 tests across the driver website, mobile app, operator portal, attendant gate app and admin console.

Work top to bottom: each sprint sets up what the next one needs (an approved operator, a live car park, a paid booking). Tests marked **DB** only work after the 5 new migrations are applied to the dev database. Items in "Known not working yet" are expected to fail for now.

To mark a test passed, change `- [ ]` to `- [x]`. If one fails, add a line under it starting `FAIL:` with what you saw, and save a screenshot next to this file.

## Before you start

Start the API first, then the apps. Each one runs in its own terminal, inside `parkly-app`.

| App | Who uses it | Start | Open |
| --- | --- | --- | --- |
| API | every app | `pnpm --filter @parkly/api dev` | http://localhost:4000/health/ready shows `"db":"ok"` |
| Driver website | drivers | `pnpm --filter @parkly/web dev` | http://localhost:3000 |
| Operator portal | owners, managers | `pnpm --filter @parkly/portal dev` | http://localhost:3001 |
| Attendant gate app | attendants, owners, managers | same as the portal | http://localhost:3001/attend |
| Admin console | Parkly staff | `pnpm --filter @parkly/admin dev` | http://localhost:3002 |
| Driver mobile app | drivers | `pnpm --filter @parkly/mobile tunnel` | scan the QR code with Expo Go |

**For overstay tests**, start the API with `$env:TEST_SHORT_STAYS='on'` and the website with `$env:NEXT_PUBLIC_TEST_STAYS='on'`. For mobile, set `$env:EXPO_PUBLIC_TEST_STAYS='on'` and `$env:EXPO_PUBLIC_API_URL='http://192.168.100.120:4000'`. This adds a "5 min (Test)" stay.

**Accounts you need:**

- A **driver**: signs in with an email code (ADR 0015) on the website or mobile app. A second driver is needed for some tests.
- An **operator owner**: signs up in the portal with email and password, then sets up an authenticator app (TOTP).
- An **attendant**: invited by the owner from Team.
- A **Parkly admin**: an admin account with TOTP, created by Parkly staff.

**Paystack test card:** `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.

**Database:** the local API uses the dev Supabase database. Tests marked **DB** need the 5 gap-review migrations applied there first. Paste this file into the dev project's SQL Editor and run it (it applies all or nothing):
`C:\Users\CI-STAFF\AppData\Local\Temp\claude\C--Users-CI-STAFF-Documents-parkly\f4767d3b-9653-4c96-ba82-ebfecfbec15e\scratchpad\wave1-migrations-for-dev.sql`

## Sprint 1: sign-in and accounts

Proves that each kind of user can sign in, that owners and admins need a second factor, and that people only reach their own data.

- [ ] **1.1 Driver signs in with an email code** (website)
  1. Open http://localhost:3000/sign-in and enter a driver email address.
  2. Type the 6-digit code from the email.
  3. Open My bookings.

  **Expect:** you are signed in and see your own bookings only. A wrong code is refused with a clear message.

- [ ] **1.2 Driver signs in on mobile and adds a car** (mobile)
  1. Open the app in Expo Go and sign in with an email code.
  2. Go to Account, then add a vehicle with plate `LND 123 AB`.

  **Expect:** the car is saved and shown as the default. Adding the same plate twice is refused.

- [ ] **1.3 Operator owner signs up and sets up MFA** (portal)
  1. Open http://localhost:3001/sign-up, create an account and confirm the email.
  2. Sign in and follow the prompt to scan the QR with an authenticator app.
  3. Sign out and sign in again.

  **Expect:** you are asked for the 6-digit authenticator code every time. Without it you can't reach the portal pages.

- [ ] **1.4 Admin signs in with MFA** (admin)
  1. Open http://localhost:3002/sign-in with an admin account.
  2. Enter the password, then the authenticator code.

  **Expect:** the admin home loads. A driver or operator account is shown "no access".

- [ ] **1.5 One person can't see another's data** (website)
  1. Sign in as driver A and copy a booking's URL, `/bookings/<id>`.
  2. Sign out, sign in as driver B and open that URL.

  **Expect:** "not found", never driver A's booking.

## Sprint 2: operators and car parks

Proves an operator can be checked and approved, list a car park, and have it go live only after Parkly approves it. Do these in order: each one sets up the next.

- [ ] **2.1 Owner enters business details** (portal)
  1. Signed in as the owner from 1.3, open http://localhost:3001/onboarding.
  2. Fill in the business name, type and contact details, then save.

  **Expect:** the business shows on http://localhost:3001/business.

- [ ] **2.2 Owner submits business checks (KYB)** (portal)
  1. Open http://localhost:3001/kyb.
  2. Upload the requested documents (PDF or image) and enter the payout bank account.
  3. Submit.

  **Expect:** status "In review". The payout account can no longer be edited after submitting.

- [ ] **2.3 Admin approves the business** (admin)
  1. Open http://localhost:3002/kyb and pick the operator.
  2. Open each document, then approve.

  **Expect:** the operator becomes Active. Viewing and approving both appear in http://localhost:3002/audit-logs.

- [ ] **2.4 Owner creates a car park** (portal)
  1. Open http://localhost:3001/lots/new.
  2. Enter the address and map pin, capacity, opening hours and an hourly price. Add photos and the parking permit.
  3. Submit for review.

  **Expect:** the car park shows "Pending verification". It does **not** appear in driver search yet.

- [ ] **2.5 Admin verifies and takes the car park live** (admin)
  1. Open http://localhost:3002/lots and pick the new car park.
  2. Record the site visit, approve the permit and the price, then set it live.

  **Expect:** status Live. The car park now appears in driver search (3.1). Each step is in the audit log.

- [ ] **2.6 Only approved car parks show to drivers** (admin, website)
  1. In admin, suspend the car park, or approve one whose permit has already expired.
  2. Search for it on http://localhost:3000.

  **Expect:** it doesn't appear, and booking it directly is refused. It may take up to 10 minutes to vanish from search suggestions (known caching, O-7).

- [ ] **2.7 Owner invites an attendant** (portal)
  1. Open http://localhost:3001/team and invite an attendant by email.
  2. As the attendant, open the invite link and accept.

  **Expect:** the attendant shows as Active on Team. An expired or reused link is refused.

## Sprint 3: search and car park pages

Proves drivers find live car parks near where they're going, with the right price and free spaces.

- [ ] **3.1 Search near a place** (website, mobile)
  1. On http://localhost:3000, pick an area such as Victoria Island, a date, a time and "2 hours".
  2. Repeat on the mobile app's Home screen.

  **Expect:** a list and map of live car parks, each with a distance, a price for the stay and free spaces. Sorting by price works.

- [ ] **3.2 Search by car park name** (website, mobile)
  1. Type part of a car park's name in the search box.

  **Expect:** suggestions show matching live car parks only.

- [ ] **3.3 Car park page** (website)
  1. Open a car park from the results.

  **Expect:** photos, address, map, opening hours, the price for your chosen time, and a Book button.

- [ ] **3.4 Closed or invalid times** (website)
  1. Search for a time when the car park is closed, a time in the past, and a time more than 30 days ahead.

  **Expect:** a closed car park says "Closed at that time". Past or too-far times are refused with a message.

- [ ] **3.5 5-minute test stay only when switched on** (website, mobile)
  1. Start the API and the website without the test-stay switches, then open the duration list.
  2. Restart them with the switches on (see Before you start), then open it again.

  **Expect:** "5 min (Test)" appears only the second time.

## Sprint 4: booking, payment and QR ticket

Proves a driver can hold a space, pay with Paystack and get a signed ticket. A space is never sold twice, and a booking is only confirmed by Paystack.

- [ ] **4.1 Book and pay on the website** (website) **DB**
  1. From a car park page, tap Book, pick your car and continue to pay.
  2. Pay with the Paystack test card.

  **Expect:** you return to the booking. It shows **Confirmed**, a booking code `PK-XXXXXX` and a QR ticket.

- [ ] **4.2 Book and pay in the app** (mobile) **DB**
  1. Repeat 4.1 in the mobile app.

  **Expect:** same result. The QR ticket still shows with the phone in airplane mode.

- [ ] **4.3 Back-to-back bookings both confirm** (website) **DB** (gap fix P-1)
  1. Book and pay 10:00–11:00 tomorrow at one car park.
  2. As a second driver, book and pay 11:00–12:00 at the same car park.

  **Expect:** both are **Confirmed**. Before the fix the second payment was taken but the booking stayed "Pending payment".

- [ ] **4.4 A full car park refuses more bookings** (website) **DB**
  1. In the portal, set a test car park's bookable capacity to 1.
  2. Book it for a time with one driver, then try the same time with another driver.

  **Expect:** the second driver is told there's no space. The first booking is unaffected.

- [ ] **4.5 Same car can't be booked twice at once** (website) **DB**
  1. Book a car for 10:00–12:00, then book the same car elsewhere for 11:00–13:00.

  **Expect:** the second booking is refused.

- [ ] **4.6 Unpaid holds give the space back** (website) **DB**
  1. Start a booking but close the Paystack page without paying.
  2. Wait 10 minutes and refresh the booking.

  **Expect:** the booking shows Expired and the space is free again.

- [ ] **4.7 Paying slowly still confirms** (website) **DB**
  1. Start a booking, pay by bank transfer, and close the browser before returning.
  2. Wait 2–3 minutes, then open My bookings.

  **Expect:** Confirmed, even though you never came back from Paystack. The safety-net job checked with Paystack. This job is triggered on the deployed dev API, so test this one there, not on localhost.

## Sprint 5: attendant gate app and operator controls

Proves attendants can check cars in and out in seconds, with or without network, and owners can control their car parks. You need a confirmed booking from Sprint 4 for today, and the attendant from 2.7.

- [ ] **5.1 Attendant phone needs the owner's approval** (attendant app, portal)
  1. On the attendant's phone or a browser, open http://localhost:3001/attend, sign in, pick the car park and set a PIN.
  2. **Expect:** "Waiting for approval".
  3. As the owner, open http://localhost:3001/team and approve the phone.

  **Expect:** the attendant app loads today's list of expected cars.

- [ ] **5.2 Check in by scanning the QR ticket** (attendant app) **DB**
  1. Scan the driver's QR ticket from the app or website.

  **Expect:** green "Checked in" in under 3 seconds. The driver's booking shows Checked in with a running timer.

- [ ] **5.3 Check in by booking code and by plate** (attendant app) **DB**
  1. Search by the code `PK-XXXXXX`, then by the plate `LND123AB`.

  **Expect:** both find the booking and check it in. Spaces and the letter case don't matter.

- [ ] **5.4 Works with no network** (attendant app) **DB**
  1. Put the phone in airplane mode.
  2. Check in 3 cars: one by QR, one by code, one by plate.
  3. Turn the network back on.

  **Expect:** all 3 work offline. Within a minute of reconnecting they sync, and the portal's live occupancy goes up by 3. Nothing is lost.

- [ ] **5.5 A ticket can't be used twice** (attendant app) **DB**
  1. Scan a ticket that's already checked in.

  **Expect:** "Already checked in", not green.

- [ ] **5.6 Wrong car park, wrong day, cancelled** (attendant app) **DB**
  1. Scan a ticket for another car park, one for tomorrow, and one that was cancelled.

  **Expect:** each is refused with the reason.

- [ ] **5.7 Check out and overstay** (attendant app, website) **DB**
  1. Check out a car more than 10 minutes after its booking ended.

  **Expect:** the driver's booking shows the overstay time and amount to pay.

- [ ] **5.8 Walk-ins** (attendant app, portal)
  1. Add a walk-in car, then remove one.

  **Expect:** the portal's occupancy shows the walk-in count change. It never goes below 0.

- [ ] **5.9 Pause and resume a car park** (portal, website)
  1. In http://localhost:3001/lots, pause a live car park.
  2. Search for it as a driver, then resume it.

  **Expect:** paused, it is hidden from search but existing bookings still work. Resumed, it's back.

- [ ] **5.10 Opening hours can't strand bookings** (portal) **DB**
  1. Try to change the hours so that an existing booking falls outside them.

  **Expect:** refused, naming the booking. A change that affects no booking is saved.

- [ ] **5.11 No-shows** (website) **DB**
  1. Book a stay starting soon and don't check in.
  2. Wait 30 minutes after the start.

  **Expect:** the booking becomes No-show and its space is released.

## Sprint 6: extend, cancel and refund, overstay, receipts

Proves the whole stay is handled without cash, and that money is taken once and refunded correctly. Every test here needs the migrations (**DB**). Gap-fix IDs are in brackets.

- [ ] **6.1 Extend a stay** (mobile, website) **DB** (P-2, P-3)
  1. On a confirmed or checked-in booking, tap Extend, then "+1 hour".
  2. Pay with the test card.

  **Expect:** the end time moves 1 hour later and the price goes up once. Refreshing several times changes nothing more.

- [ ] **6.2 Abandon an extension, then try again** (mobile) **DB** (P-4)
  1. Tap Extend "+1 hour" and close Paystack without paying.
  2. Tap Extend "+1 hour" again and pay.

  **Expect:** the second attempt works straight away, and only 1 hour is added.

- [ ] **6.3 Extension past closing time is refused** (mobile) **DB**
  1. Extend a booking at a car park that closes soon, past its closing time.

  **Expect:** a message saying when it closes and reopens; no payment starts.

- [ ] **6.4 Can't extend over time already used** (mobile) **DB** (P-11)
  1. Check in a 5-minute test stay and wait 15 minutes past its end.
  2. Try to extend.

  **Expect:** "This stay has already ended. Pay the overstay at check-out instead."

- [ ] **6.5 Cancel early, full refund** (website) **DB**
  1. Cancel a confirmed booking more than 30 minutes before it starts.

  **Expect:** "Full refund". The Paystack test dashboard shows one refund for the full amount.

- [ ] **6.6 Cancel late, no refund** (website) **DB**
  1. Cancel a confirmed booking less than 30 minutes before it starts.

  **Expect:** it's cancelled with no refund, and you're told so before confirming.

- [ ] **6.7 Cancel an extended booking** (website) **DB** (P-8)
  1. Take the booking from 6.1, which has two payments, and cancel it early.

  **Expect:** **two refunds** in Paystack: one for the booking amount and one for the extension, each against its own transaction.

- [ ] **6.8 Pay overstay once** (mobile, website) **DB** (P-7)
  1. After 5.7, open the booking and tap Pay overstay.
  2. Go back and tap Pay overstay again, or open it in a second tab.

  **Expect:** the same Paystack checkout both times. After paying, the overstay shows Paid and you can't pay it again.

- [ ] **6.9 Receipt** (mobile, website) (S-2, S-3)
  1. In the app, tap View Official Receipt. On the website, open the booking's receipt.

  **Expect:** a styled receipt with the car park, plate, times, lines and payments. In the app's browser, the address is `/v1/receipts/…?exp=…&sig=…` with no `token=`.

- [ ] **6.10 Receipt link expires** (mobile) (S-2)
  1. Copy the receipt link from 6.9 and open it again after 5 minutes.

  **Expect:** "This receipt link has expired". Change one letter of `sig=` and it says the same.

- [ ] **6.11 Reminders** (mobile) — **expected to fail** (L-1)
  1. Book a stay starting in 60 minutes.

  **Expect today:** no reminder arrives. Notifications only work in the test store; fixing this is Wave 3.

## Security fixes to re-check

These prove the gap-review loopholes are closed. Each one tries the old trick and expects it to fail.

- [ ] **7.1 Self check-in poster is signed** (portal, mobile) (G-1)
  1. In http://localhost:3001/lots, open a car park, switch Self check-in on and open its Poster page.
  2. **Expect:** the QR's text ends in an extra signed part, e.g. `PKG1.<lot-id>.Ab3dE…`.
  3. Standing near the car park's pin, during a booking's time, scan the poster in the mobile app.

  **Expect:** "Checked in". Away from the car park, expect "too far". Old posters printed before this change are refused: reprint them.

- [ ] **7.2 A code made from the lot id is refused** (mobile) (G-1)
  1. Make a QR code whose text is just `PKG1.<lot-id>` (any online QR maker), then scan it in the app at the car park.

  **Expect:** refused as the wrong car park's code (`QR_WRONG_LOT`). Before the fix this checked you in from anywhere.

- [ ] **7.3 The attendant's code changes every minute** (attendant app, mobile) (G-2)
  1. In the attendant app, open Gate QR for drivers.
  2. **Expect:** the QR changes about once a minute, with no code text shown under it.
  3. Photograph it, wait 3 minutes, then scan the photo with the driver app.

  **Expect:** the fresh code checks you in, even when the owner has self check-in off. The 3-minute-old photo is refused.

- [ ] **7.4 Fake GPS is refused** (mobile, Android) (G-1)
  1. Turn on a fake-location app and scan the poster.

  **Expect:** "Turn off any fake-location app, then scan again."

- [ ] **7.5 A blocked phone stays blocked** (portal, attendant app) (S-1)
  1. As the owner, Block the attendant's phone on Team.
  2. On that phone, sign out of the attendant app and sign in again.

  **Expect:** still blocked. Before the fix, signing in again quietly unblocked it.

- [ ] **7.6 Moving a phone to another car park needs approval** (attendant app) (G-3)
  1. With an approved attendant phone, pick a different car park, ideally at another operator where the attendant also works.

  **Expect:** "Waiting for approval" at the new car park.

- [ ] **7.7 A blocked phone's offline check-ins are kept, not applied** (attendant app, portal) (G-6)
  1. Put the phone offline and check in one car.
  2. As the owner, block the phone. Then put the phone back online.

  **Expect:** the phone says it's blocked and clears its data. The car is **not** checked in; the event is kept on the server for review.

- [ ] **7.8 Receipts show typed text as text** (portal, admin, website) (S-3)
  1. As the owner, rename a test car park to `<b>Bold</b> Park`, and have it approved.
  2. Open a receipt for a booking there.

  **Expect:** the name shows literally as `<b>Bold</b> Park`, not in bold.

- [ ] **7.9 A token in the URL is refused** (any browser) (S-2)
  1. Open `http://localhost:4000/v1/bookings/<id>/receipt?format=html&token=anything`.

  **Expect:** a sign-in error (401). Before the fix a real token worked in the URL.

## Known not working yet

Don't log these as new bugs; they are planned for Wave 3 of the gap review (`parkly-app/docs/sprints/S0-S6-gap-review.md`).

| Area | What you'll see | Gap ID |
| --- | --- | --- |
| Reminders and notifications | No reminder, confirmation or cancellation messages | L-1 |
| Push notifications | The app never registers for push | U-6 |
| Unpaid overstay | A driver with unpaid overstay can still book again; no ops waive | L-4 |
| Overstay price | Uses the car park's current hourly rate, not an operator overstay price | L-3 |
| Receipts | No PDF or email; no receipt number or VAT note | L-5 |
| Extension price | Not shown before Paystack opens | U-3 |
| Refund webhooks | Can't reach localhost; test on the deployed dev API | P-8 |
| Payment safety net | Runs only against the deployed dev API | — |
| Lot closures for holidays | Not built | O-5 |
| Sign-in codes | Still expire after 1 hour on dev until the Supabase dashboard is changed to 300 s | S-4 |
