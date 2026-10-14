# 07 — Design System: Colors — Tokens

> Package: `@parkly/tokens` · Source: `packages/tokens/src/primitive/color.json`, `semantic/light.json`, `semantic/dark.json`, `component/*.json`
> CSS prefix: `--pk-` · RN: `theme.color.*` · Tailwind: `bg-surface`, `text-primary` etc. via preset.

## 1. Rationale

- **Primary: deep teal (`teal.600 #137066`).** Teal reads as calm and trustworthy (banking/security cues) without copying the green of Nigerian fintechs, and it isn't confused with our "success" green because success always comes with a check icon and label.
- **Accent: amber (`amber.400 #F59F1F`).** Used for the **Verified** badge, attention and highlights. Amber on teal is high-energy but stays readable.
- **Neutrals: slightly warm grey-green.** Softer than pure grey, pairs with teal, and reduces glare outdoors.
- **Status colours** (danger red, success green, info blue, warning amber) are **never the only signal**: always paired with an icon and text (doc 04 §5). Red and green never appear side by side as the only difference (colour-blind safety).
- **Dark mode** uses its own semantic values: a lighter primary (`teal.300`) with dark text on primary buttons, and surfaces stepped by lightness rather than shadow.

## 2. Primitive palette

All primitives live under `color.<hue>.<step>`. **Components must not reference primitives.**

| Step | teal (brand) | amber (accent) | neutral | red (danger) | green (success) | blue (info) |
|---|---|---|---|---|---|---|
| 0 | — | — | `#FFFFFF` | — | — | — |
| 25 | — | — | `#FAFAF9` | — | — | — |
| 50 | `#EEF8F6` | `#FFF8EB` | `#F4F5F4` | `#FEF2F2` | `#EFFAF2` | `#EFF6FF` |
| 100 | `#D3EFEA` | `#FEEBC8` | `#E9EBEA` | `#FDE1E0` | `#D5F2DE` | `#DBEAFE` |
| 200 | `#A7DDD4` | `#FDD48A` | `#D5D9D8` | `#FBC4C0` | `#B0E4C1` | `#BFD5FC` |
| 300 | `#71C4B8` | `#FBBA4E` | `#B4BAB8` | `#F59A95` | `#86D3A0` | `#93B4F8` |
| 400 | `#3FA699` | `#F59F1F` | `#8A9290` | `#EA6A61` | `#4FB574` | `#5B8DEF` |
| 500 | `#1F8A7E` | `#E08A0B` | `#67706E` | `#D9362B` | `#2A9653` | `#2563EB` |
| 600 | `#137066` | `#B86E06` | `#4E5654` | `#B9261D` | `#1E7B3C` | `#1D4ED8` |
| 700 | `#0F5A53` | `#8F5408` | `#3A413F` | `#961D16` | `#17622F` | `#1E40AF` |
| 800 | `#0D4843` | `#6F420C` | `#262C2B` | `#771A14` | `#144E27` | `#1E3A8A` |
| 900 | `#0B3B37` | `#5A360E` | `#171B1A` | `#5C130F` | `#103F21` | `#172F6E` |
| 950 | `#062321` | `#331D05` | `#0D100F` | `#330A08` | `#072412` | `#0D1A3F` |

Also: `color.alpha.black-{8,16,48,64}` = black at 8/16/48/64 % (overlays), `color.alpha.white-{12,24}`.

