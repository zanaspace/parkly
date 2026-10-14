# 14 — Design System: Patterns — Tokens

> Patterns are **recipes**: compositions of components (doc 15) and tokens (docs 07–13, 16) that solve recurring product problems the same way everywhere.
> Package: pattern-level tokens live in `packages/tokens/src/component/patterns.json`; the patterns are built as composed components in `packages/ui` (web) and `packages/ui-native` (native).
> Each pattern lists: when to use, anatomy, tokens, behaviour, accessibility and copy.

---

## 1. Pattern index

| # | Pattern | Platforms | Primary components |
|---|---|---|---|
| P1 | Forms and validation | both | TextField, PhoneField, OtpField, PlateField, Select, Button |
| P2 | Empty states | both | EmptyState, Button |
| P3 | Error states | both | Banner, ErrorScreen, InlineError, Toast |
| P4 | Offline banner and sync status | both (critical in attendant PWA) | OfflineBanner, SyncBadge |
| P5 | Loading skeletons | both | Skeleton |
| P6 | Booking card | both | Card, StatusChip, Text |
| P7 | QR ticket | native + web | Ticket, QrCode, CodeText |
| P8 | Map + list search | native + web | MapView, PriceMarker, BottomSheet, LotCard |
| P9 | Confirmation (pre-action review and success) | both | SummaryList, PriceBreakdown, Button, SuccessHero |
| P10 | Bottom sheets | native + web (< md) | BottomSheet |
| P11 | Toasts | both | Toast |
| P12 | Verified-lot badge and trust strip | both | VerifiedBadge, AmenityChip |
| P13 | Payment hand-off and countdown | both | Countdown, Button, Banner |
| P14 | Attendant scan-and-decide | attendant PWA | ScanView, ResultPanel |
| P15 | Data tables (portal/admin) | web | DataTable, Filters, Pagination |

---

## P1. Forms and validation

**Use:** auth (phone + OTP), vehicle entry, operator onboarding, lot setup, rate plans, admin reviews.

**Anatomy:** visible label → input → helper text or error → (optional) counter. One column on mobile. Primary action in sticky bottom bar (mobile) or right-aligned under the form (web ≥ md).

**Tokens**
| Token | Value |
|---|---|
| `form.field.gap` | `space.stack.md` (16) |
| `form.label-to-input` | `space.stack.xs` (4) |
| `form.section.gap` | `space.stack.lg` (24) |
| `form.max-width` | `container.form` (560) |
| `form.error.color` | `color.status.danger.fg` |
| `form.error.icon` | `circle-alert`, `color.status.danger.icon` |
| `form.required.marker` | text "(required)" in `color.text.secondary`, not an asterisk alone |

**Behaviour**
- Validate **on blur** and **on submit**, never on every keystroke (except format masks). Clear an error as soon as the value becomes valid.
- On submit with errors: focus the first invalid field, show an error summary banner at the top for forms with > 4 fields, announce it (`role="alert"`).
- Server errors (problem+json) map by `code` to field errors where `errors[].pointer` exists, otherwise to a form-level Banner.
- Disable the submit button only while submitting (shows spinner + "Saving…"); never disable it to signal invalid input.
- **Special fields:**
  - `PhoneField`: fixed `+234` prefix, accepts `0803…` or `803…`, formats as `803 123 4567`, `inputMode="tel"`, validates with libphonenumber.
  - `OtpField`: 6 boxes rendered as a single input, `autocomplete="one-time-code"`, Android SMS Retriever, paste supported, resend link with 60 s countdown.
  - `PlateField`: mono font, auto-uppercase, allows letters/digits/space/hyphen, shows normalised preview ("Saved as LND123AB") in helper text.
  - `MoneyField` (operator rates): ₦ prefix, whole naira input, converts to kobo on submit, never floats.

**Copy:** Errors say what's wrong and how to fix: "Enter an 11-digit Nigerian phone number, like 0803 123 4567."

---

## P2. Empty states

**Use:** no search results, no bookings yet, no lots (operator), no incidents, empty filters.

**Anatomy:** spot illustration (≤ 120 dp, optional on `breakpoint.short`) → title (`type.heading.md`) → one sentence (`type.body.md`, `text.secondary`) → one primary action (optional) → secondary link (optional).

