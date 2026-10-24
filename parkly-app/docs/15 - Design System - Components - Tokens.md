# 15 — Design System: Components — Tokens

> Package: component tokens in `packages/tokens/src/component/<component>.json`; implementations in `packages/ui` (web: React + Tailwind preset + Radix primitives) and `packages/ui-native` (React Native + `useTheme()`).
> CSS: `--pk-<component>-<part>-<property>` · RN: `theme.component.<component>.*`
> Component tokens reference **semantic** tokens only (doc 04 §12).

## 1. Conventions

- **Platform:** `web`, `native`, or `both`. "Both" means the same API (props, variants) in both packages; implementations differ.
- **Sizes:** `sm` (36 dp high), `md` (44 web / 48 native, default), `lg` (56, attendant + primary CTAs). Interactive hit area is always ≥ 48 dp on native (doc 16).
- **States:** default, hover (web), pressed, focus-visible, disabled, loading, error/invalid, selected. Each state has explicit tokens.
- Every component: forwards `ref`, accepts `testID`/`data-testid`, has a Storybook (web) / Storybook RN story with all variants in light + dark, and an accessibility test (axe for web, `@testing-library/react-native` roles for native).
- Names below are the export names.

## 2. Inventory

| # | Component | Platform | Variants | Sizes | Used in |
|---|---|---|---|---|---|
| 1 | `Button` | both | primary, secondary, ghost, danger, on-brand, link | sm, md, lg | everywhere |
| 2 | `IconButton` | both | ghost, secondary, on-brand | sm, md, lg | app bars, map controls |
| 3 | `Fab` | native, web < md | primary | md | "Map/List" toggle |
| 4 | `TextField` | both | default | md, lg | forms |
| 5 | `PhoneField` | both | — | md, lg | auth, profile |
| 6 | `OtpField` | both | — | md | auth |
| 7 | `PlateField` | both | — | md, lg | vehicles, attendant search |
| 8 | `MoneyField` | web | — | md | rate plans |
| 9 | `Select` / `Picker` | both | — | md | forms |
| 10 | `DateTimePicker` | both | date, time, range | md | booking time |
| 11 | `DurationStepper` | both | — | md, lg | booking duration, extend |
| 12 | `Checkbox` | both | — | md | forms, tables |
| 13 | `Radio` / `RadioCard` | both | plain, card | md | rate selection, vehicle choice |
| 14 | `Switch` | both | — | md | settings |
| 15 | `SegmentedControl` | both | — | sm, md | "Now / Later", "Daily / Monthly" |
| 16 | `SearchBar` | both | default, on-map | md | search |
| 17 | `Chip` | both | filter (toggle), input (removable), amenity | sm, md | filters, trust strip |
| 18 | `Badge` | both | neutral, info, success, warning, danger, verified | sm | counts, labels |
| 19 | `StatusChip` | both | maps Booking/Lot status (doc 07 §3.1) | sm | booking card, tables |
| 20 | `VerifiedBadge` | both | default, on-photo | sm, md | lot card, lot detail |
| 21 | `Card` | both | raised, outlined, flat, interactive | — | everything |
| 22 | `LotCard` | both | list, compact, horizontal (map carousel) | — | search |
| 23 | `BookingCard` | both | default, compact | — | bookings |
| 24 | `Ticket` | both | booking, pass | — | QR ticket (doc 14 P7) |
| 25 | `QrCode` | both | — | 220–320 | ticket |
| 26 | `CodeText` | both | booking-code, plate | sm, md, lg | codes |
| 27 | `PriceBreakdown` | both | — | — | checkout, receipts |
| 28 | `SummaryList` | both | — | — | review screens |
| 29 | `ListItem` | both | default, navigation, with-switch | md | settings, menus |
| 30 | `Avatar` | both | image, initials | sm, md, lg | profile, operator members |
| 31 | `Banner` | both | info, success, warning, danger | — | section messages |
| 32 | `OfflineBanner` | both | offline, reconnecting, synced | — | global |
| 33 | `SyncBadge` | both (attendant) | pending, synced, failed | sm | attendant |
| 34 | `Toast` | both | neutral, success, danger | — | feedback |
| 35 | `Dialog` | both | default, destructive | — | confirmations |
| 36 | `BottomSheet` | native, web < md | modal, non-modal | — | search list, pickers |
| 37 | `Menu` / `Popover` | web (native → ActionSheet) | — | — | overflow menus |
| 38 | `Tooltip` | web | — | — | icon hints (never essential info) |
| 39 | `Tabs` | both | underline, pill | md | lot detail, portal pages |
| 40 | `BottomTabBar` | native, web < lg | — | — | driver app, portal mobile |
| 41 | `AppBar` | both | default, transparent (over media), brand | — | screen headers |
| 42 | `SideNav` | web | rail, expanded | — | portal, admin |
| 43 | `Skeleton` | both | text, block, circle, lot-card, booking-card | — | loading |
| 44 | `EmptyState` | both | — | — | empty |
| 45 | `ErrorScreen` | both | 404, 403, 500, offline | — | errors |
| 46 | `Countdown` | both | default, warning | — | payment hold |
| 47 | `MapView` | both (react-native-maps / @vis.gl/react-google-maps) | — | — | search |
| 48 | `PriceMarker` | both | default, selected, unavailable, cluster | — | map |
| 49 | `ImageGallery` | both | — | — | lot detail |
| 50 | `Stepper` (progress) | both | — | — | operator onboarding, lot setup |
| 51 | `FileUpload` | web (native: picker) | document, photo | — | permits, lot photos |
| 52 | `DataTable` | web | comfortable, compact | — | portal, admin |
| 53 | `StatTile` | web | — | — | operator dashboard KPIs |
| 54 | `ScanView` | web (attendant PWA) | — | — | QR scanning |
| 55 | `ResultPanel` | web (attendant PWA) | success, info, warning, danger | lg | scan result |
| 56 | `EnvBanner` | web | dev, staging | — | non-prod environments |
| 57 | `Text` | both | all `type.*` tokens | — | typography |
| 58 | `Icon` | both | Lucide wrapper | sm, md, lg, xl | everywhere |