## 3. Semantic tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `color.bg.canvas` | neutral.25 `#FAFAF9` | neutral.950 `#0D100F` | App/page background |
| `color.bg.surface` | neutral.0 `#FFFFFF` | neutral.900 `#171B1A` | Cards, sheets, inputs |
| `color.bg.surface-raised` | neutral.0 `#FFFFFF` | neutral.800 `#262C2B` | Modals, popovers, sheets (dark uses step-up) |
| `color.bg.subtle` | neutral.50 `#F4F5F4` | neutral.800 `#262C2B` | Section fills, table header, skeleton base |
| `color.bg.muted` | neutral.100 `#E9EBEA` | neutral.700 `#3A413F` | Disabled fills, skeleton highlight |
| `color.bg.inverse` | neutral.900 `#171B1A` | neutral.50 `#F4F5F4` | Toasts, tooltips |
| `color.bg.brand` | teal.700 `#0F5A53` | teal.900 `#0B3B37` | Hero, header band, QR ticket header |
| `color.bg.brand-subtle` | teal.50 `#EEF8F6` | teal.950 `#062321` | Selected rows, info about the brand |
| `color.bg.overlay` | alpha.black-48 | alpha.black-64 | Modal/sheet scrim |
| `color.text.primary` | neutral.900 `#171B1A` | neutral.50 `#F4F5F4` | Body and headings |
| `color.text.secondary` | neutral.600 `#4E5654` | neutral.300 `#B4BAB8` | Supporting text |
| `color.text.tertiary` | neutral.500 `#67706E` | neutral.400 `#8A9290` | Captions, timestamps (≥ 4.5:1 still) |
| `color.text.disabled` | neutral.400 `#8A9290` | neutral.500 `#67706E` | Disabled labels (WCAG 1.4.3 exempts inactive controls; on `action.disabled.bg` ≈ 2.7:1 — always pair with a non-colour cue such as reduced opacity icon or "unavailable" text) |
| `color.text.inverse` | neutral.0 `#FFFFFF` | neutral.900 `#171B1A` | On `bg.inverse` |
| `color.text.on-brand` | neutral.0 `#FFFFFF` | neutral.0 `#FFFFFF` | On `bg.brand` and brand gradient |
| `color.text.link` | teal.700 `#0F5A53` | teal.300 `#71C4B8` | Links (underlined) |
| `color.text.brand` | teal.600 `#137066` | teal.300 `#71C4B8` | Brand-coloured text, prices in lists |
| `color.border.default` | neutral.200 `#D5D9D8` | neutral.700 `#3A413F` | Dividers, card borders (decorative) |
| `color.border.strong` | neutral.400 `#8A9290` | neutral.500 `#67706E` | Input borders (≥ 3:1 non-text) |
| `color.border.brand` | teal.600 `#137066` | teal.300 `#71C4B8` | Selected card/radio |
| `color.action.primary.bg` | teal.600 `#137066` | teal.300 `#71C4B8` | Primary button |
| `color.action.primary.bg-hover` | teal.700 `#0F5A53` | teal.200 `#A7DDD4` | |
| `color.action.primary.bg-pressed` | teal.800 `#0D4843` | teal.400 `#3FA699` | |
| `color.action.primary.fg` | neutral.0 `#FFFFFF` | teal.950 `#062321` | Primary button label |
| `color.action.secondary.bg` | teal.50 `#EEF8F6` | teal.950 `#062321` | Secondary/tonal button |
| `color.action.secondary.fg` | teal.800 `#0D4843` | teal.200 `#A7DDD4` | |
| `color.action.secondary.bg-pressed` | teal.100 `#D3EFEA` | teal.900 `#0B3B37` | Pressed secondary button |
| `color.action.danger.bg` | red.600 `#B9261D` | red.300 `#F59A95` | Destructive button |
| `color.action.danger.fg` | neutral.0 `#FFFFFF` | red.950 `#330A08` | |
| `color.action.disabled.bg` | neutral.100 `#E9EBEA` | neutral.800 `#262C2B` | |
| `color.action.disabled.fg` | neutral.400 `#8A9290` | neutral.500 `#67706E` | |
| `color.focus.ring` | teal.500 `#1F8A7E` | teal.300 `#71C4B8` | Focus outline (doc 16) |
| `color.status.success.bg` | green.50 `#EFFAF2` | green.950 `#072412` | |
| `color.status.success.fg` | green.700 `#17622F` | green.300 `#86D3A0` | |
| `color.status.success.icon` | green.600 `#1E7B3C` | green.300 `#86D3A0` | |
| `color.status.warning.bg` | amber.50 `#FFF8EB` | amber.950 `#331D05` | |
| `color.status.warning.fg` | amber.800 `#6F420C` | amber.300 `#FBBA4E` | |
| `color.status.warning.icon` | amber.600 `#B86E06` | amber.300 `#FBBA4E` | |
| `color.status.danger.bg` | red.50 `#FEF2F2` | red.950 `#330A08` | |
| `color.status.danger.fg` | red.700 `#961D16` | red.300 `#F59A95` | |
| `color.status.danger.icon` | red.600 `#B9261D` | red.300 `#F59A95` | |
| `color.status.info.bg` | blue.50 `#EFF6FF` | blue.950 `#0D1A3F` | |
| `color.status.info.fg` | blue.700 `#1E40AF` | blue.300 `#93B4F8` | |
| `color.status.info.icon` | blue.600 `#1D4ED8` | blue.300 `#93B4F8` | |
| `color.verified.bg` | amber.100 `#FEEBC8` | amber.950 `#331D05` | Verified badge fill |
| `color.verified.fg` | amber.900 `#5A360E` | amber.300 `#FBBA4E` | Verified badge text |
| `color.verified.icon` | amber.700 `#8F5408` | amber.300 `#FBBA4E` | Shield-check icon |
| `color.accent.solid` | amber.400 `#F59F1F` | amber.300 `#FBBA4E` | Highlights, map marker for selected lot; text on it = `neutral.900` |
| `color.offline.bg` | neutral.900 `#171B1A` | amber.300 `#FBBA4E` | Offline banner |
| `color.offline.fg` | neutral.0 `#FFFFFF` | neutral.950 `#0D100F` | |
| `color.qr.fg` / `color.qr.bg` | `#000000` / `#FFFFFF` | `#000000` / `#FFFFFF` | **Never themed** — scanner reliability |

