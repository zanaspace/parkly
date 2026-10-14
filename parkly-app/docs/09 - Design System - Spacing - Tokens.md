# 09 — Design System: Spacing — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/space.json`, `src/semantic/space.json`
> CSS: `--pk-space-*` · RN: `theme.space.*` · Tailwind: `p-4`, `gap-inset-md` etc.

## 1. Rationale

- **4 px base grid** (dp on native, 1:1). Everything (padding, gaps, sizes) is a multiple of 4; 2 px is allowed only for hairline offsets and badge padding.
- Spacing is **semantic first**: components use `space.inset.*`, `space.stack.*`, `space.inline.*` and `space.layout.*`, not raw steps, so density modes (doc 08 §3.2) can adjust spacing in one place.
- Generous spacing = calm brand; the attendant PWA gets **larger** spacing for gloved/hurried thumbs, the admin console **tighter** for data density.

## 2. Primitive scale

| Token | px/dp | Tailwind key |
|---|---|---|
| `space.0` | 0 | `0` |
| `space.0_5` | 2 | `0.5` |
| `space.1` | 4 | `1` |
| `space.2` | 8 | `2` |
| `space.3` | 12 | `3` |
| `space.4` | 16 | `4` |
| `space.5` | 20 | `5` |
| `space.6` | 24 | `6` |
| `space.8` | 32 | `8` |
| `space.10` | 40 | `10` |
| `space.12` | 48 | `12` |
| `space.16` | 64 | `16` |
| `space.20` | 80 | `20` |
| `space.24` | 96 | `24` |

The Tailwind preset **replaces** Tailwind's default spacing scale with exactly these keys (so `p-7` doesn't exist and fails the build).

## 3. Semantic spacing

| Token | Comfortable (default) | Large (attendant) | Compact (admin) | Use |
|---|---|---|---|---|
| `space.inset.xs` | 4 | 8 | 4 | Badge/chip padding (vertical) |
| `space.inset.sm` | 8 | 12 | 6* | Small controls, table cell vertical |
| `space.inset.md` | 16 | 20 | 12 | **Card padding, input horizontal padding** |
| `space.inset.lg` | 24 | 24 | 16 | Sheet/modal padding |
| `space.inset.xl` | 32 | 32 | 24 | Empty-state containers |
| `space.stack.xs` | 4 | 8 | 4 | Label → input, title → subtitle |
| `space.stack.sm` | 8 | 12 | 8 | Between related lines in a card |
| `space.stack.md` | 16 | 20 | 12 | Between form fields, list items |
| `space.stack.lg` | 24 | 32 | 16 | Between sections |
| `space.stack.xl` | 40 | 48 | 32 | Before primary action block / page sections |
| `space.inline.xs` | 4 | 8 | 4 | Icon → text inside button/chip |
| `space.inline.sm` | 8 | 12 | 8 | Between chips, between buttons in a row |
| `space.inline.md` | 16 | 16 | 12 | Between form columns |
| `space.layout.gutter` | 16 | 16 | 24 | Screen side padding (mobile) / page gutters |
| `space.layout.gutter-md` | 24 | — | 24 | Gutter ≥ md breakpoint |
| `space.layout.gutter-lg` | 32 | — | 32 | Gutter ≥ lg breakpoint |
| `space.layout.section` | 48 | 48 | 32 | Between major page regions (web) |
| `space.layout.safe-bottom` | 16 + safe-area inset | same | — | Above bottom action bars (native) |

\* 6 px is the single permitted off-grid value (compact table cells); defined only in the compact density file.

## 4. Component spacing tokens (examples; full list in doc 15)

| Token | → Semantic |
|---|---|
| `button.padding-x.md` | `space.inset.md` (16) |
| `button.padding-x.sm` | `space.3` (12) |
| `button.gap` | `space.inline.xs` |
| `input.padding-x` | `space.inset.md` |
| `card.padding` | `space.inset.md` |
| `card.gap` | `space.stack.sm` |
| `sheet.padding` | `space.inset.lg` |
| `list-item.padding-y` | `space.inset.sm` + 4 = 12 → use `space.3` |
| `ticket.padding` | `space.inset.lg` |
| `bottom-bar.padding` | `space.inset.md` + safe area |

## 5. Rules

1. Margins go **between** siblings via `gap` (flex/grid) or `stack`; avoid margin on the component itself so it composes.
2. Screen-level side padding is always `space.layout.gutter` (16) on mobile; content never touches the screen edge except full-bleed media and maps.
3. The primary action sits in a sticky bottom bar on mobile with `space.layout.safe-bottom`, never floating mid-screen.
4. Touch targets are 48 dp even if the visual element is smaller: pad with `hitSlop` (RN) or `::before` expansion (web). Spacing between adjacent targets ≥ `space.2` (8).
5. No negative margins except the documented `card.media` full-bleed pattern.

## 6. DTCG JSON

```json
{
  "space": {
    "$type": "dimension",
    "0": { "$value": "0px" }, "0_5": { "$value": "2px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" },
    "3": { "$value": "12px" }, "4": { "$value": "16px" }, "5": { "$value": "20px" }, "6": { "$value": "24px" },
    "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" },
    "20": { "$value": "80px" }, "24": { "$value": "96px" },
    "inset": {
      "xs": { "$value": "{space.1}" }, "sm": { "$value": "{space.2}" }, "md": { "$value": "{space.4}" },
      "lg": { "$value": "{space.6}" }, "xl": { "$value": "{space.8}" }
    },
    "stack": {
      "xs": { "$value": "{space.1}" }, "sm": { "$value": "{space.2}" }, "md": { "$value": "{space.4}" },
      "lg": { "$value": "{space.6}" }, "xl": { "$value": "{space.10}" }
    },
    "inline": { "xs": { "$value": "{space.1}" }, "sm": { "$value": "{space.2}" }, "md": { "$value": "{space.4}" } },
    "layout": {
      "gutter": { "$value": "{space.4}" }, "gutter-md": { "$value": "{space.6}" },
      "gutter-lg": { "$value": "{space.8}" }, "section": { "$value": "{space.12}" }
    }
  }
}
```
Density overrides live in `src/semantic/density-large.json` and `density-compact.json` (same keys, different references).

## 7. CSS and Tailwind

```css
:root {
  --pk-space-4: 16px;
  --pk-space-inset-md: 16px;
  --pk-space-stack-md: 16px;
  --pk-space-layout-gutter: 16px;
}
@media (min-width: 768px) { :root { --pk-space-layout-gutter: 24px; } }
@media (min-width: 1024px) { :root { --pk-space-layout-gutter: 32px; } }
[data-density="large"]   { --pk-space-inset-md: 20px; --pk-space-stack-md: 20px; }
[data-density="compact"] { --pk-space-inset-md: 12px; --pk-space-stack-md: 12px; }
```
Tailwind: primitives as `p-4`, `gap-2`; semantics as `p-inset-md`, `gap-stack-md`, `px-gutter`.

## 8. React Native

```tsx
const { space } = useTheme();   // numbers in dp, density-resolved
<View style={{ padding: space.inset.md, gap: space.stack.sm }} />
<Pressable hitSlop={space.2} />
```
Use `react-native-safe-area-context` for insets; `space.layout.safe-bottom` is computed as `space.4 + insets.bottom` by the `BottomBar` component.