## 3. Component tokens (key components in full)

### 3.1 Button

| Token | Value |
|---|---|
| `button.height.sm` / `.md` / `.lg` | 36 / 48 (native), 44 (web) / 56 |
| `button.padding-x.sm` / `.md` / `.lg` | `space.3` / `space.inset.md` / `space.6` |
| `button.gap` | `space.inline.xs` (icon ↔ label) |
| `button.radius` | `radius.control` (`radius.control-sm` for sm) |
| `button.font` | `type.label.md` (sm, md), `type.label.lg` (lg) |
| `button.icon.size` | `icon.size.sm` (sm), `icon.size.md` (md, lg) |
| `button.primary.bg` / `-hover` / `-pressed` | `color.action.primary.bg` / `.bg-hover` / `.bg-pressed` |
| `button.primary.fg` | `color.action.primary.fg` |
| `button.secondary.bg` / `.fg` | `color.action.secondary.bg` / `.fg` |
| `button.secondary.bg-pressed` | `color.action.secondary.bg-pressed` |
| `button.ghost.bg` / `.fg` / `.bg-pressed` | transparent / `color.text.brand` / `color.bg.subtle` |
| `button.danger.bg` / `.fg` | `color.action.danger.bg` / `.fg` |
| `button.on-brand.bg` / `.fg` | `color.bg.surface` / `color.text.brand` (for use on gradients) |
| `button.disabled.bg` / `.fg` | `color.action.disabled.bg` / `.fg` |
| `button.focus.ring` | `focus.ring.*` (doc 16) |
| `button.loading.spinner` | 16 dp, current fg colour |

States: **loading** keeps width, replaces label with spinner + visually hidden label "Loading", `aria-busy`, ignores presses. **Disabled** sets `aria-disabled` and keeps focusability on web only when there's a tooltip explaining why.
A11y: label is a verb; icon-only uses `IconButton` with required `label` prop. Min target 48 dp native.

### 3.2 TextField (and Phone/Otp/Plate/Money fields)

| Token | Value |
|---|---|
| `input.height.md` / `.lg` | 48 / 56 |
| `input.padding-x` | `space.inset.md` |
| `input.radius` | `radius.control` |
| `input.font` | `type.body.md` (lg: `type.body.lg`); Plate/Otp: `type.code.md` |
| `input.bg` / `.bg-disabled` | `color.bg.surface` / `color.bg.subtle` |
| `input.fg` / `.placeholder` | `color.text.primary` / `color.text.tertiary` |
| `input.border` / `-hover` / `-focus` / `-error` | `color.border.strong` / `color.text.secondary` / `color.focus.ring` / `color.status.danger.icon` |
| `input.border-width` / `-focus` | 1 / 2 (no layout shift: inset box-shadow on web) |
| `input.label.font` / `.fg` | `type.label.md` / `color.text.primary` |
| `input.helper.font` / `.fg` | `type.caption` / `color.text.secondary` |
| `input.error.fg` | `color.status.danger.fg` |
| `input.prefix.fg` | `color.text.secondary` (`+234`, `₦`) |
| `otp.cell.size` | 48×56, gap `space.2` |