### 3.1 Booking status colour map (used by `StatusChip`, doc 15)

| Booking.status | Tone | Icon | Label |
|---|---|---|---|
| `PENDING_PAYMENT` | warning | `clock` | Awaiting payment |
| `CONFIRMED` | info | `calendar-check` | Confirmed |
| `CHECKED_IN` | success | `log-in` | Parked |
| `COMPLETED` | neutral | `check` | Completed |
| `EXPIRED` | neutral | `clock-alert` | Expired |
| `CANCELLED` | neutral | `x` | Cancelled |
| `NO_SHOW` | warning | `user-x` | No-show |
| Refunded (via payment) | info | `undo-2` | Refunded |

Lot status (operator/admin): `LIVE` success, `PENDING_VERIFICATION` warning, `DRAFT` neutral, `PAUSED` neutral, `SUSPENDED` danger, `ARCHIVED` neutral.

## 4. Component colour tokens (excerpt; full set in doc 15)

| Token | → Semantic |
|---|---|
| `button.primary.bg` / `.bg-hover` / `.bg-pressed` / `.fg` | `color.action.primary.*` |
| `button.secondary.bg` / `.fg` | `color.action.secondary.*` |
| `button.ghost.fg` | `color.text.brand` |
| `button.danger.bg` / `.fg` | `color.action.danger.*` |
| `input.bg` | `color.bg.surface` |
| `input.border` | `color.border.strong` |
| `input.border-focus` | `color.focus.ring` |
| `input.border-error` | `color.status.danger.icon` |
| `card.bg` / `card.border` | `color.bg.surface` / `color.border.default` |
| `badge.verified.bg` / `.fg` / `.icon` | `color.verified.*` |
| `map.marker.bg` / `.fg` | `color.bg.surface` / `color.text.primary` |
| `map.marker.selected.bg` / `.fg` | `color.action.primary.bg` / `color.action.primary.fg` |
| `ticket.header.bg` | `color.bg.brand` |
| `toast.bg` / `toast.fg` | `color.bg.inverse` / `color.text.inverse` |

## 5. Contrast checks (computed, WCAG 2.x relative luminance)

