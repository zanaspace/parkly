# 12 — Design System: Corner Radius — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/radius.json`, `src/component/*.json`
> CSS: `--pk-radius-*` · RN: `theme.radius.*` · Tailwind: `rounded-sm|md|lg|xl|2xl|full`

## 1. Rationale

- **Friendly but firm.** Medium radii (8–16) read as approachable and modern without looking toy-like. Financial elements (price, payment summary) use the same radii as everything else — no special "fun" shapes.
- **Nested radius rule:** inner radius = outer radius − padding (min 4). E.g. a 16 px card with 8 px padding holds an 8 px image.
- Pills (`radius.full`) are reserved for chips, badges, map price markers and toggles, so users learn "pill = status/filter".
- Inputs and buttons share a radius so forms look aligned.

## 2. Primitive scale

| Token | Value | |
|---|---|---|
| `radius.none` | 0 | Full-bleed media, table cells |
| `radius.xs` | 4 px | Checkbox, small tags, focus ring offset corner |
| `radius.sm` | 6 px | Tooltip, kbd, inline code |
| `radius.md` | 8 px | Inputs, buttons (sm), images inside cards |
| `radius.lg` | 12 px | **Buttons (md/lg), cards** |
| `radius.xl` | 16 px | Bottom sheet top corners, dialogs, QR ticket |
| `radius.2xl` | 24 px | Hero/feature panels, onboarding illustration frame |
| `radius.full` | 9999 px | Pills, avatars, FAB, map markers, switch |

## 3. Semantic / component tokens

| Token | → | Notes |
|---|---|---|
| `radius.control` | `radius.lg` (12) | Buttons md/lg, inputs, selects, search bar |
| `radius.control-sm` | `radius.md` (8) | Small buttons, segmented control items |
| `radius.surface` | `radius.lg` (12) | Cards, list groups, banners |
| `radius.overlay` | `radius.xl` (16) | Dialogs, popovers, menus |
| `radius.sheet` | `radius.xl` (16) top-left/top-right only | Bottom sheets |
| `radius.media` | `radius.md` (8) | Lot photos in cards; `radius.lg` for gallery |
| `radius.ticket` | `radius.xl` (16) | QR ticket, plus 12 px notch cut-outs (doc 14) |
| `radius.pill` | `radius.full` | Chips, badges, markers |
| `button.radius` | `radius.control` | |
| `input.radius` | `radius.control` | |
| `card.radius` | `radius.surface` | |
| `badge.radius` | `radius.pill` | |
| `chip.radius` | `radius.pill` | |
| `toast.radius` | `radius.lg` | |
| `avatar.radius` | `radius.full` | |
| `checkbox.radius` | `radius.xs` | |
| `qr.quiet-zone.radius` | `radius.md` | White frame around the QR |

Density: in **compact** (admin) `radius.control` = `radius.md` (8) and `radius.surface` = `radius.md` (8) for a denser, more tool-like look. Large (attendant) keeps defaults.

## 4. Rules

1. Use component/semantic tokens, never primitives, in components.
2. Apply the nested-radius rule; the `Card` component exposes `innerRadius` for children.
3. Full-bleed elements (maps, hero images at screen edge) have `radius.none`.
4. Bottom sheets: only top corners rounded; when a sheet becomes a centred dialog above `md` (doc 11), all four corners use `radius.overlay`.
5. Focus rings follow the element radius + ring offset (doc 16).

## 5. DTCG JSON

```json
{
  "radius": {
    "$type": "dimension",
    "none": { "$value": "0px" }, "xs": { "$value": "4px" }, "sm": { "$value": "6px" },
    "md": { "$value": "8px" }, "lg": { "$value": "12px" }, "xl": { "$value": "16px" },
    "2xl": { "$value": "24px" }, "full": { "$value": "9999px" },
    "control":    { "$value": "{radius.lg}" },
    "control-sm": { "$value": "{radius.md}" },
    "surface":    { "$value": "{radius.lg}" },
    "overlay":    { "$value": "{radius.xl}" },
    "sheet":      { "$value": "{radius.xl}" },
    "media":      { "$value": "{radius.md}" },
    "ticket":     { "$value": "{radius.xl}" },
    "pill":       { "$value": "{radius.full}" }
  }
}
```

## 6. CSS and Tailwind

```css
:root { --pk-radius-control: 12px; --pk-radius-surface: 12px; --pk-radius-overlay: 16px; --pk-radius-pill: 9999px; }
[data-density="compact"] { --pk-radius-control: 8px; --pk-radius-surface: 8px; }
```
Tailwind preset replaces `borderRadius`: `rounded-xs … rounded-2xl`, `rounded-full`, plus semantic `rounded-control`, `rounded-surface`, `rounded-overlay`, `rounded-sheet` (top only via `rounded-t-sheet`).

## 7. React Native

```tsx
const { radius } = useTheme();
<View style={{ borderRadius: radius.surface, overflow: 'hidden' }}>
  <Image style={{ borderRadius: radius.media }} />
</View>
// Sheet:
<View style={{ borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }} />
```
`radius.full` exports as `9999` (RN clamps to half the shortest side).