A11y: label element always rendered; `aria-invalid`, `aria-describedby` → helper/error id; error text prefixed by icon + "Error:" visually hidden.

#### Select (Enterprise Custom Dropdown)

| Token / Property | Value |
|---|---|
| `select.trigger.bg` / `-hover` | `color.bg.surface` (`#181d24`) / `color.bg.subtle` (`#1e242c`) |
| `select.trigger.border` / `-focus` | `color.border.default` (`#272d34`) / `color.border.brand` (`#137066` + ring) |
| `select.trigger.radius` | `radius.control` (8px) |
| `select.trigger.height` | 44px (web) / 48px |
| `select.menu.bg` | `color.bg.surface` (`#181d24`) |
| `select.menu.border` | 1px solid `color.border.default` (`#272d34`) |
| `select.menu.radius` | `radius.surface` (10px) |
| `select.menu.shadow` | `0 12px 32px rgba(0, 0, 0, 0.55)` |
| `select.option.padding` | `0.6rem 0.75rem`, radius `radius.control-sm` (6px) |
| `select.option.selected.bg` / `.fg` | `rgba(19, 112, 102, 0.18)` / `color.brand.primary` (`#2dd4bf`) |
| `select.chevron` | Rotating 180° animated SVG indicator |
| `select.check.icon` | Emerald/teal checkmark on active selected option |
| Form serialization | Hidden native `<select>` keeping 100% standard form/POST/GET/Server Action compatibility |

### 3.3 Card / LotCard / BookingCard

| Token | Value |
|---|---|
| `card.bg` | `color.bg.surface` |
| `card.border` | `color.border.default` (outlined, and raised in dark) |
| `card.radius` | `radius.surface` |
| `card.padding` | `space.inset.md` |
| `card.gap` | `space.stack.sm` |
| `card.shadow` | `elevation.raised` |
| `card.interactive.bg-pressed` | `color.bg.subtle` |
| `lot-card.media.aspect` | 4:3 (list), 1:1 64 dp thumbnail (compact) |
| `lot-card.media.radius` | `radius.media` |
| `lot-card.title.font` | `type.heading.md` |
| `lot-card.meta.font` / `.fg` | `type.body.sm` / `color.text.secondary` |
| `lot-card.price.font` / `.fg` | `type.price.md` / `color.text.primary` |
| `lot-card.unavailable.opacity` | `opacity.disabled` (doc 16) + "Full at this time" label |

LotCard content order: photo (with `VerifiedBadge` on-photo + `gradient.scrim-bottom`) → name → district · distance → amenities (max 3 chips) → price "₦1,000/h · ₦5,000/day" → availability ("18 spaces left" only if < 20% capacity left).

### 3.4 Badge / StatusChip / VerifiedBadge / Chip

| Token | Value |
|---|---|
| `badge.height` | 24 |
| `badge.padding-x` | `space.2` |
| `badge.radius` | `radius.pill` |
| `badge.font` | `type.label.sm` |
| `badge.icon.size` | 14 |
| `badge.<tone>.bg` / `.fg` | `color.status.<tone>.bg` / `.fg` (tone ∈ info, success, warning, danger); neutral: `color.bg.subtle` / `color.text.secondary` |
| `badge.verified.bg` / `.fg` / `.icon` | `color.verified.bg` / `.fg` / `.icon` |
| `badge.verified.on-photo.bg` | `color.verified.bg` at 100% (never translucent) |
| `chip.height` | 36 (hit area 48) |
| `chip.bg` / `-selected` | `color.bg.surface` / `color.action.secondary.bg` |
| `chip.border` / `-selected` | `color.border.strong` / `color.border.brand` |
| `chip.fg` / `-selected` | `color.text.primary` / `color.action.secondary.fg` |
| `chip.selected.icon` | `check` (selection never colour-only) |

### 3.5 Banner, Toast, OfflineBanner

| Token | Value |
|---|---|
| `banner.padding` | `space.inset.md` |
| `banner.radius` | `radius.surface` (inline), `radius.none` (full-width) |
| `banner.<tone>.bg` / `.fg` / `.icon` | `color.status.<tone>.*` |
| `banner.border-left` | 4 px `color.status.<tone>.icon` (web/native inline variant) |
| `toast.*` | see doc 14 P11 |
| `offline-banner.*` | see doc 14 P4 |

`Banner` uses `role="status"` (info/success) or `role="alert"` (warning/danger, only when newly shown).

### 3.6 Dialog and BottomSheet