| Pair (fg / bg) | Theme | Ratio | Target | Pass |
|---|---|---|---|---|
| text.primary `#171B1A` / bg.surface `#FFFFFF` | light | 17.38 | 4.5 | ✅ |
| text.primary `#171B1A` / bg.canvas `#FAFAF9` | light | 16.64 | 4.5 | ✅ |
| text.secondary `#4E5654` / bg.surface | light | 7.55 | 4.5 | ✅ |
| text.secondary `#4E5654` / bg.canvas | light | 7.22 | 4.5 | ✅ |
| text.tertiary `#67706E` / bg.surface | light | 5.10 | 4.5 | ✅ |
| action.primary.fg `#FFFFFF` / action.primary.bg `#137066` | light | 5.94 | 4.5 | ✅ |
| `#FFFFFF` / primary pressed `#0F5A53` | light | 8.05 | 4.5 | ✅ |
| text.link `#0F5A53` / bg.surface | light | 8.05 | 4.5 | ✅ |
| text.brand `#137066` / bg.surface | light | 5.94 | 4.5 | ✅ |
| verified.fg `#5A360E` / verified.bg `#FEEBC8` | light | 9.11 | 4.5 | ✅ |
| status.warning.fg `#6F420C` / warning.bg `#FFF8EB` | light | 8.08 | 4.5 | ✅ |
| neutral.900 / accent.solid `#F59F1F` | light | 8.16 | 4.5 | ✅ |
| status.danger.fg `#961D16` / bg.surface | light | 8.45 | 4.5 | ✅ |
| action.danger.fg `#FFFFFF` / danger.bg `#B9261D` | light | 6.25 | 4.5 | ✅ |
| status.danger.fg / danger.bg `#FEF2F2` | light | 7.73 | 4.5 | ✅ |
| status.success.fg `#17622F` / success.bg `#EFFAF2` | light | 6.95 | 4.5 | ✅ |
| status.info.fg `#1E40AF` / info.bg `#EFF6FF` | light | 8.01 | 4.5 | ✅ |
| action.secondary.fg `#0D4843` / secondary.bg `#EEF8F6` | light | 9.58 | 4.5 | ✅ |
| border.strong `#8A9290` / bg.surface (non-text) | light | 3.18 | 3.0 | ✅ |
| focus.ring `#1F8A7E` / bg.surface (non-text) | light | 4.20 | 3.0 | ✅ |
| text.primary `#F4F5F4` / bg.canvas `#0D100F` | dark | 17.50 | 4.5 | ✅ |
| text.primary / bg.surface `#171B1A` | dark | 15.90 | 4.5 | ✅ |
| text.secondary `#B4BAB8` / bg.canvas | dark | 9.70 | 4.5 | ✅ |
| text.secondary / bg.surface | dark | 8.82 | 4.5 | ✅ |
| text.tertiary `#8A9290` / bg.surface | dark | 5.46 | 4.5 | ✅ |
| action.primary.fg `#062321` / primary.bg `#71C4B8` | dark | 8.10 | 4.5 | ✅ |
| text.brand `#71C4B8` / bg.surface | dark | 8.52 | 4.5 | ✅ |
| warning/verified `#FBBA4E` / bg.surface | dark | 10.13 | 4.5 | ✅ |
| danger.fg `#F59A95` / bg.surface | dark | 8.23 | 4.5 | ✅ |
| success.fg `#86D3A0` / bg.surface | dark | 9.80 | 4.5 | ✅ |
| info.fg `#93B4F8` / bg.surface | dark | 8.38 | 4.5 | ✅ |
| border.strong `#67706E` / bg.surface (non-text) | dark | 3.41 | 3.0 | ✅ |
| focus.ring `#71C4B8` / bg.canvas (non-text) | dark | 9.37 | 3.0 | ✅ |
| text.on-brand `#FFFFFF` / bg.brand `#0F5A53` | light | 8.05 | 4.5 | ✅ |
| text.on-brand `#FFFFFF` / teal.900 `#0B3B37` | dark | 12.39 | 4.5 | ✅ |
| amber.300 `#FBBA4E` / teal.900 (verified on brand band) | both | 7.22 | 4.5 | ✅ |
| status.success.fg `#86D3A0` / success.bg `#072412` | dark | 9.32 | 4.5 | ✅ |
| status.warning.fg / verified.fg `#FBBA4E` / `#331D05` | dark | 9.28 | 4.5 | ✅ |
| status.danger.fg `#F59A95` / danger.bg `#330A08` | dark | 8.37 | 4.5 | ✅ |
| action.danger.fg `#330A08` / danger.bg `#F59A95` | dark | 8.37 | 4.5 | ✅ |
| status.info.fg `#93B4F8` / info.bg `#0D1A3F` | dark | 8.19 | 4.5 | ✅ |
| action.secondary.fg `#A7DDD4` / secondary.bg `#062321` | dark | 10.97 | 4.5 | ✅ |
| offline.fg `#0D100F` / offline.bg `#FBBA4E` | dark | 11.14 | 4.5 | ✅ |
| text.primary `#F4F5F4` / bg.surface-raised `#262C2B` | dark | 13.00 | 4.5 | ✅ |
| toast text.inverse `#FFFFFF` / bg.inverse `#171B1A` | light | 17.38 | 4.5 | ✅ |
| toast text.inverse `#171B1A` / bg.inverse `#F4F5F4` | dark | 15.90 | 4.5 | ✅ |
| action.disabled.fg / action.disabled.bg | light / dark | 2.66 / 2.79 | exempt (WCAG 1.4.3 inactive UI) | ⚠️ by design; pair with a non-colour cue |

The token test suite (`packages/tokens/test/contrast.spec.ts`) recomputes this table from the JSON and fails CI if any pair drops below target. Add a row whenever you add a text/background pairing.

## 6. DTCG JSON (source snippets)

