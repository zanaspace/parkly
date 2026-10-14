# 13 — Design System: Gradients — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/gradient.json`, `src/semantic/{light,dark}.json`
> CSS: `--pk-gradient-*` · RN: `theme.gradient.*` used with `expo-linear-gradient` · Tailwind: `bg-gradient-brand` etc.

## 1. Rationale

Gradients are **rare and purposeful**. A calm, trustworthy brand doesn't need decorative colour washes, and large gradients cost GPU time on low-end Android. Each gradient below has a specific job; nothing else gets one.

| Allowed | Not allowed |
|---|---|
| Brand header band, QR ticket header, booking-confirmed hero, scrims for text on photos/maps, skeleton shimmer | Buttons, cards, backgrounds of whole screens, text fills, borders, charts (use solid series colours) |

## 2. Tokens

All gradients are **linear**, 2–3 stops, built only from palette primitives (doc 07).

| Token | Light | Dark | Use | Text on it |
|---|---|---|---|---|
| `gradient.brand` | 135°, teal.600 `#137066` 0% → teal.900 `#0B3B37` 100% | 135°, teal.800 `#0D4843` 0% → teal.950 `#062321` 100% | App header band (home), QR ticket header, booking-confirmed hero, marketing hero | `color.text.on-brand` (white). Worst case light: white on teal.600 = 5.94:1 ✅; dark: white on teal.800 = 10.37:1 ✅ |
| `gradient.brand-accent` | 135°, teal.700 `#0F5A53` 0% → teal.900 `#0B3B37` 70% → amber.700 `#8F5408` 100% | 135°, teal.900 → teal.950 70% → amber.900 `#5A360E` 100% | Marketing only (driver web landing, onboarding slide 1). Text must sit in the teal region (first 60%) | white |
| `gradient.scrim-bottom` | 180°, transparent 0% → `rgba(13,16,15,0.72)` 100% | same | Text over lot photos (name, verified badge) | white; ≥ 4.5:1 guaranteed when text is in the bottom 40% |
| `gradient.scrim-top` | 0°, transparent 0% → `rgba(13,16,15,0.48)` 100% | same | Status bar / back button legibility over photos and maps | white icons |
| `gradient.map-fade` | 180°, `color.bg.canvas` at 0% opacity → `color.bg.canvas` 100% | same tokens resolve dark | Fades the map into the list sheet edge | — |
| `gradient.skeleton` | 90°, bg.subtle `#F4F5F4` 0% → bg.muted `#E9EBEA` 50% → bg.subtle 100% | 90°, `#262C2B` → `#3A413F` → `#262C2B` | Shimmer on skeletons (animated `translateX`); static `bg.subtle` under reduced motion | — |
| `gradient.verified-glow` | radial-free alternative: 90°, amber.100 → amber.50 | 90°, amber.950 → neutral.900 | **Optional**, verified hero strip on lot detail only | `color.verified.fg` (9.11:1 on amber.100) |

Contrast is always checked against the **least contrasting stop** that sits behind text.

## 3. Component mapping

| Component token | → |
|---|---|
| `header.home.bg` | `gradient.brand` |
| `ticket.header.bg` | `gradient.brand` (solid fallback `color.bg.brand`) |
| `confirmation.hero.bg` | `gradient.brand` |
| `lot-card.media.scrim` | `gradient.scrim-bottom` |
| `lot-detail.gallery.scrim-top` | `gradient.scrim-top` |
| `skeleton.shimmer` | `gradient.skeleton` |
| `marketing.hero.bg` | `gradient.brand-accent` |

## 4. Rules

1. Every gradient has a **solid fallback** token (first stop or `color.bg.brand`) for print, forced-colors mode and very low-end devices (`expo-device` year class ≤ 2016 → solid).
2. In Windows High Contrast / `forced-colors: active`, gradients are removed; use `Canvas`/`CanvasText`.
3. No gradient may cover more than ~35% of the viewport height in the product UI (marketing excepted).
4. Don't put interactive controls that rely on colour contrast (e.g. outline buttons) on gradients; use filled white buttons (`button.on-brand` variant).
5. Never animate gradient stops; only the shimmer translates.

## 5. DTCG JSON

```json
{
  "gradient": {
    "$type": "gradient",
    "brand": {
      "$value": [
        { "color": "{color.teal.600}", "position": 0 },
        { "color": "{color.teal.900}", "position": 1 }
      ],
      "$extensions": { "parkly": { "angle": 135, "fallback": "{color.teal.700}" } }
    },
    "scrim-bottom": {
      "$value": [
        { "color": "#0D100F00", "position": 0 },
        { "color": "#0D100FB8", "position": 1 }
      ],
      "$extensions": { "parkly": { "angle": 180 } }
    },
    "skeleton": {
      "$value": [
        { "color": "{color.bg.subtle}", "position": 0 },
        { "color": "{color.bg.muted}", "position": 0.5 },
        { "color": "{color.bg.subtle}", "position": 1 }
      ],
      "$extensions": { "parkly": { "angle": 90 } }
    }
  }
}
```
(DTCG's gradient type has no angle; we carry it in `$extensions.parkly.angle`, read by our Style Dictionary transforms.)

## 6. CSS

```css
:root {
  --pk-gradient-brand: linear-gradient(135deg, #137066 0%, #0B3B37 100%);
  --pk-gradient-brand-fallback: #0F5A53;
  --pk-gradient-scrim-bottom: linear-gradient(180deg, rgba(13,16,15,0) 0%, rgba(13,16,15,0.72) 100%);
}
[data-theme="dark"] { --pk-gradient-brand: linear-gradient(135deg, #0D4843 0%, #062321 100%); }
.ticket-header { background: var(--pk-gradient-brand-fallback); background-image: var(--pk-gradient-brand); }
@media (forced-colors: active) { .ticket-header { background-image: none; } }
```
Tailwind: `bg-gradient-brand`, `bg-gradient-scrim-bottom` (as `backgroundImage` keys).

## 7. React Native

```tsx
import { LinearGradient } from 'expo-linear-gradient';
const { gradient } = useTheme();
// gradient.brand = { colors: ['#137066', '#0B3B37'], locations: [0, 1], start: {x:0,y:0}, end: {x:1,y:1}, fallback: '#0F5A53' }
<LinearGradient {...gradient.brand} style={styles.header}>…</LinearGradient>
```
The RN transform converts `angle` to `start`/`end` points (135° → `{0,0}` to `{1,1}`, 180° → `{0.5,0}` to `{0.5,1}`).