| Token | Value |
|---|---|
| `dialog.bg` | `color.bg.surface-raised` |
| `dialog.radius` | `radius.overlay` |
| `dialog.padding` | `space.inset.lg` |
| `dialog.max-width` | 480 |
| `dialog.shadow` | `elevation.modal` |
| `dialog.scrim` | `color.bg.overlay` |
| `sheet.*` | see doc 14 P10 |

A11y: focus moves to dialog title on open, trapped, returns to trigger on close; `Esc` closes non-destructive dialogs; destructive dialogs focus the **safe** button first.

### 3.7 Ticket, QrCode, CodeText

| Token | Value |
|---|---|
| `ticket.*` | doc 14 P7 |
| `qr.fg` / `qr.bg` | `color.qr.fg` / `color.qr.bg` |
| `qr.size.default` / `.max` | 220 / 320 |
| `code-text.booking.font` | `type.code.lg` (ticket), `type.code.md` (lists) |
| `code-text.plate.font` | `type.code.md` / `type.code.sm` |
| `code-text.bg` | `color.bg.subtle` (optional chip style for plates) |

`CodeText` sets the spelled-out accessibility label automatically and supports long-press/click to copy (toast "Code copied").

### 3.8 PriceMarker (map)

| Token | Value |
|---|---|
| `map.marker.height` | 32 |
| `map.marker.padding-x` | `space.2` |
| `map.marker.radius` | `radius.pill` |
| `map.marker.font` | `type.label.md` |
| `map.marker.bg` / `.fg` / `.border` | `color.bg.surface` / `color.text.primary` / `color.border.strong` |
| `map.marker.selected.bg` / `.fg` | `color.action.primary.bg` / `color.action.primary.fg` |
| `map.marker.unavailable.fg` | `color.text.disabled` + strike "Full" label |
| `map.marker.shadow` | `shadow.sm` |
| `map.cluster.bg` / `.fg` / `.size` | `color.bg.brand` / `color.text.on-brand` / 40 |

### 3.9 DataTable (web)

| Token | Value |
|---|---|
| `table.row.height` | 48 (comfortable) / 40 (compact) |
| `table.cell.padding-x` | `space.inset.md` / `space.3` compact |
| `table.header.bg` / `.fg` / `.font` | `color.bg.subtle` / `color.text.secondary` / `type.label.sm` |
| `table.row.border` | `color.border.default` |
| `table.row.bg-hover` / `-selected` | `color.bg.subtle` / `color.bg.brand-subtle` |
| `table.numeric.font` | `type.body.sm` + tabular-nums, right-aligned |

### 3.10 ScanView and ResultPanel (attendant)

| Token | Value |
|---|---|
| `scan.viewfinder.height` | 70vh, max 480 |
| `scan.reticle.size` | 240, border 4, `color.text.on-brand`, `radius.lg` |
| `scan.reticle.corner-length` | 32 |
| `result-panel.padding` | `space.inset.lg` |
| `result-panel.headline.font` | `type.heading.xl` |
| `result-panel.<tone>.bg` / `.fg` / `.icon` | `color.status.<tone>.bg` / `.fg` / `.icon` |
| `result-panel.icon.size` | `icon.size.2xl` (48) |
| `result-panel.action.height` | `button.height.lg` (56) |

Camera via `BarcodeDetector` where supported, fallback to `@zxing/browser`. Camera permission denied → shows manual code entry as the main UI with instructions to re-enable.

### 3.11 StatTile (operator dashboard)

| Token | Value |
|---|---|
| `stat.padding` | `space.inset.md` |
| `stat.label.font` / `.fg` | `type.label.sm` / `color.text.secondary` |
| `stat.value.font` | `type.price.lg` |
### 3.12 Badge and StatusBadge (`@parkly/ui`)

| Token / Class | Description | Value |
|---|---|---|
| `.pk-badge` | Base badge container | `font-size: 0.725rem`, `font-weight: 600`, uppercase, pill/sm radius (6px) |
| `.pk-badge--brand-subtle` | Parkly brand teal tint | `bg: rgba(19, 112, 102, 0.15)`, `fg: #19a594` |
| `.pk-badge--verified` | LASPA verified trust badge | `bg: rgba(16, 185, 129, 0.15)`, `fg: #34d399` |
| `.pk-badge--confirmed` | Confirmed / paid booking | `bg: rgba(16, 185, 129, 0.15)`, `fg: #34d399` |
| `.pk-badge--checkedin` | Active park-in state | `bg: rgba(20, 184, 166, 0.15)`, `fg: #2dd4bf` |
| `.pk-badge--pending` | Awaiting Paystack payment | `bg: rgba(245, 158, 11, 0.15)`, `fg: #fbbf24` |
| `.pk-badge--completed` | Checked out / completed | `bg: rgba(148, 163, 184, 0.15)`, `fg: #cbd5e1` |
| `.pk-badge--cancelled` | Expired / cancelled / missed | `bg: rgba(239, 68, 68, 0.15)`, `fg: #f87171` |

