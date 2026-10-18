# Design System — Source of Truth

> **This file is the canonical reference for Guad's visual identity.**
> Every color, font, radius, shadow, and spacing value comes directly from the production `styles.css`.
> When building Svelte components, match these values exactly. Do not substitute with Tailwind defaults or generic palettes.

## Fonts

| Token | Value | Usage |
|-------|-------|-------|
| `--sans` | `Figtree, 'Segoe UI', system-ui, -apple-system, sans-serif` | All UI text |
| `--serif` | `Georgia, 'Times New Roman', serif` | Wordmark logo, decorative headings |

Figtree is self-hosted (`src/lib/app/fonts/`): one variable Latin-subset woff2 covering weights 300-900, preloaded on every page. No Google Fonts request.

Base: `font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased`.

## Color Tokens — Light Mode (default)

| Token | Hex | Purpose |
|-------|-----|---------|
| `--bg` | `#FFFCF3` | Page background (warm cream — NOT white) |
| `--card` | `#FFFFFF` | Card surfaces |
| `--ink` | `#1C1B4B` | Primary text (deep navy) |
| `--muted` | `#5A5880` | Secondary text (purple-gray) |
| `--faint` | `#8B89AA` | Tertiary text, placeholders, disabled. **WCAG warning:** 3.27:1 on `--bg`, 3.36:1 on `--card` — fails AA for normal text (4.5:1 required). Use only for large/bold text (3:1 threshold), placeholders, or disabled states where reduced contrast is expected. Consider `#706E96` (4.70:1 on cream) if AA-compliant normal text is needed. |
| `--line` | `#ECEDF6` | Borders, dividers |
| `--line2` | `#DADDF3` | Stronger borders (inputs, segments) |
| `--blue` | `#2F3ED8` | Primary actions, links, active states |
| `--blue-d` | `#2230B8` | Primary hover/pressed |
| `--sky` | `#EEF0FF` | Selected/active backgrounds, avatar bg |
| `--lemon` | `#FFD66B` | Lomi orb, lemon FAB, Lomi-specific accent |
| `--lemon-2` | `#FFF4CC` | Lomi callout backgrounds, orb inner ring |
| `--lemon-line` | `#F2D27A` | Lomi callout borders |
| `--ok` | `#1F7A4D` | Success, approved, given, verified |
| `--ok-bg` | `#E6F4EC` | Success backgrounds |
| `--bad` | `#B42318` | Errors, alerts, refused, returned |
| `--bad-bg` | `#FDECEA` | Error/alert backgrounds |
| `--shadow` | `0 1px 2px rgba(28,27,75,.05), 0 8px 24px -16px rgba(28,27,75,.25)` | Card elevation |

**Critical:** `--bg` is `#FFFCF3` (warm cream), NOT pure white. This is the signature Guad warmth. Do not change it.

## Color Tokens — Dark Mode

Applied via `[data-theme="guad-dark-off"]`. (The `prefers-color-scheme: dark` media query in styles.css is intentionally disabled with a `max-width:0px` guard.)

**As built (src/lib/app/styles.css):** the same navy values, applied by `:root[data-theme="dark"]` (the Light / Dark / Auto toggle in the app bar) and by `prefers-color-scheme: dark` unless the person chose Light. Three tokens were added for colours that were hard-coded: `--warn` / `--warn-bg` (warning pills; dark `#E8B84A` / `#2A2418`, as the MVP's dark `.pill.warn`), `--flag-bg` / `--flag-line` (Lomi vague-word highlights; dark `#4A4022` as the MVP's `.cv-text.flagged`), and `--ink-inverse` for text on `--blue` (white in light mode, `#1C1B4B` in dark, per frontend-spec-1.md §10.2.4, because white on `#8590FF` fails AA).

| Token | Hex |
|-------|-----|
| `--bg` | `#12122E` |
| `--card` | `#1C1C42` |
| `--ink` | `#F2F1FF` |
| `--muted` | `#B7B6DA` |
| `--faint` | `#8C8BB4` |
| `--line` | `#2B2B5A` |
| `--line2` | `#3A3A70` |
| `--blue` | `#8590FF` |
| `--blue-d` | `#A2AAFF` |
| `--sky` | `#24255A` |
| `--lemon` | `#FFD66B` (unchanged) |
| `--lemon-2` | `#3A3320` |
| `--lemon-line` | `#6A5A26` |
| `--ok` | `#7FD8A8` |
| `--ok-bg` | `#1B3A2C` |
| `--bad` | `#FF9C94` |
| `--bad-bg` | `#3D1F25` |
| `--shadow` | `none` |

## Border Radii

| Element | Radius |
|---------|--------|
| Cards | `20px` |
| Buttons (primary) | `999px` (pill) |
| Input fields | `14px` |
| Segmented controls | `14px` outer, `11px` inner buttons |
| Avatars | `999px` (circle) |
| Square avatars | `14px` |
| Bottom sheet | `26px 26px 0 0` (mobile), `26px` (desktop centered) |
| Callouts | `18px` |
| Tooltips/toasts | `999px` |
| Focus ring | `10px` |

## Shadows

