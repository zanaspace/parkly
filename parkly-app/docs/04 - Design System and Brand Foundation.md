# 04 — Design System and Brand Foundation

> **Audience:** coding agents and engineers building `packages/tokens`, `packages/ui`, `packages/ui-native` and all app screens.
> **Status:** v1.0, 14 Oct 2026. If this doc conflicts with doc 00, doc 00 wins.
> **Token docs:** 07 Colors · 08 Typography · 09 Spacing · 10 Shadows · 11 Breakpoints · 12 Corner Radius · 13 Gradients · 14 Patterns · 15 Components · 16 System.

---

## 1. Brand in one line

**Parkly is the calm, trustworthy way to park in Lagos: a verified space, a fixed price, no cash, no touts.**

The product sells **certainty**. Every visual and written choice should lower anxiety: is the lot safe, what will I pay, can I get in, what happens if something goes wrong.

## 2. Brand personality

| Trait | We are | We are not |
|---|---|---|
| **Trustworthy** | Clear, specific, honest about price and rules | Vague, salesy, hiding fees |
| **Calm** | Unhurried layouts, plenty of white space, one primary action per screen | Busy, flashing, urgent red everywhere |
| **Lagos-confident** | Knows the city: districts, landmarks, real traffic, power and network problems | Generic, Silicon-Valley copy, imported clichés |
| **Practical** | Built for one hand, bright sunlight, a cheap Android phone, a weak network | Decorative, heavy, animation-led |
| **Respectful** | Treats attendants and operators as professionals | Talking down, jargon, blame |

## 3. Voice and tone

### 3.1 Principles

1. **Plain, clear English.** Write in standard Nigerian English that any driver, attendant or facilities manager understands. No pidgin, slang or jokes in product UI (marketing may experiment later, under a separate review).
2. **Say the number.** Prices, times and rules are stated exactly: "₦1,500 for 2 hours", not "affordable".
3. **Lead with what happens next.** Every message answers "what do I do now?"
4. **Never blame the user.** "We couldn't confirm your payment" rather than "You failed to pay".
5. **Short.** Buttons ≤ 3 words. Toasts ≤ 1 sentence. Errors ≤ 2 sentences.
6. **Verbs on buttons.** "Book space", "Pay ₦1,600", "Check in", "Extend 1 hour". Never "OK" or "Submit" where a specific verb fits.

### 3.2 Tone by situation

| Situation | Tone | Example |
|---|---|---|
| Search / browsing | Helpful, factual | "12 verified lots within 1 km of Adeola Odeku Street" |
| Price before payment | Precise, transparent | "₦1,500 parking + ₦100 service fee = **₦1,600**. No cash at the gate." |
| Booking confirmed | Warm, reassuring | "You're booked. Show this code at the gate of Eko Hotel Car Park." |
| Payment failed | Calm, specific, next step | "Your bank didn't approve this payment. You haven't been charged. Try again or use another card." |
| Offline (attendant) | Reassuring, factual | "You're offline. Check-ins are saved on this phone and will sync when you're back online." |
| Permit expiring (operator) | Firm, helpful | "Your LASPA permit for Marina Lot expires on 31 Oct 2026. Upload the renewed permit to stay live." |
| Lot suspended | Serious, clear | "This lot is paused because its permit has expired. Your existing bookings are not affected." |
| Incident / safety | Serious, caring, fast | "We're sorry this happened. Our support team will call you within 15 minutes." |

### 3.3 Words we use / avoid