**Tokens:** `empty.padding` = `space.inset.xl`; `empty.gap` = `space.stack.md`; `empty.illustration.size` = 120; `empty.max-width` = 360.

**Variants and copy**
| Context | Title | Body | Action |
|---|---|---|---|
| No lots near search | No verified lots here yet | We're adding lots in Victoria Island first. Try a nearby area or tell us where you need parking. | Search another area · Request this area |
| No bookings | No bookings yet | Book a verified space and it will show here. | Find parking |
| Filters exclude all | No lots match your filters | Try removing a filter. | Clear filters |
| Operator, no lots | Add your first lot | You'll need your LASPA permit and a few photos. | Add lot |
| Attendant, no bookings today | No bookings for today yet | Walk-in drivers can still book by scanning the lot QR code. | — |

---

## P3. Error states

Three levels, pick the smallest that fits:

| Level | Component | When | Example |
|---|---|---|---|
| Inline | `InlineError` under a field or inside a card | One field or one item failed | "This plate is already on your account." |
| Section | `Banner` (tone danger/warning) at top of the affected region | A section failed to load or an action failed | "We couldn't load your bookings. [Try again]" |
| Screen | `ErrorScreen` | Whole screen can't render (404, 500, no permission) | "This booking isn't available. It may have been cancelled." + [Go to bookings] |

**Rules**
- Every error offers a next step: retry, go back, contact support (`headset` icon + support number from `brand.ts`).
- Show the problem `code` small in `type.caption` on screen errors (e.g. "Code: BOOKING_SLOT_UNAVAILABLE") so support can help. Never show stack traces or raw messages.
- Retries use exponential backoff for automatic retry; manual "Try again" is always available.
- Payment errors **must** state whether money was taken: "You haven't been charged" or "If you were charged, we'll refund you automatically within 24 hours."
- Tokens: `error.banner.bg` = `color.status.danger.bg`, `error.banner.fg` = `color.status.danger.fg`, `error.icon` = `triangle-alert`.

---

## P4. Offline banner and sync status