| Context | Value |
|---------|-------|
| Cards | `0 1px 2px rgba(28,27,75,.05), 0 8px 24px -16px rgba(28,27,75,.25)` |
| Phone frame (desktop) | `0 30px 80px -40px rgba(28,27,75,.35)` |
| Lomi FAB | `0 10px 24px -10px rgba(140,100,0,.6)` |
| Toast | `0 10px 30px -10px rgba(0,0,0,.4)` |
| Dark mode | `none` (all shadows removed) |

## Layout

### Phone Frame (Caregiver App)
- `max-width: 420px`, centered
- On desktop (≥700px): border, rounded corners (`32px`), box shadow — looks like a phone
- On mobile: full width, no border

### Supervisor Dashboard
- Two-column grid: `220px` sidebar + fluid main
- Max width: `1200px`, centered
- On mobile (≤900px): collapses to single column, sidebar becomes horizontal scroll tabs

### Spacing
- Page padding: `16px` horizontal
- Card padding: `16px 18px`
- Section gap: `18px` (mobile), `20px` (desktop `.main`)
- Field gap: `14px`
- Screen bottom padding: `120px` (to clear dock/nav)

## Component Patterns

### Buttons
- Primary: `min-height: 52px`, `padding: 0 22px`, `font-weight: 600`, `font-size: 16px`, `border-radius: 999px`, `background: var(--blue)`, `color: #fff`
- Secondary (`.sec`): white bg, border `var(--line2)`, ink text
- Lemon (`.lemon`): `background: var(--lemon)`, `color: #1C1B4B`
- Small: `min-height: 42px`, `padding: 0 16px`, `font-size: 14px`
- Disabled: `opacity: 0.5`

### Cards
- `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: 20px`, `box-shadow: var(--shadow)`

### Pills / Badges
- `font-size: 12.5px`, `font-weight: 700`, `padding: 4px 10px`, `border-radius: 999px`
- Variants: `.due` (lemon bg), `.ok` (green bg), `.bad` (red bg), `.info` (sky bg), `.warn` (amber: `background:#FFF3CD; color:#8F5F00`, 4.98:1). Use `.warn` for **Held** medications so they look different from **Refused** (`.bad`).

### Avatars
- `44x44px`, circle, `background: var(--sky)`, `color: var(--blue)`, `font-weight: 700`, `font-size: 15px`
- Small: `34x34px`, `font-size: 13px`

### Input Fields
- `border: 1px solid var(--line2)`, `border-radius: 14px`, `padding: 12px 14px`, `font-size: 16px`, `min-height: 50px`
- Focus: `border-color: var(--blue)`, `box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)`
- Textareas: `min-height: 96px`, `resize: vertical`

### Bottom Dock (Caregiver)
- Fixed to bottom, `width: min(420px, 100%)`
- "Talk to Lomi" button: full-width pill, blue bg, white text, `min-height: 56px`
- 4 tabs below: Today, Notes, Shifts, Me — `font-size: 12px`, icons + labels, `min-height: 52px`
- Active tab: `color: var(--blue)`
- Notification dot: `9px` red circle, positioned top-right of icon

### Bottom Sheet
- Scrim: `rgba(18,18,46,.45)` overlay
- Sheet: slides up from bottom, `border-radius: 26px 26px 0 0`, grab handle at top
- Desktop: centered modal with full `26px` radius
- Max height: `85vh`, scrollable

### Toast
- Fixed bottom center, `background: var(--ink)`, `color: var(--bg)`, pill-shaped, `font-weight: 600`
- Auto-dismiss after 2.8 seconds

## Lomi Visual Identity

### The Lemon Orb
- Size: `150px` (compose screen), `104px` (referenced in UX spec)
- Shape: circle with radial gradient — inner `var(--lemon-2)` at 58%, outer `var(--lemon)` at 35% opacity at 70%
- Recording animation: `breathe` keyframes — scale 1.0 → 1.05 over 2.4s, infinite
- Thinking state: 3-dot bounce animation (`.dots`)

### Lomi FAB (Bottom Nav)
- `66x66px` circle, `margin-top: -28px` (floats above nav)
- `background: var(--lemon)`, `border: 4px solid var(--bg)`
- Shadow: `0 10px 24px -10px rgba(140,100,0,.6)`

### Lomi in Messages
- Left-aligned, pale yellow background (`var(--lemon-2)`) with lemon icon

## Accessibility

- Focus visible: `outline: 3px solid var(--blue)`, `outline-offset: 2px`
- Screen reader class `.sr`: visually hidden but accessible
- All interactive elements: `min-height: 44px` (touch targets)
- `prefers-reduced-motion: reduce`: all animations disabled
- `-webkit-tap-highlight-color: transparent` on buttons

## Safe Area Handling

- Root padding for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`
- Bottom nav/dock: extra padding for `env(safe-area-inset-bottom)`
- Toast position accounts for safe area

## Implementation Note

When migrating to SvelteKit + Svelte 5:
1. Copy the CSS custom properties into a global `app.css` or `+layout.svelte` style block
2. Component-specific styles can be scoped, but tokens MUST remain global CSS custom properties
3. Do NOT replace with Tailwind utility classes — the specific values matter
4. The phone frame layout (`max-width: 420px` with desktop border/shadow) is part of the brand
5. Figtree font must be loaded — it's not a system font
6. The warm cream background (`#FFFCF3`) is intentional and distinctive — do not "fix" it to white