| Use | Avoid |
|---|---|
| lot, space, booking, pass, check in, check out, extend | slot (in UI), ticket (except "parking ticket" QR), reservation (too formal) |
| verified lot | certified, approved, safe (we don't promise "safe") |
| service fee | convenience fee, platform charge |
| attendant | gateman, tout |
| refund | reversal (except in finance console) |
| "We" (Parkly) | "The system", "the app" |

Brand strings (product name, support phone, WhatsApp number, legal entity) come from `packages/config/brand.ts`. Never hard-code "Parkly" in components.

## 4. Logo usage (placeholders until final artwork)

The final logo is not designed yet. Until it is:

- Use the **wordmark placeholder**: "Parkly" set in Plus Jakarta Sans ExtraBold (800), `color.brand.primary` on light, `color.text.inverse` on the brand gradient. Letter-spacing −0.02em.
- **Symbol placeholder:** a rounded square (radius `radius.lg`) in `color.brand.primary` with a white bold "P". Used for app icon, favicon, map markers for featured lots.
- **Clear space:** at least the height of the "P" on all sides.
- **Minimum size:** wordmark 72 px wide (web) / 72 dp (native); symbol 24 px.
- **Don'ts:** no stretching, recolouring outside brand tokens, drop shadows, outlines, or placing on busy photos without the `gradient.scrim` overlay.
- Assets live in `packages/tokens/assets/brand/` (`logo-wordmark.svg`, `logo-symbol.svg`, `app-icon-1024.png`, `adaptive-icon-foreground.png`). Replace the files only, never the file names, when final artwork lands.

## 5. Accessibility (WCAG 2.2 AA is the floor)

| Requirement | Rule |
|---|---|
| Text contrast | ≥ 4.5:1 for body text, ≥ 3:1 for large text (≥ 18.66 px bold / 24 px regular). All semantic text/background pairs are checked in doc 07. |
| Non-text contrast | Borders of inputs, focus rings and icons that carry meaning ≥ 3:1. |
| Touch targets | ≥ **48 × 48 dp** on native, ≥ 44 × 44 px on web (WCAG 2.5.8 minimum is 24 px; we exceed it). See doc 16. |
| Focus | Visible focus ring on every interactive element (`focus.ring` tokens, doc 16). Never `outline: none` without a replacement. |
| Colour is never the only signal | Status always pairs colour with an **icon and a text label** (e.g. verified badge = shield-check icon + "Verified" + colour). |
| Text scaling | Layouts must work at 200% font scale on web and Android "Largest" font size. No fixed-height text containers. |
| Screen readers | All icons-only buttons have `aria-label` / `accessibilityLabel`. Booking codes and plates read character by character (`accessibilityLabel="P K, 7 H Q 4 M Z"`). |
| Motion | Respect `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled()`: replace movement with fades ≤ 100 ms. |
| Forms | Every input has a visible label (no placeholder-only labels), errors linked via `aria-describedby`, errors announced politely. |
| Timeouts | The 10-minute payment window shows a visible countdown and a warning at 2 minutes (WCAG 2.2.1). |
| Authentication | OTP fields support paste and autofill (`autocomplete="one-time-code"`, Android SMS Retriever). No cognitive puzzles (WCAG 3.3.8). |
| Language | `lang="en-NG"` on web documents. |

## 6. Performance budgets (low-end Android first)

Reference device: **2 GB RAM Android 10, Snapdragon 4xx class, 720 × 1600 screen, on a 3G/weak 4G connection.** Every sprint demo is checked on this class of device (or an emulator profile matching it).

| Budget | Target |
|---|---|
| Driver app cold start to interactive | ≤ 3.0 s on reference device |
| Android APK/AAB download size | ≤ 30 MB |
| JS bundle (Hermes bytecode) | ≤ 6 MB |
| Screen transition | 60 fps target; never drop below 45 fps on lists |
| Attendant PWA first load | ≤ 250 KB JS gzipped for `/attend`, LCP ≤ 2.5 s on Slow 4G |
| Attendant PWA repeat load (offline) | ≤ 1 s from service-worker cache |
| Driver web LCP | ≤ 2.5 s (p75, mobile), CLS ≤ 0.1, INP ≤ 200 ms |
| Images | WebP/AVIF, max 1600 px longest side, lazy-loaded below the fold; lot photos ≤ 150 KB each |
| Fonts | Max 2 families + 1 mono, subset to Latin + ₦ (U+20A6); `font-display: swap` |
| Map | Load map only on the search screen; list view is usable before the map tiles arrive |

Design implications: prefer flat surfaces over heavy blur, no large background videos, skeletons instead of spinners, gradients only where specified (doc 13).

## 7. Dark mode

- Supported on **all surfaces** from MVP. Default follows the OS (`prefers-color-scheme` / `useColorScheme()`); user can override in Settings (`system | light | dark`), stored locally.
- Dark mode is **not inverted light mode**: it uses its own semantic values (doc 07), lighter primary (teal-300) and fewer shadows (doc 10 uses borders + surface steps for elevation in dark).
- The **attendant PWA** defaults to light because it's used outdoors in sunlight; dark is available.
- QR codes are **always rendered dark-on-white** inside a white card, in both themes, so scanners work.

## 8. Iconography

- **Library: Lucide** (`lucide-react` for web, `lucide-react-native` for native). It's MIT-licensed, has a consistent 24 px grid and tree-shakes. Don't mix in other icon libraries.
- Default stroke width **2**, sizes from doc 16 (`icon.size.sm 16`, `md 20`, `lg 24`, `xl 32`).
- Icons inherit `currentColor`. Semantic icons:

| Meaning | Lucide icon |
|---|---|
| Verified lot | `shield-check` |
| Security guard | `user-check` |
| CCTV | `cctv` |
| Lighting | `lamp` |
| Access control / gate | `door-closed` |
| Covered parking | `umbrella` |
| Opening hours | `clock` |
| Price | `banknote` |
| Location / directions | `map-pin`, `navigation` |
| Booking / QR | `qr-code`, `ticket` |
| Vehicle | `car` |
| Offline | `wifi-off` |
| Sync pending | `refresh-cw` |
| Incident | `triangle-alert` |
| Support | `headset` |
| Permit | `file-badge` |

- Custom icons (if ever needed) are drawn on the same 24 px grid, 2 px stroke, round caps and joins, and added to `packages/tokens/assets/icons/`.

## 9. Illustration and imagery

- **Illustration style:** simple flat spot illustrations, 2–3 colours from the palette (teal, amber, neutral), rounded shapes, no gradients inside illustrations. Used only for empty states, onboarding (max 3 screens) and success screens. Each ≤ 20 KB SVG.
- **People:** where people appear, they reflect Lagos drivers and attendants. No stock-photo clichés.
- **Lot photos:** real photos taken during verification (entrance, interior, signage). Aspect 4:3, shown with `radius.md`. No filters. Required alt text: "Entrance of {lot name}".
- **Maps:** custom Google Maps style (muted roads, POI labels reduced) defined in `packages/tokens/assets/map-style.{light,dark}.json`. Lot markers use the price pill pattern (doc 14).

## 10. Motion

- Motion explains **change of state**, it never decorates. Durations and easings come from doc 16 (`motion.duration.*`, `motion.easing.*`).
- Allowed: bottom-sheet slide, page push, toast fade/slide, skeleton shimmer (disabled under reduced motion), success check draw (≤ 400 ms) on booking confirmed.
- Not allowed: parallax, looping animations on idle screens, bouncy springs on financial actions.
- Native: `react-native-reanimated`; web: CSS transitions. Animate `transform` and `opacity` only.

## 11. Content rules

### 11.1 Money

- Currency symbol **₦** (U+20A6) directly before the amount, no space: `₦1,500`.
- Thousands separator comma; **no decimals** when kobo = 0 (`₦1,500`); 2 decimals when not (`₦1,512.50`, finance console only).
- Format with `formatNaira(amountKobo)` in `packages/domain/format` — never format in components.
- Fees are always itemised before payment: parking amount, service fee, total. Total is bold.
- Operator views show **gross, commission, net** in that order.
- If a font lacks ₦ the token build fails (fonts in doc 08 support U+20A6).

### 11.2 Dates and times

- Time zone shown is always Lagos time; never show "WAT" unless the user is outside Nigeria.
- 12-hour clock with lowercase am/pm: `9:30 am`, `2:00 pm`. Finance/admin tables may use 24-hour `14:00`.
- Dates: `Tue, 14 Oct` in lists; `14 Oct 2026` in receipts and documents; relative ("Today", "Tomorrow") for the next 2 days.
- Ranges: `Today, 9:00 am – 5:00 pm`; `14–31 Oct 2026` for passes.
- Durations: `2 h 30 min`, `45 min`, `1 day`, `1 month`.
- Use `formatDateTime` / `formatRange` helpers from `packages/domain/format` (Intl API, locale `en-NG`).

### 11.3 Plates and codes

- Plates display in the **mono font** (`font.family.mono`), uppercase, with the user's original separators: `LND-123-AB`. Matching always uses the normalised form (doc 00 §3.4).
- Booking codes display as `PK-7HQ4MZ` in mono, `font.size.code`, with letter-spacing `0.08em`.
- Phone numbers display as `+234 803 123 4567`; masked as `+234 803 *** 4567` everywhere except the user's own profile.

### 11.4 Addresses and places

- Lot names use the operator's name as given (title case). Show district after name: "Marina Car Park · Lagos Island".
- Distance: `350 m`, `1.2 km`. Walk time optional: `4 min walk`.

### 11.5 Capitalisation and punctuation

- Sentence case for everything (titles, buttons, labels): "Book space", not "Book Space".
- No full stop in buttons, labels or single-sentence toasts. Full stops in multi-sentence body text.
- No exclamation marks except the booking-confirmed headline.

## 12. How tokens flow (implementation)

```
packages/tokens/
├── src/
│   ├── primitive/          # color.json, typography.json, space.json, radius.json, shadow.json, motion.json, ...
│   ├── semantic/
│   │   ├── light.json      # color.bg.*, color.text.* → references primitives
│   │   └── dark.json
│   └── component/          # button.json, input.json, card.json, ... → references semantic tokens
├── assets/                 # brand, icons, map styles, illustrations
├── style-dictionary.config.mjs
├── dist/                   # generated, git-ignored
│   ├── css/tokens.css              # :root (light) + [data-theme="dark"] + @media (prefers-color-scheme: dark)
│   ├── tailwind/preset.cjs         # Tailwind preset mapping to CSS vars
│   ├── native/theme.ts             # { light, dark } typed objects for React Native
│   └── ts/tokens.d.ts              # typed token names
└── package.json            # name: "@parkly/tokens"
```

1. **Source format:** W3C Design Tokens Community Group (DTCG) JSON: every token has `$value` and `$type`; references use `{color.teal.600}` syntax. Files use the `.json` extension.
2. **Three layers:**
   - **Primitive** (`color.teal.600`, `space.4`): raw values. **Never used directly by components.**
   - **Semantic** (`color.bg.surface`, `color.action.primary.bg`): meaning; differs between light and dark.
   - **Component** (`button.primary.bg`, `input.border.focus`): per-component, references semantic tokens only.
3. **Build:** Style Dictionary v4 (`pnpm tokens:build`, which runs `pnpm --filter @parkly/tokens build`) runs in Turborepo before any app builds. Outputs:
   - **CSS variables** prefixed `--pk-`: `--pk-color-bg-surface`. Light values on `:root`, dark on `[data-theme="dark"]` and inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.
   - **Tailwind preset** (`@parkly/tokens/tailwind`): Tailwind theme keys point at CSS vars (`colors.bg.surface = 'var(--pk-color-bg-surface)'`) so dark mode works without `dark:` variants. Web apps use `presets: [require('@parkly/tokens/tailwind')]`.
   - **React Native theme** (`@parkly/tokens/native`): `theme.light` / `theme.dark` plain objects with numbers for dimensions (px → dp 1:1), consumed via a `ThemeProvider` in `packages/ui-native` and a `useTheme()` hook.
4. **Lint rules:**
   - ESLint rule bans hex colours, raw `px` values (other than `0` and `1px` hairlines) and font names in `apps/*` and `packages/ui*`. Use tokens.
   - CI runs `pnpm --filter @parkly/tokens test`, which checks every semantic text/background pair in doc 07 still meets its contrast target, and that every component token resolves.
5. **Change process:** token changes need a PR touching the JSON **and** the relevant doc (07–16). Renaming a semantic or component token is a breaking change: add the new one, deprecate the old (`$extensions.parkly.deprecated: true`) for one sprint, then remove it.

## 13. Platform notes

| Surface | Theme | Density | Notes |
|---|---|---|---|
| Driver mobile (`apps/mobile`) | System default | Comfortable | Bottom tab bar, bottom sheets, one primary action per screen |
| Driver web (`apps/web`) | System default | Comfortable | Mobile-first; same patterns as native |
| Attendant PWA (`/attend`) | **Light default** | **Large** — base font 18 px, 56 px buttons | Sunlight readable, one-handed, works with gloves; scan button always in thumb zone |
| Operator portal | System default | Comfortable → compact tables | Desktop-first tables, mobile usable |
| Admin console | System default | **Compact** | Data-dense tables; `color.bg.canvas` with a distinct environment banner (doc 16 `env.banner`) on non-prod |

## 14. Definition of done for any UI work

- [ ] Uses only tokens (no hex/px/font literals); passes lint.
- [ ] Light and dark checked; screenshots of both in the PR.
- [ ] Works at 200% text size and 320 px width.
- [ ] Touch targets ≥ 48 dp; focus visible; screen-reader labels present.
- [ ] Loading (skeleton), empty, error and offline states implemented (doc 14).
- [ ] Copy follows §3 and §11; strings externalised in the app's `i18n/en.json` (English only in MVP, structure ready for more).
- [ ] Checked on the low-end Android reference profile.