**Use:** everywhere, but **critical for the attendant PWA** (doc 00 non-negotiable #5).

**Anatomy:** a full-width bar pinned under the top app bar: `wifi-off` icon + message + (attendant) pending-sync count + last-synced time.

**Tokens**
| Token | Value |
|---|---|
| `offline.banner.bg` / `.fg` | `color.offline.bg` / `color.offline.fg` |
| `offline.banner.height` | 40 (comfortable), 48 (large) |
| `sync.badge.pending` | tone warning, icon `refresh-cw` |
| `sync.badge.synced` | tone success, icon `check` |
| `sync.badge.failed` | tone danger, icon `triangle-alert` |

**Behaviour**
- Appears within 2 s of losing connectivity (NetInfo / `navigator.onLine` **plus** a failed heartbeat to `/v1/health`, because `onLine` lies on captive networks).
- Never blocks the UI. In the driver app, actions needing the network (book, pay) are disabled with an explanation; viewing an existing booking and its QR ticket works offline (cached).
- Attendant: "You're offline. 3 check-ins saved on this phone. Last synced 9:42 am." When back online: banner turns to success "Back online. Syncing 3 check-ins…" then "All synced" and auto-hides after 4 s.
- Sync conflicts (e.g. booking cancelled while offline) appear as a list in Sync Status with clear resolution instructions; never silently dropped.
- Announced via `aria-live="polite"` / `AccessibilityInfo.announceForAccessibility`.

---

## P5. Loading skeletons

**Use:** any content load > 300 ms. Spinners only inside buttons and for < 1 s inline actions.

**Rules**
- Skeleton shapes mirror the final layout (lot card skeleton = image block + 2 text lines + price pill).
- Show skeleton after a **150 ms** delay to avoid flashing on fast loads; keep it at least **400 ms** once shown.
- Shimmer uses `gradient.skeleton` (doc 13), 1200 ms linear loop; static under reduced motion.
- `aria-busy="true"` on the container; skeleton elements `aria-hidden`.
- Tokens: `skeleton.bg` = `color.bg.subtle`, `skeleton.highlight` = `color.bg.muted`, `skeleton.radius.text` = `radius.xs`, `skeleton.radius.block` = `radius.media`, `skeleton.text.height` = 12/16.

---

## P6. Booking card

**Use:** "My bookings" list, home "Upcoming" module, operator booking lists (compact variant).

**Anatomy**
```
┌───────────────────────────────────────────┐
│ [StatusChip: Confirmed]        Today      │
│ Marina Car Park                            │  heading.md
│ Lagos Island · 350 m                       │  body.sm, text.secondary
│ ─────────────────────────────────────────  │
│ 🕘 9:00 am – 5:00 pm      🚗 LND-123-AB   │  body.sm + code.sm
│ ₦3,100                       [View ticket]│  price.md + Button sm secondary
└───────────────────────────────────────────┘
```

**Tokens:** `booking-card.padding` = `space.inset.md`; `.gap` = `space.stack.sm`; `.radius` = `radius.surface`; `.shadow` = `elevation.raised`; `.divider` = `color.border.default`.

**Behaviour**
- Whole card is one pressable target (opens booking detail); the inline button is a secondary target with its own label.
- `CHECKED_IN` card shows elapsed time and "Ends 5:00 pm · Extend" action; within 15 min of end it gets a warning tone banner "Ends in 12 min".
- Accessible name: "Confirmed booking, Marina Car Park, today 9 am to 5 pm, LND-123-AB, ₦3,100".

---

## P7. QR ticket

**Use:** booking detail → "Show ticket"; passes; shown at the gate to the attendant.

**Anatomy**
```
┌─────────────────────────────┐  radius.ticket, elevation.floating
│  gradient.brand header      │
│  Marina Car Park            │  text.on-brand, heading.lg
│  Today · 9:00 am – 5:00 pm  │
├ ◖ - - - - - - - - - - - - ◗ ┤  perforation + 12 px notches
│   ┌───────────────────┐     │
│   │   QR (black/white) │     │  ≥ 220 dp, quiet zone 16
│   └───────────────────┘     │
│        PK-7HQ4MZ            │  code.lg
│        LND-123-AB           │  code.md
│  [ Brightness boosted ☀ ]   │  caption
└─────────────────────────────┘
```

**Rules**
- QR encodes the **signed check-in token** from the API (doc 02); it refreshes per the token rotation rule but the last valid token stays cached for offline display.
- Always black on white (`color.qr.*`), never themed, never over a gradient. Minimum size 220 dp (240 on web); error correction level M.
- Auto-raise screen brightness while visible (`expo-brightness`), restore on leave; keep screen awake (`expo-keep-awake`).
- Booking code always visible in text as a fallback for manual entry by attendants (doc 03 offline flow).
- Works offline: ticket data cached at booking time.
- Screen reader: "Parking ticket. Booking code P K 7 H Q 4 M Z. Plate L N D 1 2 3 A B. Show this screen to the attendant."
- Tokens: `ticket.padding` = `space.inset.lg`; `ticket.qr.size` = 220; `ticket.qr.quiet-zone` = 16; `ticket.notch.size` = 12; `ticket.perforation.color` = `color.border.default`.

---

## P8. Map + list search

**Use:** driver search (native and web).

**Layout**
- **Mobile (< md):** full-bleed map behind a floating search bar (`elevation.floating`); a **bottom sheet** with the lot list, snap points 15% (peek: "12 lots nearby"), 50%, 92%. A "List / Map" toggle button for screen-reader and low-end users who want the list without the map.
- **≥ md:** list pane 40% left, map 60% right; hovering/focusing a card highlights its marker and vice versa.

**Price marker:** pill with `price` label (`₦1,000/h`), `map.marker.*` tokens; selected marker uses primary bg and scales to 1.1; **verified lots only** appear (non-negotiable #2), so markers don't need a verified icon — the detail does.

**Behaviour**
- List renders first from the API; the map loads lazily (performance budget, doc 04 §6). If Maps fails, show list with a Banner "Map unavailable".
- Results sorted by distance by default; sort options: distance, price, rating (Grow phase).
- Filters as chips under the search bar: "Now / Later", "Daily", "Monthly", "Covered", "24 h".
- Clustering when > 30 markers in view.
- Keyboard/screen reader: the list is the primary accessible interface; map markers have labels "Marina Car Park, ₦1,000 per hour, 350 metres".

**Tokens:** `map.search-bar.height` = 52; `map.marker.height` = 32; `map.marker.padding-x` = `space.2`; `map.cluster.bg` = `color.bg.brand`; `sheet.snap.peek` = 0.15.

---

## P9. Confirmation (review before commit, then success)

**Review (before payment / destructive action)**
- `SummaryList` of facts: lot, date/time, duration, vehicle, then `PriceBreakdown` (parking, service fee, **total**) and the cancellation rule in plain words ("Free cancellation until 8:30 am").
- Primary button states the amount: "Pay ₦3,100".
- Destructive confirmations (cancel booking, suspend lot) use a **Dialog** with the consequence spelled out and a danger button with a specific verb ("Cancel booking"), plus a neutral "Keep booking".

**Success**
- `SuccessHero` on `gradient.brand`: check icon draw animation (≤ 400 ms), headline (`display.lg`) "You're booked!", then the ticket preview and actions: "View ticket", "Get directions", "Add to calendar".
- Success screens are reachable again from history (no one-time-only information).
- Announce success via live region.

---

## P10. Bottom sheets

**Use:** search results list, filters, booking options (time/duration picker), vehicle picker, action menus on mobile.

**Tokens:** `sheet.radius` = `radius.sheet`; `sheet.padding` = `space.inset.lg`; `sheet.handle` = 36×4, `color.border.strong`; `sheet.scrim` = `color.bg.overlay`; `sheet.shadow` = `elevation.overlay`; `sheet.max-width` = 640.

**Rules**
- Modal sheets trap focus, have a visible close button (not only swipe), close on scrim tap and Android back.
- Non-modal sheets (search list) don't trap focus and leave the map interactive.
- Above `md`, modal sheets render as centred dialogs.
- Native: `@gorhom/bottom-sheet`; web: Radix Dialog with sheet styling.
- Keep sheets ≤ 1 primary task; never stack two sheets.

---

## P11. Toasts

**Use:** brief, non-critical confirmation of an action the user just took ("Vehicle added", "Booking extended to 7:00 pm"). **Not** for errors that need action (use Banner) or for payment outcomes (use full screens).

**Tokens:** `toast.bg` = `color.bg.inverse`; `toast.fg` = `color.text.inverse`; `toast.radius` = `radius.lg`; `toast.shadow` = `elevation.toast`; `toast.duration.default` = 4000 ms; `toast.duration.with-action` = 8000 ms; `toast.offset-bottom` = above bottom bar + `space.4`.

**Rules:** max one visible at a time (queue the rest); optional single action ("Undo"); `role="status"`; pause timer on hover/focus; never auto-dismiss under 4 s.

---

## P12. Verified-lot badge and trust strip

**Use:** lot detail header, lot cards (badge only), booking review. Trust is the product's core bet; this pattern is how we show it.

**Badge:** pill, `shield-check` icon + "Verified" (`type.label.sm`), `badge.verified.*` tokens (amber). Tapping/clicking opens a sheet "What 'Verified' means".

**Trust strip (lot detail):** a row of `AmenityChip`s derived from the latest approved VerificationRecord:
| Check | Icon | Label |
|---|---|---|
| LASPA permit valid | `file-badge` | LASPA permit · valid to Mar 2027 |
| Guard present | `user-check` | Guard on site |
| CCTV | `cctv` | CCTV |
| Lighting | `lamp` | Well lit |
| Access control | `door-closed` | Gated entry |
| Last verified | `calendar-check` | Verified 12 Sep 2026 |

**Rules**
- Only show checks that passed; never show a failed check as a red chip (a lot with failed critical checks can't be LIVE).
- "What Verified means" sheet copy: "Parkly staff visited this lot and checked its LASPA permit, security, lighting and capacity. Verified on 12 Sep 2026. Report a problem anytime from your booking." No promise of safety.
- Tokens: `trust-strip.gap` = `space.inline.sm`; `amenity-chip.bg` = `color.bg.subtle`; `amenity-chip.fg` = `color.text.primary`; `amenity-chip.icon` = `color.text.brand`.

---

## P13. Payment hand-off and countdown

**Use:** between "Pay" and the provider (Paystack) checkout, and on return.

- Show a holding screen "Opening secure payment…" with the provider name, then open Paystack (in-app browser / SDK).
- Visible **10-minute countdown** of the booking hold (doc 00 §3.6); warning Banner at 2 min; on expiry: "Your hold expired. You haven't been charged." + "Try again".
- On return, show "Confirming your payment…" while polling the API (the API confirms via webhook/verify; the client never decides). Timeouts after 60 s become "We're still confirming. We'll notify you; you won't be charged twice."
- Tokens: `countdown.fg` = `color.text.secondary`, switches to `color.status.warning.fg` at ≤ 2 min; `type.price.md` with tabular numbers to avoid jitter.

---

## P14. Attendant scan-and-decide

**Use:** attendant PWA at the gate. Large density, light theme default.

- Home is the **Scan** screen: camera viewfinder (70% height), big "Enter code" button below, and plate search. Offline banner (P4) on top.
- **Result panel** fills the bottom after a scan, colour + icon + **big text**:
  | Result | Tone | Icon | Headline | Action |
  |---|---|---|---|---|
  | Valid, check in | success | `circle-check` | "Check in · LND-123-AB" | [Check in] (56 dp) |
  | Valid, check out | info | `log-out` | "Check out · parked 7 h 12 min" | [Check out] |
  | Overstay | warning | `clock-alert` | "Overstay 45 min · ₦750 due" | [Send pay link] [Check out] |
  | Wrong lot / date | danger | `circle-x` | "Not for this lot" | [Scan again] |
  | Already used | danger | `circle-x` | "Already checked out at 4:10 pm" | [Scan again] |
  | Unknown (offline, not in manifest) | warning | `help-circle` | "Can't verify offline" | [Check plate] [Call support] |
- Haptic/vibration + short sound on result (toggle in settings).
- Must not require scrolling to reach the action on a 360×640 screen.

---

## P15. Data tables (portal and admin)

- Column headers sortable where useful (`aria-sort`), sticky header, row height 48 (comfortable) / 40 (compact).
- Filters above the table as chips + "More filters" sheet; active filters summarised ("3 filters · Clear").
- Cursor pagination with "Load more" (matches API, doc 00 §3.8); show total only when cheap.
- Money right-aligned, tabular numbers; plates/codes in mono.
- Bulk actions appear in a sticky bar when rows are selected; destructive bulk actions require a Dialog.
- Below `md`, tables collapse to cards (one card per row, key fields only) unless it's an admin finance table, which scrolls horizontally inside its container.
- Export (CSV) is an explicit button and is audit-logged (doc 05).

---

## Pattern tokens (DTCG excerpt)

```json
{
  "form": {
    "field": { "gap": { "$type": "dimension", "$value": "{space.stack.md}" } },
    "max-width": { "$type": "dimension", "$value": "{container.form}" }
  },
  "ticket": {
    "qr": {
      "size": { "$type": "dimension", "$value": "220px" },
      "quiet-zone": { "$type": "dimension", "$value": "16px" }
    },
    "radius": { "$type": "dimension", "$value": "{radius.ticket}" },
    "header": { "bg": { "$type": "gradient", "$value": "{gradient.brand}" } }
  },
  "toast": {
    "duration": {
      "default": { "$type": "duration", "$value": "4000ms" },
      "with-action": { "$type": "duration", "$value": "8000ms" }
    }
  },
  "skeleton": {
    "delay": { "$type": "duration", "$value": "150ms" },
    "min-visible": { "$type": "duration", "$value": "400ms" }
  },
  "offline": {
    "banner": {
      "bg": { "$type": "color", "$value": "{color.offline.bg}" },
      "fg": { "$type": "color", "$value": "{color.offline.fg}" }
    }
  }
}
```
CSS names follow the path: `--pk-ticket-qr-size`, `--pk-toast-duration-default`, `--pk-offline-banner-bg`. RN: `theme.pattern.ticket.qr.size`.