`packages/tokens/src/primitive/color.json`
```json
{
  "color": {
    "$type": "color",
    "teal": {
      "50":  { "$value": "#EEF8F6" }, "100": { "$value": "#D3EFEA" }, "200": { "$value": "#A7DDD4" },
      "300": { "$value": "#71C4B8" }, "400": { "$value": "#3FA699" }, "500": { "$value": "#1F8A7E" },
      "600": { "$value": "#137066" }, "700": { "$value": "#0F5A53" }, "800": { "$value": "#0D4843" },
      "900": { "$value": "#0B3B37" }, "950": { "$value": "#062321" }
    },
    "amber": {
      "50":  { "$value": "#FFF8EB" }, "100": { "$value": "#FEEBC8" }, "200": { "$value": "#FDD48A" },
      "300": { "$value": "#FBBA4E" }, "400": { "$value": "#F59F1F" }, "500": { "$value": "#E08A0B" },
      "600": { "$value": "#B86E06" }, "700": { "$value": "#8F5408" }, "800": { "$value": "#6F420C" },
      "900": { "$value": "#5A360E" }, "950": { "$value": "#331D05" }
    },
    "neutral": {
      "0":   { "$value": "#FFFFFF" }, "25":  { "$value": "#FAFAF9" }, "50":  { "$value": "#F4F5F4" },
      "100": { "$value": "#E9EBEA" }, "200": { "$value": "#D5D9D8" }, "300": { "$value": "#B4BAB8" },
      "400": { "$value": "#8A9290" }, "500": { "$value": "#67706E" }, "600": { "$value": "#4E5654" },
      "700": { "$value": "#3A413F" }, "800": { "$value": "#262C2B" }, "900": { "$value": "#171B1A" },
      "950": { "$value": "#0D100F" }
    },
    "alpha": {
      "black-48": { "$value": "#0000007A" }, "black-64": { "$value": "#000000A3" }
    }
  }
}
```
(red, green, blue follow the same shape with the values in §2.)

`packages/tokens/src/semantic/light.json`
```json
{
  "color": {
    "$type": "color",
    "bg": {
      "canvas":  { "$value": "{color.neutral.25}" },
      "surface": { "$value": "{color.neutral.0}" },
      "brand":   { "$value": "{color.teal.700}" }
    },
    "text": {
      "primary":   { "$value": "{color.neutral.900}" },
      "secondary": { "$value": "{color.neutral.600}" },
      "link":      { "$value": "{color.teal.700}" }
    },
    "action": {
      "primary": {
        "bg":         { "$value": "{color.teal.600}" },
        "bg-hover":   { "$value": "{color.teal.700}" },
        "bg-pressed": { "$value": "{color.teal.800}" },
        "fg":         { "$value": "{color.neutral.0}" }
      }
    },
    "verified": {
      "bg":   { "$value": "{color.amber.100}" },
      "fg":   { "$value": "{color.amber.900}" },
      "icon": { "$value": "{color.amber.700}" }
    }
  }
}
```
`semantic/dark.json` has identical keys with the dark column values. The build fails if a key exists in one theme and not the other.

## 7. CSS output (generated)

```css
:root {
  --pk-color-bg-canvas: #FAFAF9;
  --pk-color-bg-surface: #FFFFFF;
  --pk-color-text-primary: #171B1A;
  --pk-color-action-primary-bg: #137066;
  --pk-color-action-primary-fg: #FFFFFF;
  --pk-color-verified-bg: #FEEBC8;
  /* … */
}
[data-theme="dark"] {
  --pk-color-bg-canvas: #0D100F;
  --pk-color-bg-surface: #171B1A;
  --pk-color-text-primary: #F4F5F4;
  --pk-color-action-primary-bg: #71C4B8;
  --pk-color-action-primary-fg: #062321;
  /* … */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* same as [data-theme="dark"] */ }
}
```
Naming rule: token path joined with `-`, prefixed `--pk-`.

Tailwind (preset): `bg-canvas`, `bg-surface`, `text-primary`, `text-secondary`, `border-default`, `bg-action-primary`, `text-action-primary-fg`, etc. all map to `var(--pk-…)`.

## 8. React Native usage

```tsx
import { useTheme } from '@parkly/ui-native';

const { color } = useTheme();          // resolves light/dark from useColorScheme() + user override
<View style={{ backgroundColor: color.bg.surface, borderColor: color.border.default }}>
  <Text style={{ color: color.text.primary }}>Marina Car Park</Text>
</View>
```
`@parkly/tokens/native` exports `theme.light.color` and `theme.dark.color` as typed objects; never import primitives in app code.

## 9. Rules

1. No hex values in app code — lint error.
2. Status = colour + icon + label, always.
3. QR codes are always black on white.
4. New colours enter as primitives, then semantic, with contrast rows added to §5.
5. Map tiles use the custom style JSONs; marker colours use `map.marker.*` tokens.
