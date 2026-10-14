# 10 — Design System: Shadows — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/shadow.json`, `src/semantic/elevation.json`
> CSS: `--pk-shadow-*` · RN: `theme.shadow.*` (iOS shadow props + Android `elevation`) · Tailwind: `shadow-sm`, `shadow-overlay`

## 1. Rationale

- Shadows show **elevation** (what's on top), not decoration. A flat, calm UI uses few levels.
- **Light mode:** soft, low-opacity, slightly teal-tinted shadows (tint `#0B3B37` = teal.900) so they don't look dirty on the warm neutral canvas.
- **Dark mode:** shadows are nearly invisible on dark backgrounds, so elevation is shown by **lighter surfaces** (`bg.surface` → `bg.surface-raised`) **plus a 1 px border** (`color.border.default`). Shadow tokens in dark keep a strong black shadow only for overlays.
- **Performance:** large blurred shadows are expensive on low-end Android. Lists of cards use `shadow.xs` or borders only; heavy shadows only on 1–2 floating elements on screen at once.
- The elevation map (which component sits at which level, and its z-index) is in doc 16 §4.

## 2. Primitive shadows

| Token | Light (CSS `box-shadow`) | Dark |
|---|---|---|
| `shadow.none` | `none` | `none` |
| `shadow.xs` | `0 1px 2px 0 rgba(11,59,55,0.06)` | `none` (use border) |
| `shadow.sm` | `0 1px 3px 0 rgba(11,59,55,0.10), 0 1px 2px -1px rgba(11,59,55,0.08)` | `0 1px 2px 0 rgba(0,0,0,0.40)` |
| `shadow.md` | `0 4px 8px -2px rgba(11,59,55,0.10), 0 2px 4px -2px rgba(11,59,55,0.06)` | `0 4px 8px -2px rgba(0,0,0,0.50)` |
| `shadow.lg` | `0 12px 24px -6px rgba(11,59,55,0.14), 0 4px 8px -4px rgba(11,59,55,0.08)` | `0 12px 24px -6px rgba(0,0,0,0.60)` |
| `shadow.xl` | `0 24px 48px -12px rgba(11,59,55,0.20)` | `0 24px 48px -12px rgba(0,0,0,0.70)` |
| `shadow.inset` | `inset 0 1px 2px 0 rgba(11,59,55,0.08)` | `inset 0 1px 2px 0 rgba(0,0,0,0.40)` |

## 3. Semantic elevation

| Token | Light | Dark | Native Android `elevation` | Use |
|---|---|---|---|---|
| `elevation.flat` | `shadow.none` | `shadow.none` + no border | 0 | Inline content, list rows |
| `elevation.raised` | `shadow.xs` | `shadow.none` + `border.default` + `bg.surface` | 1 | Cards in lists, lot cards |
| `elevation.floating` | `shadow.md` | `shadow.sm` + `bg.surface-raised` | 4 | Sticky bottom bar, map controls, FAB, search bar over map |
| `elevation.overlay` | `shadow.lg` | `shadow.md` + `bg.surface-raised` + border | 8 | Bottom sheets, popovers, menus, dropdowns |
| `elevation.modal` | `shadow.xl` | `shadow.lg` + `bg.surface-raised` + border | 16 | Dialogs |
| `elevation.toast` | `shadow.lg` | `shadow.md` | 12 | Toasts / snackbars |
| `elevation.pressed` | `shadow.inset` | `shadow.inset` | 0 | Pressed state of raised cards (optional) |

## 4. Component mapping

| Component token | → |
|---|---|
| `card.shadow` | `elevation.raised` |
| `card.shadow-hover` (web) | `elevation.floating` |
| `lot-card.shadow` | `elevation.raised` |
| `map.search-bar.shadow` | `elevation.floating` |
| `map.marker.shadow` | `shadow.sm` (both themes) |
| `bottom-bar.shadow` | `elevation.floating` (shadow cast upward: y = −4 px) |
| `sheet.shadow` | `elevation.overlay` |
| `dialog.shadow` | `elevation.modal` |
| `menu.shadow` | `elevation.overlay` |
| `toast.shadow` | `elevation.toast` |
| `ticket.shadow` | `elevation.floating` |
| `input.shadow` | `shadow.none` (borders carry inputs) |

## 5. Rules

1. Never more than **2 shadow levels** visible at once in the same region.
2. No shadows in tables (portal/admin); use borders and row striping (`bg.subtle`).
3. Shadows don't replace borders for accessibility; interactive boundaries meet 3:1 through borders (doc 07).
4. Don't animate `box-shadow` on web; animate `opacity` of a pseudo-element if a hover lift is needed.
5. On Android, use the `elevation` prop only (iOS shadow props are ignored); never mix with `overflow: hidden` on the same view (it clips the shadow).

## 6. DTCG JSON

```json
{
  "shadow": {
    "$type": "shadow",
    "sm": {
      "$value": [
        { "color": "#0B3B371A", "offsetX": "0px", "offsetY": "1px", "blur": "3px", "spread": "0px" },
        { "color": "#0B3B3714", "offsetX": "0px", "offsetY": "1px", "blur": "2px", "spread": "-1px" }
      ]
    },
    "md": {
      "$value": [
        { "color": "#0B3B371A", "offsetX": "0px", "offsetY": "4px", "blur": "8px", "spread": "-2px" },
        { "color": "#0B3B370F", "offsetX": "0px", "offsetY": "2px", "blur": "4px", "spread": "-2px" }
      ]
    }
  },
  "elevation": {
    "raised":   { "$value": "{shadow.xs}", "$extensions": { "parkly": { "androidElevation": 1 } } },
    "floating": { "$value": "{shadow.md}", "$extensions": { "parkly": { "androidElevation": 4 } } },
    "overlay":  { "$value": "{shadow.lg}", "$extensions": { "parkly": { "androidElevation": 8 } } },
    "modal":    { "$value": "{shadow.xl}", "$extensions": { "parkly": { "androidElevation": 16 } } }
  }
}
```
Dark values live in `src/semantic/dark.json` under the same `elevation.*` keys, plus `$extensions.parkly.border: "{color.border.default}"` which the CSS/RN transforms turn into a border.

## 7. CSS

```css
:root {
  --pk-elevation-raised: 0 1px 2px 0 rgba(11,59,55,0.06);
  --pk-elevation-floating: 0 4px 8px -2px rgba(11,59,55,0.10), 0 2px 4px -2px rgba(11,59,55,0.06);
  --pk-elevation-raised-border: transparent;
}
[data-theme="dark"] {
  --pk-elevation-raised: none;
  --pk-elevation-raised-border: #3A413F;
}
.card { box-shadow: var(--pk-elevation-raised); border: 1px solid var(--pk-elevation-raised-border); }
```
Tailwind: `shadow-raised`, `shadow-floating`, `shadow-overlay`, `shadow-modal`, `shadow-toast`.

## 8. React Native

```tsx
const { elevation } = useTheme();
<View style={[styles.card, elevation.raised]} />
// elevation.raised resolves to:
// iOS:     { shadowColor, shadowOffset, shadowOpacity, shadowRadius }
// Android: { elevation: 1 }
// dark:    { borderWidth: 1, borderColor: '#3A413F' } (+ elevation 0)
```
The RN transform takes the **first** layer of multi-layer shadows (RN supports one) and maps `blur` → `shadowRadius = blur / 2`.
