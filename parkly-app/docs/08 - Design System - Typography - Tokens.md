# 08 — Design System: Typography — Tokens

> Package: `@parkly/tokens` · Source: `src/primitive/typography.json`, `src/semantic/typography.json`
> CSS: `--pk-font-*` · RN: `theme.typography.*` · Tailwind: `text-body-md`, `font-display` etc.

## 1. Rationale and font choice

| Role | Family | Why | Source |
|---|---|---|---|
| **Display / headings** | **Plus Jakarta Sans** (600, 700, 800) | Friendly, modern geometric sans with confident headlines; open licence (OFL) | Google Fonts · `@expo-google-fonts/plus-jakarta-sans` |
| **Text / UI / numbers** | **Inter** (400, 500, 600, 700) | Very legible at small sizes on low-DPI screens; tabular figures; full Latin coverage **including ₦ (U+20A6)** | Google Fonts · `@expo-google-fonts/inter` |
| **Mono: codes and plates** | **JetBrains Mono** (500, 600) | Clear distinction between 0/O and 1/I/l, which matters for booking codes and plates | Google Fonts · `@expo-google-fonts/jetbrains-mono` |

Rules:
- **All money is set in Inter** (`font.family.text`) with tabular figures, because Inter's ₦ glyph is guaranteed. Never put prices in the display or mono family. The token build test opens each bundled font file and fails if Inter lacks U+20A6.
- Booking codes use an alphabet without 0/O/1/I/L (doc 00 §3.4), and the mono font is still used so attendants can read them from a screen in sunlight.
- Max **3 families** in total. Ship only the listed weights. Subset web fonts to Latin + Latin-1 + U+20A6; self-host via `next/font` (no Google Fonts runtime request).
- System fallback stacks keep text readable while fonts load (`font-display: swap`).

## 2. Primitive tokens

| Token | Value |
|---|---|
| `font.family.display` | `"Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `font.family.text` | `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `font.family.mono` | `"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` |
| `font.weight.regular` | 400 |
| `font.weight.medium` | 500 |
| `font.weight.semibold` | 600 |
| `font.weight.bold` | 700 |
| `font.weight.extrabold` | 800 |
| `font.size.12` … `font.size.40` | 12, 14, 16, 18, 20, 24, 28, 32, 40 (px / dp) |
| `font.line-height.16` … `48` | 16, 20, 24, 26, 28, 32, 36, 40, 48 |
| `font.letter-spacing.tight` | −0.02em |
| `font.letter-spacing.normal` | 0 |
| `font.letter-spacing.wide` | 0.06em |
| `font.letter-spacing.code` | 0.08em |

React Native note: RN needs a **family name per weight** (e.g. `Inter_600SemiBold`). The RN build output maps `{family, weight}` → loaded font name. Never set `fontWeight` on custom fonts in RN; use the token's resolved `fontFamily`.

## 3. Semantic type scale (base: mobile, comfortable density)

| Token | Family | Size / line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|---|
| `type.display.lg` | display | 32 / 40 | 800 | tight | Marketing hero, booking-confirmed headline |
| `type.display.md` | display | 28 / 36 | 700 | tight | Onboarding titles |
| `type.heading.xl` | display | 24 / 32 | 700 | tight | Screen title (H1) |
| `type.heading.lg` | display | 20 / 28 | 700 | normal | Section title (H2), lot name on detail |
| `type.heading.md` | display | 18 / 26 | 600 | normal | Card title (H3) |
| `type.heading.sm` | text | 16 / 24 | 600 | normal | Sub-section (H4), list group headers |
| `type.body.lg` | text | 18 / 28 | 400 | normal | Attendant PWA body, important explanations |
| `type.body.md` | text | 16 / 24 | 400 | normal | **Default body** |
| `type.body.sm` | text | 14 / 20 | 400 | normal | Secondary text, table cells (portal/admin) |
| `type.caption` | text | 12 / 16 | 400 | normal | Timestamps, helper text, map attributions |
| `type.label.lg` | text | 16 / 20 | 600 | normal | Large buttons |
| `type.label.md` | text | 14 / 20 | 600 | normal | Buttons, input labels, tabs |
| `type.label.sm` | text | 12 / 16 | 600 | normal | Chips, badges |
| `type.overline` | text | 12 / 16 | 600 | wide, UPPERCASE | Section eyebrows ("BOOKING DETAILS") |
| `type.price.lg` | text | 28 / 36 | 700 | tight, tabular-nums | Total on payment screen |
| `type.price.md` | text | 18 / 24 | 700 | normal, tabular-nums | Price on lot card, map pill uses `label.md` |
| `type.price.sm` | text | 14 / 20 | 600 | normal, tabular-nums | Line items |
| `type.code.lg` | mono | 28 / 36 | 600 | code | Booking code on QR ticket |
| `type.code.md` | mono | 16 / 24 | 500 | code | Plates in lists, codes in tables |
| `type.code.sm` | mono | 14 / 20 | 500 | code | Plates in dense tables |

### 3.1 Responsive steps (web, from `breakpoint.md` 768 px; doc 11)

| Token | < md | ≥ md | ≥ lg |
|---|---|---|---|
| `type.display.lg` | 32/40 | 40/48 | 40/48 |
| `type.display.md` | 28/36 | 32/40 | 32/40 |
| `type.heading.xl` | 24/32 | 28/36 | 28/36 |
| Others | unchanged | unchanged | unchanged |

### 3.2 Density modifiers

