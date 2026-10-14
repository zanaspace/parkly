# 16 — Design System: System — Tokens

> System tokens control behaviour and structure rather than look: layering, opacity, motion, focus, touch targets, icon sizes, elevation map and the layout grid.
> Package: `@parkly/tokens` · Source: `src/primitive/system.json`, `src/semantic/system.json`
> CSS: `--pk-z-*`, `--pk-opacity-*`, `--pk-motion-*`, `--pk-focus-*`, `--pk-target-*`, `--pk-icon-*`, `--pk-grid-*` · RN: `theme.system.*`

## 1. Z-index (layering)

Gaps of 100 leave room without collisions. Components must use these tokens; arbitrary z-index values fail lint.

| Token | Value | Layer |
|---|---|---|
| `z.base` | 0 | Normal flow |
| `z.raised` | 10 | Cards lifted on hover, selected map marker |
| `z.sticky` | 100 | Sticky headers, table headers, sticky bottom bars |
| `z.app-bar` | 200 | Top app bar, side nav |
| `z.map-controls` | 250 | Search bar and FAB over map |
| `z.offline-banner` | 300 | Offline / sync banner (above app bar content, below overlays) |
| `z.dropdown` | 400 | Menus, popovers, select lists |
| `z.sheet` | 500 | Bottom sheets (+ scrim at 499) |
| `z.overlay` | 600 | Modal scrim |
| `z.dialog` | 700 | Dialogs |
| `z.toast` | 800 | Toasts |
| `z.tooltip` | 900 | Tooltips |
| `z.env-banner` | 1000 | Non-prod environment banner (admin/portal) |

RN: z-index applies within siblings only; overlays use portals (`@gorhom/portal`) and the `elevation` map (§7) on Android.

## 2. Opacity

| Token | Value | Use |
|---|---|---|
| `opacity.0` | 0 | Hidden (animations) |
| `opacity.disabled` | 0.48 | Disabled **icons/images** and unavailable lot cards (text uses `color.text.disabled` instead) |
| `opacity.muted` | 0.64 | De-emphasised map markers outside the filter |
| `opacity.scrim` | 0.48 (light) / 0.64 (dark) | Matches `color.bg.overlay` |
| `opacity.pressed-overlay` | 0.12 | Ripple/pressed overlay on native |
| `opacity.hover-overlay` | 0.08 | Hover overlay on web |
| `opacity.100` | 1 | Default |

Never reduce opacity of body text to create hierarchy; use `color.text.secondary`.

## 3. Motion

### 3.1 Durations

| Token | Value | Use |
|---|---|---|
| `motion.duration.instant` | 0 ms | Reduced-motion replacements |
| `motion.duration.fast` | 100 ms | Pressed states, colour changes, reduced-motion fades |
| `motion.duration.base` | 200 ms | Most UI transitions: toasts, chips, tabs, menus |
| `motion.duration.moderate` | 280 ms | Bottom sheet snap, page push (native default) |
| `motion.duration.slow` | 400 ms | Success check draw, dialog enter |
| `motion.duration.shimmer` | 1200 ms | Skeleton loop |

### 3.2 Easing

| Token | Value | Use |
|---|---|---|
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` | Moving between on-screen positions |
| `motion.easing.enter` | `cubic-bezier(0, 0, 0.2, 1)` (decelerate) | Elements entering |
| `motion.easing.exit` | `cubic-bezier(0.4, 0, 1, 1)` (accelerate) | Elements leaving (use `duration.fast`–`base`) |
| `motion.easing.linear` | `linear` | Shimmer, progress, countdown |
| `motion.spring.sheet` | `{ damping: 30, stiffness: 300, mass: 1 }` | Reanimated bottom sheet (no visible bounce) |

### 3.3 Rules

- Animate only `transform` and `opacity`.
- **Reduced motion** (`prefers-reduced-motion: reduce` / `isReduceMotionEnabled`): all movement becomes a fade at `duration.fast`; shimmer stops; success check appears without drawing. Implemented once in `useMotion()` (native) and a global CSS media query (web) that sets `--pk-motion-duration-*` to 0/100 ms.
- No animation may delay a user's ability to act by more than 280 ms.
- Financial and scan-result screens never use bounce or playful motion.

## 4. Focus

| Token | Value |
|---|---|
| `focus.ring.width` | 2 px (3 px in attendant `large` density) |
| `focus.ring.offset` | 2 px |
| `focus.ring.color` | `color.focus.ring` (light `#1F8A7E` 4.20:1 on surface; dark `#71C4B8` 9.37:1 on canvas) |
| `focus.ring.color-on-brand` | `color.neutral.0` (on gradients / brand bands) |
| `focus.ring.style` | `solid` |
| `focus.ring.radius` | element radius + offset |