`StatusBadge` automatically maps any booking status (`CONFIRMED`, `CHECKED_IN`, `PENDING_PAYMENT`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `NO_SHOW`) to its standardized label and color-coded variant.

### 3.13 PriceBreakdown (`@parkly/ui`)

| Token / Class | Description | Value |
|---|---|---|
| `.pk-breakdown` | Itemised table container | `width: 100%`, border-collapse |
| `.pk-breakdown td, th` | Line item cell | padding `space.1` 0, text left, amount right with `tabular-nums` |
| `.pk-breakdown tfoot` | Grand total row | `border-top: 1px solid border.subtle`, `font-weight: 700` |

Used in checkout, booking details, and operator settlement summaries.

## 4. DTCG JSON example (`component/button.json`)

```json
{
  "button": {
    "height": {
      "$type": "dimension",
      "sm": { "$value": "36px" }, "md": { "$value": "48px" }, "lg": { "$value": "56px" }
    },
    "radius": { "$type": "dimension", "$value": "{radius.control}" },
    "padding-x": {
      "$type": "dimension",
      "sm": { "$value": "{space.3}" }, "md": { "$value": "{space.inset.md}" }, "lg": { "$value": "{space.6}" }
    },
    "primary": {
      "$type": "color",
      "bg":         { "$value": "{color.action.primary.bg}" },
      "bg-hover":   { "$value": "{color.action.primary.bg-hover}" },
      "bg-pressed": { "$value": "{color.action.primary.bg-pressed}" },
      "fg":         { "$value": "{color.action.primary.fg}" }
    },
    "danger": {
      "$type": "color",
      "bg": { "$value": "{color.action.danger.bg}" },
      "fg": { "$value": "{color.action.danger.fg}" }
    }
  }
}
```
Web `md` height override (44 px) lives in `$extensions.parkly.web`.

## 5. CSS usage (web)

```css
.pk-button--primary {
  height: var(--pk-button-height-md);
  padding-inline: var(--pk-button-padding-x-md);
  border-radius: var(--pk-button-radius);
  background: var(--pk-button-primary-bg);
  color: var(--pk-button-primary-fg);
}
.pk-button--primary:hover  { background: var(--pk-button-primary-bg-hover); }
.pk-button--primary:active { background: var(--pk-button-primary-bg-pressed); }
.pk-button:focus-visible   { outline: var(--pk-focus-ring-width) solid var(--pk-focus-ring-color); outline-offset: var(--pk-focus-ring-offset); }
```
In practice components use the Tailwind preset (`bg-button-primary`, `h-button-md`) with `class-variance-authority` for variants.

## 6. React Native usage

```tsx
import { Button, LotCard, Ticket } from '@parkly/ui-native';

<Button variant="primary" size="lg" onPress={pay} loading={isPaying}>
  {`Pay ${formatNaira(quote.totalKobo)}`}
</Button>
```
Internally: `const { component } = useTheme(); const t = component.button;` → `{ height: t.height.lg, backgroundColor: pressed ? t.primary.bgPressed : t.primary.bg }` with `Pressable` + `android_ripple={{ color: theme.color.alpha.white12 }}`.

## 7. Build order (for Sprint planning, doc 20)

1. Foundations: `Text`, `Icon`, `Button`, `IconButton`, `Card`, `Banner`, `Skeleton`, `Toast`, `Dialog` (Sprint 0–1).
2. Forms: `TextField`, `PhoneField`, `OtpField`, `PlateField`, `Select`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl` (Sprint 1–2).
3. Discovery: `SearchBar`, `MapView`, `PriceMarker`, `BottomSheet`, `LotCard`, `Chip`, `VerifiedBadge`, `ImageGallery` (Sprint 3).
4. Booking: `DateTimePicker`, `DurationStepper`, `PriceBreakdown`, `SummaryList`, `Countdown`, `BookingCard`, `StatusChip`, `Ticket`, `QrCode`, `CodeText` (Sprint 4).
5. Attendant: `ScanView`, `ResultPanel`, `OfflineBanner`, `SyncBadge` (Sprint 5).
6. Portal/Admin: `SideNav`, `DataTable`, `StatTile`, `FileUpload`, `Stepper`, `EnvBanner`, `MoneyField` (Sprints 2, 7, 8).