| Density | Applies to | Modifier |
|---|---|---|
| `comfortable` (default) | driver app, driver web, portal | scale as above |
| `large` | **Attendant PWA** | body default = `type.body.lg`; labels `label.lg`; code on scan result `code.lg` |
| `compact` | Admin console tables | table cells `body.sm`, headers `label.sm` |

Density is set by a `data-density` attribute on `<html>` (web) or `DensityProvider` (native). Components read density-aware tokens (`type.body.default` → resolves per density).

## 4. Contrast for text

All text styles use `color.text.*` semantic colours. Ratios are in doc 07 §5. `type.caption` (12 px) must use `text.secondary` or `text.primary` on light; `text.tertiary` is allowed for captions because it measures 5.10:1 (light) and 5.46:1 (dark) on surface, which passes AA for normal text.

## 5. Rules

1. Use semantic `type.*` tokens only; no raw sizes.
2. One `heading.xl` per screen. Headings follow document order (H1 → H2 → H3) for screen readers (`accessibilityRole="header"` on native).
3. Line length ≤ 70 characters on web (`max-width: 65ch` for prose).
4. Never use all-caps except `type.overline` and booking codes/plates.
5. Numbers in tables and prices use `font-variant-numeric: tabular-nums` (RN: `fontVariant: ['tabular-nums']`).
6. Must survive 200% scaling: no fixed heights on text containers; truncation only with `numberOfLines` + full text available (detail screen or accessibility label).
7. Don't use weights below 400 (thin text breaks on low-DPI screens).

## 6. DTCG JSON

`packages/tokens/src/primitive/typography.json`
```json
{
  "font": {
    "family": {
      "$type": "fontFamily",
      "display": { "$value": ["Plus Jakarta Sans", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      "text":    { "$value": ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      "mono":    { "$value": ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"] }
    },
    "weight": {
      "$type": "fontWeight",
      "regular": { "$value": 400 }, "medium": { "$value": 500 }, "semibold": { "$value": 600 },
      "bold": { "$value": 700 }, "extrabold": { "$value": 800 }
    },
    "size": {
      "$type": "dimension",
      "12": { "$value": "12px" }, "14": { "$value": "14px" }, "16": { "$value": "16px" },
      "18": { "$value": "18px" }, "20": { "$value": "20px" }, "24": { "$value": "24px" },
      "28": { "$value": "28px" }, "32": { "$value": "32px" }, "40": { "$value": "40px" }
    }
  }
}
```

`packages/tokens/src/semantic/typography.json`
```json
{
  "type": {
    "$type": "typography",
    "heading": {
      "xl": { "$value": { "fontFamily": "{font.family.display}", "fontSize": "{font.size.24}", "fontWeight": "{font.weight.bold}", "lineHeight": "32px", "letterSpacing": "-0.02em" } }
    },
    "body": {
      "md": { "$value": { "fontFamily": "{font.family.text}", "fontSize": "{font.size.16}", "fontWeight": "{font.weight.regular}", "lineHeight": "24px", "letterSpacing": "0" } }
    },
    "price": {
      "lg": {
        "$value": { "fontFamily": "{font.family.text}", "fontSize": "{font.size.28}", "fontWeight": "{font.weight.bold}", "lineHeight": "36px", "letterSpacing": "-0.02em" },
        "$extensions": { "parkly": { "fontVariantNumeric": "tabular-nums" } }
      }
    },
    "code": {
      "lg": { "$value": { "fontFamily": "{font.family.mono}", "fontSize": "{font.size.28}", "fontWeight": "{font.weight.semibold}", "lineHeight": "36px", "letterSpacing": "0.08em" } }
    }
  }
}
```

## 7. CSS output and Tailwind

```css
:root {
  --pk-font-family-display: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
  --pk-font-family-text: "Inter", system-ui, sans-serif;
  --pk-font-family-mono: "JetBrains Mono", ui-monospace, monospace;
  --pk-type-body-md-font-size: 16px;
  --pk-type-body-md-line-height: 24px;
  --pk-type-body-md-font-weight: 400;
  /* one group of 5 vars per type token */
}
@media (min-width: 768px) {
  :root { --pk-type-display-lg-font-size: 40px; --pk-type-display-lg-line-height: 48px; }
}
[data-density="large"] { --pk-type-body-default-font-size: 18px; --pk-type-body-default-line-height: 28px; }
```
The Tailwind preset generates utilities: `text-heading-xl`, `text-body-md`, `text-price-lg`, `text-code-lg`, `font-display`, `font-text`, `font-mono`, each setting size + line-height + weight + letter-spacing together.

Web font loading (`apps/*/app/fonts.ts`):
```ts
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
export const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--pk-font-inter', display: 'swap' });
```
(Confirm the `latin` subset of Inter includes U+20A6 in the token test; if not, add `latin-ext`.)

## 8. React Native usage

```tsx
// apps/mobile/app/_layout.tsx
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
// keep the splash screen until loaded

// in components
import { Text } from '@parkly/ui-native';
<Text variant="heading.xl">Find parking</Text>
<Text variant="price.lg">{formatNaira(totalKobo)}</Text>
<Text variant="code.lg" accessibilityLabel={spellOut(code)}>{code}</Text>
```
`<Text>` resolves `variant` → `{ fontFamily, fontSize, lineHeight, letterSpacing }` from `theme.typography`, honours `allowFontScaling` (always true) and sets `maxFontSizeMultiplier={2}`.