Rules: use `:focus-visible` (web) so mouse clicks don't show rings, keyboard always does. Native: Android TV/keyboard focus uses the same ring via `onFocus` state on `Pressable`. Never remove focus styles. Focus order follows visual order; modal surfaces trap focus. WCAG 2.2 **2.4.11 Focus Not Obscured**: sticky bars must not cover the focused element (scroll padding = bottom bar height: `scroll-padding-bottom: var(--pk-bottom-bar-height)`).

## 5. Touch targets

| Token | Value | Notes |
|---|---|---|
| `target.min` | 48 dp (native), 44 px (web) | Applies to every interactive element; visually smaller elements get `hitSlop` / pseudo-element expansion |
| `target.min-spacing` | 8 | Between adjacent targets' hit areas |
| `target.large` | 56 | Attendant PWA buttons, primary CTA in bottom bars |
| `target.thumb-zone` | bottom 40% of screen | Primary actions on mobile live here |

Lint/test: component tests assert measured hit area ≥ `target.min`. Playwright a11y suite checks web targets with a custom rule.

## 6. Icon sizes

| Token | Value | Use |
|---|---|---|
| `icon.size.xs` | 14 | Inside badges |
| `icon.size.sm` | 16 | Inline with `body.sm`, buttons sm |
| `icon.size.md` | 20 | Buttons md/lg, list items, chips |
| `icon.size.lg` | 24 | App bar, tab bar, standalone icons |
| `icon.size.xl` | 32 | Feature icons, empty-state small |
| `icon.size.2xl` | 48 | Attendant result panel, success hero |
| `icon.stroke` | 2 (1.75 at `xl`+ for balance) |

Icons that convey meaning have a text label nearby or an accessible label; decorative icons are `aria-hidden` / `accessibilityElementsHidden`.

## 7. Elevation map

Combines shadow (doc 10), surface colour (doc 07) and z-index (§1) so each layer is consistent.

| Level | Components | Shadow token | Dark surface | z-index | Android elevation |
|---|---|---|---|---|---|
| 0 Flat | page content, list rows, table rows | `elevation.flat` | `bg.canvas` / `bg.surface` | `z.base` | 0 |
| 1 Raised | cards, lot cards, booking cards, chips | `elevation.raised` | `bg.surface` + border | `z.base`/`z.raised` | 1 |
| 2 Floating | sticky bottom bar, map search bar, FAB, ticket | `elevation.floating` | `bg.surface-raised` | `z.sticky` / `z.map-controls` | 4 |
| 3 Overlay | bottom sheet, menu, popover, select | `elevation.overlay` | `bg.surface-raised` + border | `z.dropdown` / `z.sheet` | 8 |
| 4 Toast | toasts | `elevation.toast` | `bg.inverse` | `z.toast` | 12 |
| 5 Modal | dialogs | `elevation.modal` | `bg.surface-raised` + border | `z.dialog` | 16 |

## 8. Layout grid

| Token | xs–sm (< 768) | md (≥ 768) | lg (≥ 1024) | xl+ (≥ 1280) |
|---|---|---|---|---|
| `grid.columns` | 4 | 8 | 12 | 12 |
| `grid.gutter` (column gap) | 16 | 24 | 24 | 32 |
| `grid.margin` (page side) | `space.layout.gutter` 16 | 24 | 32 | 32 (content centred in `container.*`) |
| `grid.max-width` | 100% | 100% | `container.app` 1440 (portal/admin), `container.content` 1200 (web) | same |

Usage guidance:
- Driver mobile/native: single column on the 4-col grid; cards span 4.
- Driver web search ≥ md: list spans 3/8 (md) or 5/12 (lg+), map takes the rest, full-bleed to the right edge.
- Portal dashboard: `StatTile`s span 4 (mobile, stacked), 4/8 (md, 2 per row), 3/12 (lg, 4 per row).
- Forms span max `container.form` regardless of columns.
- **Baseline:** 4 px; component heights and line heights are multiples of 4.

## 9. Environment banner

| Token | Value |
|---|---|
| `env.banner.dev.bg` / `.fg` | `color.status.info.bg` / `color.status.info.fg` |
| `env.banner.staging.bg` / `.fg` | `color.accent.solid` / `color.neutral.900` |
| `env.banner.height` | 28 |

Shown on all non-prod web apps and in the native app's debug menu, text: "STAGING — test payments only".

## 10. Other system tokens

