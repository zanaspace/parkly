# 11 — Design System: Breakpoints — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/breakpoint.json`
> CSS: custom media + `--pk-breakpoint-*` · RN: `theme.breakpoint.*` + `useBreakpoint()` · Tailwind: `sm: md: lg: xl:` (overridden)

## 1. Rationale

- **Mobile-first.** Base styles target a **360 px** wide Android phone (most common Lagos screen class); breakpoints only add.
- The minimum supported width is **320 px** (small/older phones, 200% zoom on 640 px). Nothing may scroll horizontally at 320 px except data tables, which scroll inside their own container.
- Breakpoints are **content-driven** around our real layouts: a single-column phone, a two-pane tablet/landscape (list + map, list + detail), and a desktop portal/admin with side navigation.
- React Native apps (driver mobile) are phone-only in MVP but still read breakpoints for tablets/foldables and landscape.

## 2. Tokens

| Token | Min width | Typical device | Layout behaviour |
|---|---|---|---|
| `breakpoint.xs` | 0 | Small phones (320–359) | Single column, gutter 16, reduced hero sizes |
| `breakpoint.sm` | 360 px | Standard Android phones | **Base design target** |
| `breakpoint.md` | 768 px | Tablets portrait, large foldables | Two-pane where useful (search list + map side by side); gutter 24; type steps up (doc 08 §3.1) |
| `breakpoint.lg` | 1024 px | Tablets landscape, small laptops | Portal/admin side nav appears (collapsed rail at `lg`, expanded at `xl`); gutter 32 |
| `breakpoint.xl` | 1280 px | Laptops / desktops | Max content width kicks in; side nav expanded |
| `breakpoint.2xl` | 1536 px | Large desktops | Admin tables may use extra columns; driver web content stays centred |

### 2.1 Container widths

| Token | Value | Use |
|---|---|---|
| `container.prose` | 680 px | Legal pages, help articles |
| `container.form` | 560 px | Auth, onboarding, checkout forms on web |
| `container.content` | 1200 px | Driver web, marketing |
| `container.app` | 1440 px | Portal and admin main area |
| `sidebar.width.rail` | 72 px | Collapsed nav (`lg`) |
| `sidebar.width.expanded` | 256 px | Expanded nav (`xl`+) |
| `sheet.max-width` | 640 px | Bottom sheets become centred dialogs above `md` |

### 2.2 Height breakpoints (short screens)

| Token | Max height | Behaviour |
|---|---|---|
| `breakpoint.short` | ≤ 640 px | Hide onboarding illustrations; bottom sheet default snap at 50% instead of 40%; QR ticket stacks code below QR |

## 3. Layout per surface

| Surface | xs–sm | md | lg | xl+ |
|---|---|---|---|---|
| Driver web search | List with map toggle (FAB "Map") | List 40% + map 60% | same | same, max 1200 |
| Driver web lot detail | Single column, sticky book bar | Two column: info + booking card | same | same |
| Attendant PWA `/attend` | Single column, large density | Centred 560 px column | same | same (it's a phone tool) |
| Operator portal | Top bar + bottom tab nav, cards instead of tables | Top bar + drawer nav; tables with horizontal scroll | Rail nav + tables | Expanded nav, full tables |
| Admin console | Read-only, "use a larger screen" notice for complex tables | Drawer nav | Rail nav | Expanded nav (primary target ≥ 1280) |

## 4. DTCG JSON

```json
{
  "breakpoint": {
    "$type": "dimension",
    "xs":  { "$value": "0px" },
    "sm":  { "$value": "360px" },
    "md":  { "$value": "768px" },
    "lg":  { "$value": "1024px" },
    "xl":  { "$value": "1280px" },
    "2xl": { "$value": "1536px" },
    "short": { "$value": "640px", "$extensions": { "parkly": { "axis": "height", "query": "max" } } }
  },
  "container": {
    "$type": "dimension",
    "prose": { "$value": "680px" }, "form": { "$value": "560px" },
    "content": { "$value": "1200px" }, "app": { "$value": "1440px" }
  }
}
```

## 5. CSS and Tailwind

CSS variables can't be used inside `@media`, so the build emits **both** variables (for JS) and a PostCSS custom-media file:

```css
/* dist/css/custom-media.css (via postcss-custom-media) */
@custom-media --pk-sm  (min-width: 360px);
@custom-media --pk-md  (min-width: 768px);
@custom-media --pk-lg  (min-width: 1024px);
@custom-media --pk-xl  (min-width: 1280px);
@custom-media --pk-2xl (min-width: 1536px);
@custom-media --pk-short (max-height: 640px);

:root { --pk-breakpoint-md: 768px; --pk-container-content: 1200px; }
```

Tailwind preset **replaces** `theme.screens`:
```js
screens: { sm: '360px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px', short: { raw: '(max-height: 640px)' } }
```
Use container queries (`@container`) for components that live in both narrow and wide places (e.g. `LotCard` in a list pane vs full width).

## 6. React Native

```tsx
import { useBreakpoint } from '@parkly/ui-native';
const bp = useBreakpoint();          // 'xs' | 'sm' | 'md' | 'lg' | 'xl' from useWindowDimensions()
const twoPane = bp === 'md' || bp === 'lg' || bp === 'xl';
```
`theme.breakpoint` exports numbers (`{ sm: 360, md: 768, ... }`). Re-evaluates on rotation and fold changes.

## 7. Testing

- Playwright visual tests run each web page at **320, 360, 768, 1024, 1280** widths, light and dark.
- Maestro flows run on a 720×1600 (360 dp) Android emulator profile.
- CI checks for horizontal overflow at 320 px (`document.documentElement.scrollWidth <= 320`).