| Token | Value | Use |
|---|---|---|
| `border.width.hairline` | 1 px (`StyleSheet.hairlineWidth` on native for dividers) | Dividers |
| `border.width.default` | 1 | Inputs, cards |
| `border.width.strong` | 2 | Focused input, selected RadioCard |
| `bottom-bar.height` | 72 + safe area | Sticky action bar |
| `app-bar.height` | 56 (native), 64 (web ≥ lg) | |
| `tab-bar.height` | 64 + safe area | |
| `scrollbar.width` | 8 (web, thin) | |
| `debounce.search` | 300 ms | Search input |
| `timeout.toast` | see doc 14 P11 | |
| `haptic.result` | `success` / `warning` / `error` notification types (`expo-haptics`; Vibration API in PWA, 50/100/200 ms) | Attendant scan results |

## 11. DTCG JSON

```json
{
  "z": {
    "$type": "number",
    "base": { "$value": 0 }, "raised": { "$value": 10 }, "sticky": { "$value": 100 },
    "app-bar": { "$value": 200 }, "map-controls": { "$value": 250 }, "offline-banner": { "$value": 300 },
    "dropdown": { "$value": 400 }, "sheet": { "$value": 500 }, "overlay": { "$value": 600 },
    "dialog": { "$value": 700 }, "toast": { "$value": 800 }, "tooltip": { "$value": 900 }, "env-banner": { "$value": 1000 }
  },
  "opacity": {
    "$type": "number",
    "disabled": { "$value": 0.48 }, "muted": { "$value": 0.64 },
    "pressed-overlay": { "$value": 0.12 }, "hover-overlay": { "$value": 0.08 }
  },
  "motion": {
    "duration": {
      "$type": "duration",
      "fast": { "$value": "100ms" }, "base": { "$value": "200ms" },
      "moderate": { "$value": "280ms" }, "slow": { "$value": "400ms" }, "shimmer": { "$value": "1200ms" }
    },
    "easing": {
      "$type": "cubicBezier",
      "standard": { "$value": [0.2, 0, 0, 1] },
      "enter":    { "$value": [0, 0, 0.2, 1] },
      "exit":     { "$value": [0.4, 0, 1, 1] }
    }
  },
  "focus": {
    "ring": {
      "width":  { "$type": "dimension", "$value": "2px" },
      "offset": { "$type": "dimension", "$value": "2px" },
      "color":  { "$type": "color", "$value": "{color.focus.ring}" }
    }
  },
  "target": {
    "$type": "dimension",
    "min": { "$value": "48px", "$extensions": { "parkly": { "web": "44px" } } },
    "large": { "$value": "56px" },
    "min-spacing": { "$value": "8px" }
  },
  "icon": {
    "size": {
      "$type": "dimension",
      "xs": { "$value": "14px" }, "sm": { "$value": "16px" }, "md": { "$value": "20px" },
      "lg": { "$value": "24px" }, "xl": { "$value": "32px" }, "2xl": { "$value": "48px" }
    }
  },
  "grid": {
    "columns": { "$type": "number", "$value": 4, "$extensions": { "parkly": { "md": 8, "lg": 12 } } },
    "gutter":  { "$type": "dimension", "$value": "16px", "$extensions": { "parkly": { "md": "24px", "xl": "32px" } } }
  }
}
```

## 12. CSS

```css
:root {
  --pk-z-sheet: 500; --pk-z-dialog: 700; --pk-z-toast: 800;
  --pk-opacity-disabled: 0.48;
  --pk-motion-duration-base: 200ms;
  --pk-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --pk-focus-ring-width: 2px; --pk-focus-ring-offset: 2px; --pk-focus-ring-color: #1F8A7E;
  --pk-target-min: 44px;
  --pk-icon-size-md: 20px;
  --pk-grid-columns: 4; --pk-grid-gutter: 16px;
}
@media (min-width: 768px)  { :root { --pk-grid-columns: 8;  --pk-grid-gutter: 24px; } }
@media (min-width: 1024px) { :root { --pk-grid-columns: 12; } }
@media (min-width: 1280px) { :root { --pk-grid-gutter: 32px; } }
@media (prefers-reduced-motion: reduce) {
  :root { --pk-motion-duration-base: 100ms; --pk-motion-duration-moderate: 100ms; --pk-motion-duration-slow: 100ms; --pk-motion-duration-shimmer: 0ms; }
}
[data-density="large"] { --pk-focus-ring-width: 3px; }
```
Tailwind preset: `z-sheet`, `z-dialog`, `opacity-disabled`, `duration-base`, `ease-standard`, `size-icon-md`, `min-h-target`, `grid-cols-layout`.

## 13. React Native

```tsx
const { system } = useTheme();
const motion = useMotion();                       // returns reduced-motion-aware durations
withTiming(1, { duration: motion.duration.base, easing: Easing.bezier(...system.motion.easing.standard) });
<Pressable hitSlop={hitSlopFor(32, system.target.min)} />   // helper pads to 48 dp
<Icon name="shield-check" size={system.icon.size.md} />
```
`theme.system` exports numbers (ms for durations, dp for sizes) and bezier arrays.
