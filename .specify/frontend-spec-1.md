# Guad Frontend Design Specification

---

## 1. Design Philosophy

Guad feels like opening a notebook made by someone who understands care work -- warm, unhurried, and quietly confident. The interface wraps clinical precision inside a visual language that says "this was built by people who respect what you do." Every surface uses soft cream tones, rounded edges, and generous spacing that let a DSP on hour fourteen of a double shift exhale instead of tense up. Typography pairs a serif warmth (Georgia headings) with a clean humanist sans-serif (Figtree body) -- professional without being sterile, friendly without being childish. Lomi, the AI assistant, lives in lemon yellow and appears as a breathing orb rather than a chatbot window, making artificial intelligence feel like a supportive colleague rather than an interrogation. The result is an app that a state auditor trusts because the documentation is rigorous, and a DSP trusts because the experience is humane.

### Design Principles

| # | Principle | What It Means in Practice |
|---|-----------|--------------------------|
| 1 | **Documentation in under 5 minutes** | Every design decision optimizes for fewer taps, more voice, smarter defaults. A DSP speaks naturally; Lomi drafts; the DSP reviews and signs. Three taps plus speaking replaces 30 minutes of form-filling. |
| 2 | **Offline-first, always** | The app works identically with zero connectivity. No "you are offline" banners, no disabled buttons, no spinners. Data lives on the device first and syncs silently. Your work is never lost. |
| 3 | **Warm, not clinical** | Cream backgrounds instead of sterile white. Rounded cards instead of sharp rectangles. Serif headings instead of all-caps labels. The warmth IS the professionalism -- it communicates "software made for people who care about people." |
| 4 | **Familiar to Therap users** | Every IDD term a DSP already knows -- T-Log, GER, ISP, MAR, prompt levels -- appears exactly where they expect it. Switching to Guad should feel like moving into a nicer apartment in the same neighborhood. |
| 5 | **Clinical precision where it matters** | Medication statuses use distinct colors (green Given, red Refused, amber Held). Vital signs flag at clinically meaningful thresholds. Prompt levels render as a tap-to-select gradient. The warmth never compromises the clinical rigor. |
| 6 | **Forgiving by default** | Auto-save every keystroke. Allow edits before lock. Show what is missing in plain language ("Add what time you gave Marcus his evening meds"), never show "Validation Error: field constraint not met." Interruption is the primary workflow -- design for it. |
| 7 | **Accessible on any device** | 44px minimum touch targets for cheap Android phones with imprecise digitizers. 14px minimum font size for dim group home lighting. Dark mode for overnight shifts. No animations that distract from clinical data entry. Every feature works with a screen reader. |

---

## 2. Design System

### 2.1 Color Palette

Core colors are defined as CSS custom properties on `:root` in `styles.css`. This section documents both the current CSS values and proposed additions for the SvelteKit rebuild. Tokens marked "(Rebuild target)" do not yet exist in `styles.css` and must be added during migration. Dark mode overrides are specified in Section 10.

#### 2.1.1 Background Tones

| Token | Hex | Role | Why |
|-------|-----|------|-----|
| `--bg` | `#FFFCF3` | Page background | Warm cream. Validated by Headway (#FFF8F0) and Jane (#FAF9F7). Differentiates from Therap's sterile white. Conveys approachability without sacrificing professionalism. |
| `--bg-sunken` | `#F7F5EE` | Recessed areas, input groups, sidebar background, disabled input backgrounds | Slightly darker cream for depth hierarchy. Used behind form fieldsets and settings screens. |
| `--card` | `#FFFFFF` | Card surfaces, modals, bottom sheets | Pure white for lifted content. Creates clear figure-ground separation against cream. |
| `--card-elevated` | `#FFFFFF` | Elevated cards, floating menus, popovers | Same white but paired with `--shadow-4`. Elevation, not color, signals the lift. |

#### 2.1.2 Primary Brand -- Indigo Blue

The primary brand blue `#2F3ED8` is a saturated indigo that reads as trustworthy-institutional. Blue is the universal trust color in healthcare (Epic, Cerner, Mayo Clinic all anchor on blue). This value matches `styles.css` and `design-system.md` exactly.

| Token | Hex | Contrast on White | Contrast on Cream | Role |
|-------|-----|-------------------|-------------------|------|
| `--blue-50` | `#EEF0FF` | -- | -- | Alias of `--sky`. Tint backgrounds, selected states, info pill bg. |
| `--blue-100` | `#E0E3FF` | -- | -- | Hover state on sky-colored elements. |
| `--blue-200` | `#C4CAFF` | -- | -- | Light accent borders, focus ring at low opacity. |
| `--blue-300` | `#9CA3D9` | -- | -- | Disabled primary buttons (solid, no opacity hack). |
| `--blue-400` | `#7080F0` | -- | -- | Dark-mode active/pressed state. |
| `--blue` / `--blue-500` | `#2F3ED8` | 7.50:1 (AAA) | 7.31:1 (AAA) | Primary actions, active nav, links. The anchor brand color. |
| `--blue-d` / `--blue-600` | `#2230B8` | 9.62:1 (AAA) | 9.38:1 (AAA) | Button hover, link hover. Matches `--blue-d` in `styles.css`. |
| `--blue-active` / `--blue-700` | `#232F73` | 12.17:1 (AAA) | 11.86:1 (AAA) | Button pressed/active state. (Rebuild target -- not in MVP) |
| `--blue-800` | `#1A2358` | -- | -- | Reserved for future deep-blue contexts. |
| `--blue-900` | `#121840` | -- | -- | Reserved. |
| `--blue-disabled` | `#9CA3D9` | -- | -- | Disabled primary buttons. (Rebuild target -- not in MVP. Current CSS uses `opacity: 0.5` on `.btn:disabled`.) |
| `--sky` | `#EEF0FF` | -- | -- | 8% blue tint. Selected backgrounds, tag backgrounds, info pill bg. |
| `--sky-hover` | `#E0E3FF` | -- | -- | Hover state on sky-colored elements. |

#### 2.1.3 Secondary/Accent -- Lemon

The lemon (`#FFD66B`) is Lomi's identity color and Guad's most distinctive visual asset. No IDD competitor uses it. Used sparingly (10-15% of visual surface area) on Lomi surfaces, progress indicators, and warm callouts. Never on clinical data surfaces.

| Token | Hex | Role |
|-------|-----|------|
| `--lemon` | `#FFD66B` | Lomi orb, FAB, shift offers, Lomi-related surfaces. The brand accent. |
| `--lemon-2` | `#FFF4CC` | Lomi callout background, warm highlight background, onboarding card background. |
| `--lemon-line` | `#F2D27A` | Lemon-tinted borders for callouts and Lomi cards. |
| `--lemon-muted` | `#E8C455` | Darkened lemon for text or icon fill on white backgrounds. |

> **Note:** The contrast ratio of `#FFD66B` with `#1C1B4B` text is 11.53:1, which passes WCAG AAA. The `.btn.lemon` class in `styles.css` is therefore accessible. However, lemon's primary role is Lomi's brand identity -- the Lomi orb, notification badges (`.pill.due`), and AI-generated content callouts. Avoid overusing lemon for general-purpose buttons to preserve its association with Lomi.

#### 2.1.4 Text Colors

Text hierarchy uses an indigo-tinted dark palette, which creates warmth compared to pure black/gray.

| Token | Hex | On `--bg` (#FFFCF3) | On `--card` (#FFF) | Role |
|-------|-----|----------------------|---------------------|------|
| `--ink` | `#1C1B4B` | 15.65:1 (AAA) | 16.06:1 (AAA) | Primary text, headings, body copy. Dark indigo-navy. |
| `--muted` | `#5A5880` | 6.51:1 (AA) | 6.68:1 (AA) | Secondary text, labels, subtitles, timestamps. Matches `styles.css`. |
| `--faint` | `#8B89AA` | 3.27:1 (**FAIL**) | 3.36:1 (**FAIL**) | Tertiary text, placeholders, metadata, helper text. **Current value fails WCAG AA for normal text.** (Rebuild fix: change to `#706E96` which achieves 4.70:1 on cream, passing AA.) |
| `--disabled-text` | `#A09EB8` | 2.53:1 (intentional fail) | 2.60:1 (intentional fail) | Disabled labels, inactive icons. Intentionally below AA to signal non-interactivity. Used only alongside enabled alternatives. |
| `--ink-inverse` | `#FFFFFF` | -- | -- | Text on dark backgrounds: primary buttons, toast text, filled badges. |

#### 2.1.5 Semantic Colors

##### Success

| Token | Hex | Role |
|-------|-----|------|
| `--ok` | `#1F7A4D` | Success text, checkmarks, "Given" med status, "Independent" prompt level. Clinical green. |
| `--ok-bg` | `#E6F4EC` | Success pill background, success callout background, given med badge background. |
| `--ok-border` | `#B4DFC8` | Success callout border, success input outline. |

Contrast: `--ok` on `--ok-bg` = 4.69:1 (AA pass).

##### Warning / Watch

| Token | Hex | Role |
|-------|-----|------|
| `--warn` | `#9A6700` | Warning text, "Held" med status, borderline vitals, watch-level clinical. Dark goldenrod. |
| `--warn-bg` | `#FFF3CD` | Warning pill background, held med badge background, borderline vital background. |
| `--warn-border` | `#F0D78A` | Warning callout border, warning input outline. |

Contrast: `--warn` on `--warn-bg` = 4.39:1 (**FAILS AA** for normal text). (Rebuild fix: darken `--warn` to `#8F5F00` to achieve 4.98:1, passing AA.)

> **Compliance note:** "Held" medications (clinical decision, amber) must be visually distinct from "Refused" medications (individual's right, red). State surveyors specifically check this distinction. The prototype currently uses `--bad` (red) for both -- this is a compliance gap that this spec fixes.

##### Error / Critical

| Token | Hex | Role |
|-------|-----|------|
| `--bad` | `#B42318` | Error text, "Refused" med status, critical vitals, high-severity incident. Warm brick red. |
| `--bad-bg` | `#FDECEA` | Error pill background, refused med badge background, critical vital background. |
| `--bad-border` | `#F5C6C0` | Error callout border, error input outline. |

Contrast: `--bad` on `--bad-bg` = 5.75:1 (AA pass).

##### Info

| Token | Hex | Role |
|-------|-----|------|
| `--info` | `#2D5FBF` | Info text, general informational badges, upcoming med status. Calm medium blue, distinct from primary action blue. |
| `--info-bg` | `#E8F0FE` | Info callout background, info pill background. |
| `--info-border` | `#B8D0F0` | Info callout border. |

#### 2.1.6 Clinical Colors

These extend beyond the binary ok/bad system to a multi-level clinical color system required for healthcare documentation. Each level must always be accompanied by a text label (never color-alone, per WCAG 1.4.1).

##### Vital Signs (4-level severity)

| Token | Hex | Background Token | Background Hex | Meaning |
|-------|-----|------------------|----------------|---------|
| `--vital-normal` | `#1F7A4D` | `--vital-normal-bg` | `#E6F4EC` | In normal range. Green = safe. |
| `--vital-watch` | `#9A6700` | `--vital-watch-bg` | `#FFF3CD` | Borderline reading, monitoring needed. Triggers soft validation. |
| `--vital-alert` | `#C4500A` | `--vital-alert-bg` | `#FFF0E5` | Out-of-range but not emergency. Burnt orange. Distinct from both watch-amber and critical-red. Example: temperature 100.4-102F. |
| `--vital-critical` | `#B42318` | `--vital-critical-bg` | `#FDECEA` | Emergency-level reading. Example: temperature >103F, pulse <40 or >130. |

##### Medication Status (MAR)

| Token | Hex | Background Token | Background Hex | Label | Pill Class |
|-------|-----|------------------|----------------|-------|------------|
| `--med-given` | `#1F7A4D` | `--med-given-bg` | `#E6F4EC` | Given | `.pill.ok` |
| `--med-refused` | `#B42318` | `--med-refused-bg` | `#FDECEA` | Refused | `.pill.bad` |
| `--med-held` | `#9A6700` | `--med-held-bg` | `#FFF3CD` | Held | `.pill.warn` |
| `--med-due` | `#2D5FBF` | `--med-due-bg` | `#E8F0FE` | Due | `.pill.info` |
| `--med-prn` | `#706E96` | `--med-prn-bg` | `#F0EFF5` | PRN | `.pill.mute` |

##### ISP Prompt Levels (gradient from independence to full support)

| Token | Hex | Prompt Level | Support Intensity |
|-------|-----|-------------|-------------------|
| `--prompt-independent` | `#1F7A4D` | Independent | None (goal achieved) |
| `--prompt-verbal` | `#2D5FBF` | Verbal prompt | Minimal |
| `--prompt-gestural` | `#5B6ECC` | Gestural prompt | Light |
| `--prompt-model` | `#7B6DB5` | Model | Moderate |
| `--prompt-partial` | `#9A6700` | Partial physical | Significant |
| `--prompt-full` | `#C4500A` | Full physical | Maximum |
| `--prompt-refused` | `#B42318` | Refused | Individual declined |

#### 2.1.7 Borders and Dividers

| Token | Hex | Role |
|-------|-----|------|
| `--line` | `#ECEDF6` | Subtle dividers inside cards, between list rows, section separators. Indigo-tinted gray (warmer than pure `#E5E5E5`). |
| `--line2` | `#DADDF3` | Stronger borders: input borders, card outlines, interactive element borders. |
| `--line-focus` | `color-mix(in srgb, var(--blue) 18%, transparent)` | Focus ring glow around inputs. Blue-tinted transparent for soft focus halos. |

#### 2.1.8 Scrim / Overlay

| Token | Value | Role |
|-------|-------|------|
| `--scrim` | `rgba(18, 18, 46, 0.45)` | Modal/sheet backdrop. Indigo-tinted dark overlay, warmer than pure black. Matches `styles.css` `.scrim` value. |

---

### 2.2 Typography

#### 2.2.1 Font Families

| Token | Stack | Role |
|-------|-------|------|
| `--serif` (spec alias: `--font-heading`) | `Georgia, 'Times New Roman', serif` | Serif for headings, greetings, brand wordmark, and long-form note reading. Creates warmth and personality that competitors lack. Georgia renders well on cheap Android screens. Matches `styles.css` `--serif` token. |
| `--sans` (spec alias: `--font-body`) | `Figtree, 'Segoe UI', system-ui, -apple-system, sans-serif` | Geometric humanist sans for all UI text, data entry, labels, buttons. Figtree is free (Google Fonts). Segoe UI / system-ui fallbacks ensure good rendering without font loading. Matches `styles.css` `--sans` token. |
| `--font-mono` | `'Fira Mono', 'Cascadia Mono', 'Courier New', monospace` | Clinical values where digit alignment matters: blood pressure (120/80), medication doses, temperatures, timestamps in audit trails. (Rebuild target -- not in MVP. Token does not exist in `styles.css` or `design-system.md` yet.) |

#### 2.2.2 Type Scale

Base unit: `1rem = 16px`. All sizes in `rem` for accessibility (respects browser font-size settings and zoom).

| Token | Size (rem) | px Equiv | Line-Height | Letter-Spacing | Default Weight | Use Case |
|-------|-----------|----------|-------------|----------------|---------------|----------|
| `--text-xs` | 0.75rem | 12px | 1.5 | 0.02em | 700 | Badge counts, mini pills, timestamps in dense contexts, chart axis labels |
| `--text-sm` | 0.8125rem | 13px | 1.5 | 0.01em | 600 | Metadata labels (`.lbl`), field hints, audit trail text, table headers |
| `--text-base-sm` | 0.875rem | 14px | 1.5 | 0 | 400 | Secondary body: row subtitles, callout text, muted descriptions, list metadata |
| `--text-base-md` | 0.9375rem | 15px | 1.5 | 0 | 400 | Compact UI contexts: callout body text, message bubbles, navigation labels, avatar initials. Between base-sm and base for density without sacrificing readability. |
| `--text-base` | 1rem | 16px | 1.5 | 0 | 400 | Primary body text, input values, button labels, note sections, form labels |
| `--text-md` | 1.0625rem | 17px | 1.5 | -0.005em | 600 | Card titles, appbar titles, person names in lists. *(Note: `.say textarea` uses 1.55 for compose context — intentional override for long-form writing.)* |
| `--text-lg` | 1.125rem | 18px | 1.45 | -0.01em | 400 | Clinical values (vitals, med doses). **Minimum size for safety-critical data.** |
| `--text-xl` | 1.25rem | 20px | 1.4 | -0.01em | 600 | Sheet titles, section headings, sub-page headings |
| `--text-2xl` | 1.5rem | 24px | 1.35 | -0.015em | 600 | Wordmark, important headings |
| `--text-3xl` | 1.875rem | 30px | 1.25 | -0.02em | 600 | Dashboard stat numbers, page greetings (serif) |
| `--text-4xl` | 2rem | 32px | 1.2 | -0.02em | 700 | Hero headings (setup page, desktop greeting) |
| `--text-5xl` | 2.375rem | 38px | 1.15 | -0.025em | 700 | Desktop-only hero greetings |

#### 2.2.3 Font Weight Usage Rules

| Weight | Name | Usage | Frequency |
|--------|------|-------|-----------|
| 400 | Regular | Body text, data values, note content, input text. The default reading weight. | ~60% of all text |
| 500 | Medium | Subtle emphasis only. Field labels in specific contexts. Use sparingly. | ~5% |
| 600 | Semi-Bold | Section headers, card titles, button labels, nav items, field labels (`.lbl`), pill text. The primary emphasis weight. | ~30% |
| 700 | Bold | The single most important element per screen only. Dashboard stat numbers, person names in card titles, greeting names. Overuse of 700 flattens hierarchy. | ~5% |

> **Rule:** Never use font weights below 400 (light/thin). Poor readability on cheap Android screens in low ambient light.

#### 2.2.4 Maximum Line Lengths

| Context | Max Width | Rationale |
|---------|-----------|-----------|
| Body text, note reading views, callouts, descriptions | `65ch` (~600px) | Prevents eye fatigue on wide screens. |
| Clinical data, structured records, data tables | `80ch` | Data tables and structured records can be wider. |

#### 2.2.5 Readability Rules

- Clinical values (vitals, doses, medication names) **must** be at minimum `--text-lg` (18px). Anything smaller is a patient safety risk.
- Field labels: minimum `--text-sm` (13px) at weight 600 in `--muted` color. Acceptable at this size because labels are short strings.
- Medication doses and vital signs: use `font-variant-numeric: tabular-nums` so digits align vertically in lists and columns.
- Serif heading class: `letter-spacing: -0.02em` (already in prototype).

#### 2.2.6 Visual Hierarchy Example

```
--text-5xl  700  serif   "Good morning, Aisha"          (desktop greeting)
--text-3xl  600  serif   "Good morning, Aisha"          (mobile greeting)
--text-3xl  600  sans    "12"                            (dashboard stat number)
--text-2xl  600  serif   "Guad"                          (wordmark)
--text-xl   600  sans    "Shift Note"                    (sheet title)
--text-md   600  sans    "Marcus Johnson"                (card title)
--text-base 400  sans    "Had a good morning at..."      (body text)
--text-base-sm 400 sans  "Submitted 2h ago"              (row subtitle)
--text-sm   600  sans    "ACTIVITIES"                    (section label)
--text-xs   700  sans    "3"                             (badge count)
```

---

### 2.3 Spacing

#### 2.3.1 Base Unit and Scale

Base unit: **4px**. The spacing scale (`--sp-*` tokens) uses multiples of 4px. Component padding values (6px, 10px, 14px, 18px) follow a **2px grid** rather than strict 4px multiples, allowing finer-grained control at small sizes while the larger spacing scale maintains 4px rhythm.

| Token | Value | px | Use Case |
|-------|-------|----|----------|
| `--sp-0` | 0 | 0 | No spacing |
| `--sp-1` | 0.25rem | 4px | Inline gaps (icon-to-text in tight pills, badge padding vertical) |
| `--sp-2` | 0.5rem | 8px | Dense padding (pill horizontal padding inner, mini component gaps, table cell minimum) |
| `--sp-3` | 0.75rem | 12px | Compact gaps (between items in dense lists, grid gaps in compact views, field-to-label gap) |
| `--sp-4` | 1rem | 16px | Standard padding (card padding mobile, screen horizontal padding, row padding, input padding) |
| `--sp-5` | 1.25rem | 20px | Generous padding (card padding desktop, sheet padding horizontal, section-to-header gap) |
| `--sp-6` | 1.5rem | 24px | Section padding (desktop main padding horizontal, major content insets) |
| `--sp-8` | 2rem | 32px | Large gaps (between major sections on desktop, card-to-card vertical spacing) |
| `--sp-10` | 2.5rem | 40px | Page padding (setup page padding, centered content insets) |
| `--sp-12` | 3rem | 48px | Major section breaks (first-run page top padding, hero content vertical spacing) |
| `--sp-16` | 4rem | 64px | Page-level spacing (bottom padding to clear fixed nav + safe area) |
| `--sp-20` | 5rem | 80px | Scroll safety (extra bottom padding to ensure last item is reachable above fixed elements) |

#### 2.3.2 Component Padding Presets

| Component | Padding | Min Height | Notes |
|-----------|---------|------------|-------|
| Card (mobile) | `16px 18px` | -- | Current prototype value. Keep. |
| Card (desktop) | `18px 20px` | -- | Slightly more generous for wider viewports. |
| Row / list item | `14px 16px` | 52px (with content) | Current prototype. Keep. |
| Button (primary) | `0 22px` | 52px | Excellent for DSP touch targets. |
| Button (small) | `0 16px` | 42px (current CSS) | (Rebuild fix: increase to 44px to meet WCAG 2.5.5 AAA.) |
| Input field | `12px 14px` | 50px | Current prototype. Keep. |
| Pill badge | `4px 10px` | -- | Current prototype. Keep. |
| Sheet | `10px 20px bottom` | -- | Current prototype. Keep. |
| Screen content (mobile) | `4px 16px` horizontal, `120px` bottom | -- | Current prototype. Keep. |
| Screen content (desktop) | `10px 24px` horizontal, `48px` bottom | -- | No fixed nav on desktop. |

#### 2.3.3 Section Gaps

| Context | Mobile | Desktop |
|---------|--------|---------|
| Between cards in a list | 10px | 14px (grid) |
| Between major sections on a screen | 18px | 20px (current CSS `.main` gap). *(Rebuild target: 24px to align with --sp-6.)* |
| Between screen and fixed bottom nav | 120px | 48px (no fixed nav) |
| Gap inside fieldsets | 14px | 14px |
| Gap inside card content stacks | 10-14px | 10-14px |

#### 2.3.4 Mobile vs Desktop Adjustments

| Property | Mobile (<900px) | Desktop (>=900px) |
|----------|-----------------|-------------------|
| Screen horizontal padding | 16px | 24px |
| Card border-radius | 18-20px | 18-20px (unchanged) |
| Touch target minimum | 44px | 44px (unchanged) |
| Stat grid columns | 2 | 4 |
| Person card grid | 1 column list | 2 column grid |
| Bottom safe area | `env(safe-area-inset-bottom)` | 0 |

---

### 2.4 Elevation and Borders

#### 2.4.1 Shadow Scale

Guad uses warm-tinted shadows (`rgba(28,27,75,...)` -- indigo-tinted) rather than pure black shadows, creating depth that feels warmer.

| Level | Token | CSS Value | Use Case |
|-------|-------|-----------|----------|
| 0 | `--shadow-0` | `none` | Flat elements, items on same-color surfaces, all dark mode elements |
| 1 | `--shadow-1` | `0 1px 2px rgba(28,27,75,0.05), 0 4px 12px -8px rgba(28,27,75,0.15)` | Subtle lift: client cards at rest, stat cards, nav items at rest |
| 2 | `--shadow-2` | `0 1px 2px rgba(28,27,75,0.05), 0 8px 24px -16px rgba(28,27,75,0.25)` | Standard lift: cards (default), active nav items, segmented controls |
| 3 | `--shadow-3` | `0 4px 12px rgba(28,27,75,0.08), 0 16px 40px -16px rgba(28,27,75,0.30)` | Elevated: bottom sheets, dropdown menus, floating action buttons |
| 4 | `--shadow-4` | `0 8px 24px rgba(28,27,75,0.10), 0 30px 80px -40px rgba(28,27,75,0.35)` | Maximum: phone-frame container on desktop, modals, popovers |

> **Lomi FAB shadow:** The Lomi FAB uses a custom lemon-tinted shadow: `0 10px 24px -10px rgba(140,100,0,0.6)`. This is the only element that deviates from the standard shadow scale.

#### 2.4.2 Border vs Shadow Philosophy

| Context | Primary Depth Indicator | Secondary Depth Indicator | Rationale |
|---------|------------------------|--------------------------|-----------|
| **Mobile** | Borders (`1px solid var(--line)`) | Shadows | Cheap Android screens often have low contrast and may not render subtle shadows well. |
| **Desktop** | Shadows | Borders (optional structural definition) | Larger screens at closer viewing distance render shadows cleanly. |
| **Dark mode** | Borders (`1px solid var(--line)`) + surface color | None (shadows invisible) | Shadows are invisible against dark backgrounds. Rely on borders and surface color differentiation. |

> **Rule:** Every card that uses a shadow also has a border. This ensures depth is perceivable even when shadows fail to render.

#### 2.4.3 Border Colors and Widths

| Token | Hex | Width | Use Case |
|-------|-----|-------|----------|
| `--line` | `#ECEDF6` | 1px | Subtle dividers between list rows, section separators, card borders at rest |
| `--line2` | `#DADDF3` | 1px | Input borders, card outlines for interactive elements, stronger structural borders |
| Focus ring | `var(--blue)` | 3px | `outline: 3px solid var(--blue); outline-offset: 2px` on `:focus-visible` |
| Error border | `var(--bad)` | 1px | Input border in error state + `box-shadow: 0 0 0 3px color-mix(in srgb, var(--bad) 15%, transparent)` |
| Warning border | `var(--warn)` | 1px | Input border in warning state (clinical soft validation) |

#### 2.4.4 Hover Elevation Behavior

| Element | Hover Effect |
|---------|-------------|
| Interactive cards (`.cv-row`, `.clientcard`) | `border-color` transitions to `color-mix(in srgb, var(--blue) 40%, transparent)`, `transform: translateY(-1px)`, shadow increases one level |
| Non-interactive cards | No hover change |
| Buttons | Background color darkens (see Button component tokens) |
| List rows (`button.row`) | Background changes to `color-mix(in srgb, var(--sky) 55%, transparent)` |

---

### 2.5 Border Radius

#### 2.5.1 Radius Scale

Guad uses generous rounding as a core brand element. This visual softness is a competitive differentiator against Therap's sharp, boxy UI.

| Token | Value | Use Case |
|-------|-------|----------|
| `--radius-none` | `0` | Table cells, inline code, elements that must tile flush |
| `--radius-sm` | `4px` | Inline marks (vague language highlights), code blocks, tiny labels |
| `--radius-md` | `8px` | Trial chips, chart bars (top corners), note-section textareas. (Note: tooltips and toasts use `999px` / pill-shaped per `design-system.md`, not `--radius-md`.) |
| `--radius-lg` | `12px` | Sidebar nav buttons, schedule slots, small containers. (Note: segment control inner buttons use `11px` as a special case matching `styles.css`, not the `12px` token default.) |
| `--radius-xl` | `14px` | Form inputs, checkboxes/check rows, text inputs, segment control outer |
| `--radius-2xl` | `18px` | Clinical data cards (`.cv-card`), client cards. Slightly smaller than navigation cards to subtly signal "this is a record, not a button." |
| `--radius-3xl` | `20px` | Primary cards (`.card`), navigation containers, list cards. The signature Guad warmth radius. |
| `--radius-4xl` | `26px` | Bottom sheets, modal dialogs. Maximum structural rounding. |
| `--radius-full` | `999px` | Pills, badges, buttons, avatars, progress bars, FAB, toggle controls, pill tabs. Fully rounded = interactive element. |

#### 2.5.2 Usage Rules by Component Type

| Surface Type | Radius | Rationale |
|-------------|--------|-----------|
| Clinical data cards (MAR records, vital signs, incident reports, ISP goal entries) | `--radius-2xl` (18px) | Slightly smaller radius signals "professional record" vs "friendly surface." 20px+ on clinical data reads consumer-grade to auditors. |
| Navigation and brand surfaces (main cards, Lomi cards, nav containers, setup cards) | `--radius-3xl` (20px) | Maximum warmth for non-clinical surfaces. |
| Interactive pill-shaped elements (buttons, pills, badges, avatars, segmented controls) | `--radius-full` (999px) | Fully rounded = tappable/interactive. Convention already established in prototype. |
| Form inputs, check rows | `--radius-xl` (14px) | The input-family radius. Consistent across all form elements. |
| Callouts (`.callout.*`) | `--radius-2xl` (18px) | Matches card-level rounding per `styles.css` and `design-system.md`. |
| Bottom sheets, modals | `--radius-4xl` (26px) | Maximum structural rounding for overlay containers. |

> **Nested rounding rule:** Inner elements should have a radius that is the outer radius minus the padding. Example: a card with 18px radius and 16px padding should have inner elements at approximately 8px radius.

---

### 2.6 Motion and Animation

#### 2.6.1 Duration Scale

| Token | Value | Use Case |
|-------|-------|----------|
| `--dur-instant` | `0ms` | State changes that should feel immediate: checkbox toggle, radio select |
| `--dur-fast` | `100ms` | Button press feedback (scale down), pill color change, input focus border |
| `--dur-normal` | `150ms` | Card hover states, list item hover, border color transitions. The default UI transition. |
| `--dur-moderate` | `250ms` | Sheet slide-up, toast entrance/exit, accordion expand/collapse |
| `--dur-slow` | `400ms` | Progress bar fill, skeleton shimmer cycle, complex layout shifts |
| `--dur-lomi` | `2400ms` | Lomi orb breathing animation cycle. Keep from prototype. |

#### 2.6.2 Easing Curves

| Token | CSS Value | Use Case |
|-------|-----------|----------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements entering: sheets sliding up, toasts appearing, content entering. Starts fast, decelerates. |
| `--ease-in` | `cubic-bezier(0.5, 0, 1, 0.5)` | Elements leaving: toasts dismissing, sheets sliding down. Starts slow, accelerates. |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.55, 1)` | State transitions in place: color changes, shadow changes, width transitions. Symmetric. |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Celebratory/completion moments: checkmark on note sign, Lomi celebration bounce. Slight overshoot. |

#### 2.6.3 What Animates vs Instant

##### Animate (CSS transitions)

| # | Interaction | Properties | Duration | Easing | Selectors |
|---|------------|------------|----------|--------|-----------|
| 1 | Button press | `transform: scale(0.97)` on `:active` | `--dur-fast` | `--ease-in-out` | `.btn`, `.cv-row`, `.iconbtn`, `.choice button`, `.levels button` |
| 2 | Card/row hover | `border-color`, `translateY(-1px)`, shadow increase | `--dur-normal` | `--ease-out` | `.cv-row:hover`, `.clientcard:hover` |
| 3 | Sheet entrance | `transform: translateY(100%) -> translateY(0)` | `--dur-moderate` | `--ease-out` | `.sheet` (scrim fades `opacity: 0 -> 1` simultaneously) |
| 4 | Toast entrance/exit | `translateY(20px) -> translateY(0)` + `opacity: 0 -> 1` | `--dur-moderate` | `--ease-out` | `.toast` (auto-dismiss after 2800ms) |
| 5 | Progress bar fill | `width` | `--dur-slow` | `--ease-out` | `.bar > i`, `.cv-bar > i` |
| 6 | Input focus | `border-color` + `box-shadow` | `--dur-fast` | `--ease-in-out` | `.input:focus` |
| 7 | Pill/badge color changes | `background-color` + `color` | `--dur-fast` | `--ease-in-out` | `.pill`, `.mini` |
| 8 | Completion checkmark | `transform: scale(0) -> scale(1)` + `navigator.vibrate(10)` haptic | `--dur-moderate` | `--ease-spring` | Note sign confirmation |

##### Do NOT Animate

- Page/route transitions (requires SvelteKit router transitions -- implement in SvelteKit 2 rebuild)
- List item enter/exit (requires DOM diffing -- implement in rebuild)
- Content loading (use skeleton screens, not animated content)
- Any state change on clinical data entry screens (MAR, vitals, incident reports) -- animations distract from precision tasks

#### 2.6.4 `prefers-reduced-motion` Behavior

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This must cover ALL motion, not just the Lomi orb and loading dots. The prototype's current implementation (line 154) is partial and must be expanded.

---

### 2.7 Component Tokens

#### 2.7.1 Buttons

Five button variants, each with four states. One primary button visible per view maximum.

##### Primary (`.btn`)

| State | Background | Text | Border | Transform |
|-------|-----------|------|--------|-----------|
| Default | `var(--blue)` `#2F3ED8` | `#FFFFFF` | none | -- |
| Hover | `var(--blue-d)` `#2230B8` | `#FFFFFF` | none | -- |
| Active | `var(--blue-active)` `#232F73` | `#FFFFFF` | none | `scale(0.97)` (Rebuild target) |
| Disabled | `opacity: 0.5` | `#FFFFFF` | none | -- `cursor: not-allowed`. Current CSS uses `opacity: 0.5` on `.btn:disabled`. (Rebuild proposal: replace with solid `var(--blue-disabled)` `#9CA3D9` for better contrast consistency.) |
| Loading | `var(--blue)` `#2F3ED8` | Spinner (white, 20px) | none | -- `pointer-events: none` |

Base: `min-height: 52px`, `padding: 0 22px`, `border-radius: 999px`, `font-weight: 600`, `font-size: 16px`.

##### Secondary (`.btn.sec`)

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | `var(--card)` `#FFFFFF` | `var(--ink)` `#1C1B4B` | `1px solid var(--line2)` `#DADDF3` |
| Hover | `var(--card)` | `var(--blue)` `#2F3ED8` | `1px solid var(--blue)` |
| Active | `var(--sky)` `#EEF0FF` | `var(--blue)` | `1px solid var(--blue)` + `scale(0.97)` |
| Disabled | `var(--card)` | `var(--disabled-text)` `#A09EB8` | `1px solid var(--line)` `#ECEDF6` |

##### Ghost / Text Button (`.textbtn`)

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | `transparent` | `var(--blue)` `#2F3ED8` | none |
| Hover | `transparent` | `var(--blue)` + `text-decoration: underline` | none |
| Active | `transparent` | `var(--blue-active)` `#232F73` | none |
| Disabled | `transparent` | `var(--disabled-text)` `#A09EB8` | none |

Base: `font-weight: 600`, `font-size: 14px`, `padding: 10px 4px`, `min-height: 44px`.

##### Danger (`.btn.danger`)

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | `var(--bad)` `#B42318` | `#FFFFFF` | none |
| Hover | `#9A1E15` | `#FFFFFF` | none |
| Active | `#801810` | `#FFFFFF` | none + `scale(0.97)` |
| Disabled | `#D4918C` | `#FFFFFF` | none + `cursor: not-allowed` |

##### Success (`.btn.ok`)

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | `var(--ok)` `#1F7A4D` | `#FFFFFF` | none |
| Hover | `#15633E` | `#FFFFFF` | none |
| Active | `#104D30` | `#FFFFFF` | none + `scale(0.97)` |
| Disabled | `#8CC4A6` | `#FFFFFF` | none + `cursor: not-allowed` |

> `.btn.danger` and `.btn.ok` are rebuild targets -- not in current MVP `styles.css`.

##### Size Variants

| Size | Class | Min Height | Padding | Font Size |
|------|-------|------------|---------|-----------|
| Default | `.btn` | 52px | `0 22px` | 16px |
| Small | `.btn.sm` | 42px (current CSS) | `0 16px` | 14px | (Rebuild fix: increase to 44px for WCAG 2.5.5 AAA) |
| Icon-only | `.iconbtn` | 44px (44x44px) | 0 | -- (icon only) |

#### 2.7.2 Inputs

Five input states. All inputs use: `border-radius: var(--radius-xl)` (14px), `padding: 12px 14px`, `min-height: 50px`, `font-size: 16px`.

| State | Background | Text | Border | Box-Shadow | Helper Text |
|-------|-----------|------|--------|------------|-------------|
| Default | `var(--card)` `#FFFFFF` | `var(--ink)` `#1C1B4B` | `1px solid var(--line2)` `#DADDF3` | none | -- |
| Focus | `var(--card)` | `var(--ink)` | `1px solid var(--blue)` `#2F3ED8` | `0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)` | -- |
| Error | `var(--card)` | `var(--ink)` | `1px solid var(--bad)` `#B42318` | `0 0 0 3px color-mix(in srgb, var(--bad) 15%, transparent)` | `color: var(--bad)`, prefixed with warning icon, linked via `aria-describedby` |
| Disabled | `var(--bg-sunken)` `#F7F5EE` | `var(--disabled-text)` `#A09EB8` | `1px solid var(--line)` `#ECEDF6` | none | -- `cursor: not-allowed` |
| Read-only | `var(--bg-sunken)` `#F7F5EE` | `var(--ink)` `#1C1B4B` | `1px solid var(--line)` `#ECEDF6` | none | -- `cursor: default` |

Placeholder text: `color: var(--faint)` (`#8B89AA`). (Rebuild fix: change to `#706E96` for WCAG AA compliance.)

**Clinical value inputs:** Add `font-variant-numeric: tabular-nums` and increase to `font-size: var(--text-lg)` (18px). Units displayed as persistent suffix via absolute-positioned `<em>` element.

**Labels:** Always above the input, never placeholder-only. `font-size: var(--text-sm)` (13px), `font-weight: 600`, `color: var(--muted)`. Required fields marked with "(required)" text suffix, not asterisk-only.

**Warning state (clinical soft validation):**

| Property | Value |
|----------|-------|
| Border | `1px solid var(--warn)` `#9A6700` |
| Box-shadow | `0 0 0 3px color-mix(in srgb, var(--warn) 15%, transparent)` |
| Helper text | e.g., "Are you sure? Temperature 103.2F is above the limit." |
| Behavior | Does not block submission (soft limit), but logs acknowledgment |

#### 2.7.3 Cards

Four card variants.

| Variant | Class | Background | Border | Radius | Shadow | Padding |
|---------|-------|-----------|--------|--------|--------|---------|
| Standard | `.card` | `var(--card)` | `1px solid var(--line)` | `--radius-3xl` (20px) | `--shadow-2` | `16px 18px` |
| Clinical | `.cv-card` | `var(--card)` | `1px solid var(--line2)` | `--radius-2xl` (18px) | `--shadow-1` | `16px 18px` |
| Interactive | `.cv-row`, `.clientcard` | `var(--card)` | `1px solid var(--line)` | `--radius-2xl` (18px) | `--shadow-2` | `14px 16px` to `16px 18px` |
| Accent (Lomi) | `.lomi-card` | `var(--lemon-2)` | `1px solid var(--lemon-line)` | `--radius-3xl` (20px) | `--shadow-1` | `18px 20px` |
| Accent (Info) | `.callout.info` | `var(--sky)` | `1px solid color-mix(in srgb, var(--blue) 25%, transparent)` | `--radius-2xl` (18px) | none | `14px 16px` |
| Accent (Warning/Lomi) | `.callout.warn` | `var(--lemon-2)` `#FFF4CC` | `1px solid var(--lemon-line)` `#F2D27A` | `--radius-2xl` (18px) | none | `14px 16px` | Note: CSS `.callout.warn` uses lemon colors for Lomi/warm callouts, not `--warn-bg`. A separate `.callout.clinical-warn` using `--warn-bg`/`--warn-border` is a rebuild proposal. |
| Accent (Error) | `.callout.bad` | `var(--bad-bg)` | `1px solid var(--bad-border)` | `--radius-2xl` (18px) | none | `14px 16px` |

**Interactive card states:**

| State | Border | Transform | Shadow |
|-------|--------|-----------|--------|
| Default | `1px solid var(--line)` | none | `--shadow-2` |
| Hover | `1px solid color-mix(in srgb, var(--blue) 40%, transparent)` | `translateY(-1px)` | `--shadow-3` |
| Active | `1px solid var(--blue)` | `scale(0.99)` | `--shadow-1` |
| Focus-visible | `outline: 3px solid var(--blue); outline-offset: 2px` | none | `--shadow-2` |

**Stat card (`.stat`):** Standard card properties plus:

| Property | Value |
|----------|-------|
| Number | `font-size: var(--text-3xl)` (30px), `font-weight: 600`, `line-height: 1.1` |
| Label | `font-size: var(--text-base-sm)` (14px), `color: var(--muted)` |
| Trend delta | `font-size: 13px`, `font-weight: 600`, `color: var(--ok)` for positive / `color: var(--bad)` for negative |

#### 2.7.4 Badges / Pills

Six badge variants. All pills use: `font-size: 12.5px`, `font-weight: 700`, `padding: 4px 10px`, `border-radius: 999px`, `white-space: nowrap`.

| Variant | Class | Background | Text Color | Border | Use Cases |
|---------|-------|-----------|------------|--------|-----------|
| Due / Action | `.pill.due` | `var(--lemon)` `#FFD66B` | `var(--ink)` `#1C1B4B` | none | "To do", shift offers pending, items awaiting action |
| Success | `.pill.ok` | `var(--ok-bg)` `#E6F4EC` | `var(--ok)` `#1F7A4D` | none | "Approved", "Given", "Completed", "Independent", "Covered" |
| Error | `.pill.bad` | `var(--bad-bg)` `#FDECEA` | `var(--bad)` `#B42318` | none | "Refused", "High severity", "Returned", "Critical" |
| Warning | `.pill.warn` | `var(--warn-bg)` `#FFF3CD` | `var(--warn)` `#9A6700` | none | "Held" medication, borderline vital, "Needs review". (Rebuild target -- `.pill.warn` class does not exist in current `styles.css`. Must add: `.pill.warn{background:var(--warn-bg);color:var(--warn)}`.) |
| Info | `.pill.info` | `var(--sky)` `#EEF0FF` | `var(--blue)` `#2F3ED8` | none | "Submitted", "In progress", "Scheduled", "Due" medication |
| Muted | `.pill.mute` | `transparent` | `var(--faint)` `#8B89AA` | `1px solid var(--line2)` | Past/archived, inactive, "PRN" medication, "Not attempted" |

**Standardized semantic mapping across all views:**

| Status | Pill Variant | Label Text |
|--------|-------------|------------|
| Not started | `.pill.due` | To do |
| In progress / Draft | `.pill.info` | Draft |
| Submitted (awaiting review) | `.pill.info` | Submitted |
| Approved / Signed | `.pill.ok` | Approved |
| Returned (needs fixes) | `.pill.bad` | Returned |
| Medication Given | `.pill.ok` | Given |
| Medication Refused | `.pill.bad` | Refused |
| Medication Held | `.pill.warn` | Held |
| Medication Due | `.pill.info` | Due |
| Medication PRN | `.pill.mute` | PRN |
| Shift Covered | `.pill.ok` | Covered |
| Shift Open | `.pill.due` | Open |
| Shift Filling | `.pill.due` | Filling |
| Incident Open | `.pill.bad` | Open |
| Incident Resolved | `.pill.ok` | Resolved |
| Vital Normal | `.pill.ok` | Normal |
| Vital Borderline | `.pill.warn` | Watch |
| Vital Critical | `.pill.bad` | Critical |

---

> **Section numbering note:** Sections 3-8 are defined in companion files: `frontend-spec-2.md` covers Sections 3 (Caregiver Screens), 6 (AI/Lomi UX), and 8 (Offline & PWA). `frontend-spec-3.md` covers Sections 4 (Supervisor Dashboard), 5 (Component Library), and 7 (Navigation & IA). This file continues with Sections 9 and 10.

## 9. Accessibility

### 9.1 WCAG 2.1 AA Compliance Checklist

| # | Criterion | WCAG SC | Status | Implementation |
|---|-----------|---------|--------|---------------|
| 1 | Text contrast minimum 4.5:1 for normal text | 1.4.3 | **Partial** | `--ink` (15.65:1) and `--muted` (6.51:1) pass on `--bg`. **`--faint` (`#8B89AA`) currently fails at 3.27:1 on `--bg`.** Rebuild fix: change `--faint` to `#706E96` (4.70:1, PASS). Also, `--warn` on `--warn-bg` (4.39:1) and `--vital-alert` on `--vital-alert-bg` (4.19:1) both fail -- see rebuild fixes in Section 2.1.5. |
| 2 | Large text (18px+ or 14px+ bold) contrast minimum 3:1 | 1.4.3 | Pass | All semantic colors pass 3:1 on their background tints at large text sizes. |
| 3 | Non-text contrast minimum 3:1 for UI components | 1.4.11 | Pass | Borders, icons, focus rings all meet 3:1. `--line2` (`#DADDF3`) on `--card` = 1.4:1 -- acceptable because borders are decorative, not the sole indicator. Interactive borders use `--blue` on hover. |
| 4 | Color is not the sole means of conveying information | 1.4.1 | Pass | All clinical colors are accompanied by text labels. Pill badges always include text. Prompt levels show text alongside color. Medication status uses text + color + icon. |
| 5 | Touch target minimum 44x44px | 2.5.5 (AAA) | Requires fixes | `.levels button` must increase from 36px to 44px min-height. `.trial button` must increase from 28px to 44px hit area (visual can stay 28px with padding extending tap zone). `.btn.sm` must increase from 42px to 44px. `.choice button` must increase from 42px to 44px. (All are rebuild fixes.) |
| 6 | Focus visible on all interactive elements | 2.4.7 | Pass | `:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 10px; }` applied globally. |
| 7 | Keyboard navigable -- all functions available via keyboard | 2.1.1 | Pass | All interactive elements are native `<button>` or `<a>` elements. No `<div onclick>`. Tab order follows visual order. |
| 8 | Meaningful sequence -- reading order matches visual order | 1.3.2 | Pass | DOM order matches visual layout. Flexbox `order` not used to reorder content. |
| 9 | Labels for all form inputs | 1.3.1, 4.1.2 | Pass | All inputs have visible `<label>` elements above them. Labels use `for` attribute or wrap the input. No placeholder-only inputs. |
| 10 | Error identification with suggestions | 3.3.1, 3.3.3 | Pass | Error messages in plain language below the field, linked via `aria-describedby`. Error border + red halo provides visual indicator. |
| 11 | Page titles describe content | 2.4.2 | Pass | Each screen sets `document.title` to describe current view (e.g., "Marcus -- Shift Note -- Guad"). |
| 12 | Headings and labels describe topic or purpose | 2.4.6 | Pass | Every section uses semantic heading levels (h1 for page, h2 for sections, h3 for subsections). |
| 13 | Consistent navigation across pages | 3.2.3 | Pass | Bottom tabs (mobile) and sidebar (desktop) remain in the same position on every screen. |
| 14 | Text resizable to 200% without loss of content | 1.4.4 | Pass | All sizes in `rem`. Layouts use flexbox/grid that reflow. No fixed-width containers that clip on zoom. |
| 15 | Content reflows at 320px viewport width | 1.4.10 | Pass | Single-column layout at narrow widths. No horizontal scrolling for main content (schedule grid is an exception with horizontal scroll container). |
| 16 | Status messages announced to assistive technology | 4.1.3 | Requires implementation | Toast notifications must use `role="status"` and `aria-live="polite"`. Form validation errors use `aria-live="assertive"`. Auto-save indicator uses `aria-live="polite"`. |
| 17 | Motion can be disabled | 2.3.3 | Pass | `prefers-reduced-motion: reduce` media query disables all animations and transitions. |
| 18 | No content flashes more than 3 times per second | 2.3.1 | Pass | No flashing content. Loading dots use opacity fade, not flash. |

### 9.2 Color Contrast Verification Table

Every text-on-background combination in the palette, verified against WCAG 2.1 AA requirements. All ratios computed using the standard WCAG relative luminance formula: convert sRGB to linear RGB, compute `L = 0.2126R + 0.7152G + 0.0722B`, ratio = `(L_lighter + 0.05) / (L_darker + 0.05)`. Rounded to 2 decimal places.

#### Primary Text Combinations

| Text Color | Token | Background | Token | Ratio | Normal Text (4.5:1) | Large Text (3:1) |
|-----------|-------|-----------|-------|-------|---------------------|------------------|
| `#1C1B4B` | `--ink` | `#FFFCF3` | `--bg` | 15.65:1 | AAA Pass | AAA Pass |
| `#1C1B4B` | `--ink` | `#FFFFFF` | `--card` | 16.06:1 | AAA Pass | AAA Pass |
| `#1C1B4B` | `--ink` | `#F7F5EE` | `--bg-sunken` | 14.72:1 | AAA Pass | AAA Pass |
| `#1C1B4B` | `--ink` | `#EEF0FF` | `--sky` | 14.18:1 | AAA Pass | AAA Pass |
| `#5A5880` | `--muted` | `#FFFCF3` | `--bg` | 6.51:1 | AA Pass | AAA Pass |
| `#5A5880` | `--muted` | `#FFFFFF` | `--card` | 6.68:1 | AA Pass | AAA Pass |
| `#8B89AA` | `--faint` | `#FFFCF3` | `--bg` | 3.27:1 | **FAIL** | AA Pass |
| `#8B89AA` | `--faint` | `#FFFFFF` | `--card` | 3.36:1 | **FAIL** | AA Pass |
| `#A09EB8` | `--disabled-text` | `#FFFCF3` | `--bg` | 2.53:1 | FAIL (intentional) | FAIL (intentional) |
| `#FFFFFF` | `--ink-inverse` | `#2F3ED8` | `--blue` | 7.50:1 | AAA Pass | AAA Pass |
| `#FFFFFF` | `--ink-inverse` | `#2230B8` | `--blue-d` | 9.62:1 | AAA Pass | AAA Pass |
| `#FFFFFF` | `--ink-inverse` | `#B42318` | `--bad` | 6.57:1 | AA Pass | AAA Pass |
| `#FFFFFF` | `--ink-inverse` | `#1F7A4D` | `--ok` | 5.32:1 | AA Pass | AAA Pass |

> **`--faint` WCAG failure:** The current `--faint` value (`#8B89AA`) fails WCAG AA for normal text on both `--bg` (3.27:1) and `--card` (3.36:1). It passes for large text only (18px+ regular or 14px+ bold). Rebuild fix: change to `#706E96` which achieves 4.70:1 on `--bg` and 4.82:1 on `--card`, passing AA for all text sizes.

#### Semantic Color Combinations

| Text Color | Token | Background | Token | Ratio | Normal Text (4.5:1) | Large Text (3:1) |
|-----------|-------|-----------|-------|-------|---------------------|------------------|
| `#1F7A4D` | `--ok` | `#E6F4EC` | `--ok-bg` | 4.69:1 | AA Pass | AAA Pass |
| `#1F7A4D` | `--ok` | `#FFFFFF` | `--card` | 5.32:1 | AA Pass | AAA Pass |
| `#9A6700` | `--warn` | `#FFF3CD` | `--warn-bg` | 4.39:1 | **FAIL** (Rebuild fix: darken to `#8F5F00` for 4.98:1) | AA Pass |
| `#9A6700` | `--warn` | `#FFFFFF` | `--card` | 4.87:1 | AA Pass | AAA Pass |
| `#B42318` | `--bad` | `#FDECEA` | `--bad-bg` | 5.75:1 | AA Pass | AAA Pass |
| `#B42318` | `--bad` | `#FFFFFF` | `--card` | 6.57:1 | AA Pass | AAA Pass |
| `#2D5FBF` | `--info` | `#E8F0FE` | `--info-bg` | 5.23:1 | AA Pass | AAA Pass |
| `#2D5FBF` | `--info` | `#FFFFFF` | `--card` | 6.00:1 | AA Pass | AAA Pass |
| `#2F3ED8` | `--blue` | `#EEF0FF` | `--sky` | 6.62:1 | AA Pass | AAA Pass |
| `#2F3ED8` | `--blue` | `#FFFCF3` | `--bg` | 7.31:1 | AAA Pass | AAA Pass |
| `#C4500A` | `--vital-alert` | `#FFF0E5` | `--vital-alert-bg` | 4.19:1 | **FAIL** (Rebuild fix: darken to `#B84A08` for 4.69:1) | AA Pass |
| `#C4500A` | `--vital-alert` | `#FFFFFF` | `--card` | 4.67:1 | AA Pass | AAA Pass |

> **Two semantic pairs fail WCAG AA for normal text:**
> 1. `--warn` (`#9A6700`) on `--warn-bg` (`#FFF3CD`): 4.39:1. Fix: darken `--warn` to `#8F5F00` (4.98:1). These tokens are rebuild additions (not in current `styles.css`).
> 2. `--vital-alert` (`#C4500A`) on `--vital-alert-bg` (`#FFF0E5`): 4.19:1. Fix: darken `--vital-alert` to `#B84A08` (4.69:1). Used for out-of-range vital sign readings -- patient-safety-critical.

#### Lemon Contrast

| Text Color | Background | Ratio | Result | Notes |
|-----------|-----------|-------|--------|-------|
| `#1C1B4B` (ink) | `#FFD66B` (lemon) | 11.53:1 | AAA Pass | Lemon with ink text is fully accessible. The `.btn.lemon` class in `styles.css` passes WCAG AAA. |
| `#1C1B4B` (ink) | `#FFF4CC` (lemon-2) | 14.58:1 | AAA Pass | Safe for text on lemon-tinted backgrounds. |

### 9.3 Touch Target Specifications

| Minimum | Recommended | Use Case |
|---------|-------------|----------|
| 44 x 44px | 48 x 48px | All interactive elements: buttons, links, icons, form controls |
| 52px height | 52px height | Primary action buttons (`.btn`) |
| 44px height | 48px height | Secondary buttons, nav items, list rows |

**Current violations requiring fixes:**

| Element | Current Size | Required Size | Fix |
|---------|-------------|---------------|-----|
| `.levels button` | 36px min-height | 44px min-height | Increase `min-height` to 44px, `padding` to `8px 14px` |
| `.trial button` | 28 x 28px | 44 x 44px hit area | Keep 28px visual size, extend tap zone with padding to 44px total |
| `.btn.sm` | 42px min-height | 44px min-height | Increase `min-height` to 44px (rebuild fix) |
| `.choice button` | 42px min-height | 44px min-height | Increase `min-height` to 44px (rebuild fix) |
| `.avatar.sm` | 34 x 34px | 44 x 44px (when interactive) | When used as a tappable element, wrap in a 44px container |

### 9.4 Focus Indicator Style

```css
:focus-visible {
  outline: 3px solid var(--blue);
  outline-offset: 2px;
  border-radius: 10px;
}
```

| Property | Value | Rationale |
|----------|-------|-----------|
| Style | Solid outline | Visible on all backgrounds (cream, white, blue, lemon). |
| Color | `var(--blue)` (`#2F3ED8`) | Meets 3:1 contrast against `--bg` (7.31:1) and `--card` (7.50:1). |
| Width | 3px | Visible at all zoom levels, including 200%. |
| Offset | 2px | Prevents overlap with element borders, preserves visual separation. |
| Border-radius | 10px | Matches Guad's rounded aesthetic. Softened corners on focus rings. |

**Dark mode focus:** `var(--blue)` maps to `#8590FF` in dark mode (current MVP) or `#8A96FF` (proposed warm-neutral palette), both maintaining 3:1+ contrast against dark surfaces.

### 9.5 Focus Management Patterns

| Pattern | Behavior |
|---------|----------|
| **Bottom sheet open** | Focus moves to the first focusable element inside the sheet. Focus is trapped within the sheet (Tab cycles through sheet elements only). Escape key closes the sheet and returns focus to the trigger element. |
| **Bottom sheet close** | Focus returns to the element that triggered the sheet. |
| **Toast notification** | Toast has `role="status"` and `aria-live="polite"`. Does not steal focus. Automatically dismissed after 2800ms. |
| **Tab navigation (`.ptabs`, `.seg`)** | Uses `role="tablist"` with `role="tab"` children. Arrow keys move between tabs. Active tab has `aria-selected="true"`. Tab panels have `role="tabpanel"` with `aria-labelledby` pointing to their tab. |
| **Form validation error** | Focus moves to the first field with an error on submit. Error message announced via `aria-live="assertive"`. |
| **Navigation (bottom tabs, sidebar)** | Uses `<nav aria-label="Main navigation">`. Current page indicated by `aria-current="page"`. |
| **Screen transitions** | On route change, focus moves to the page heading (`<h1>`) or the `.screen` container. `document.title` updates to reflect the new screen. |

### 9.6 Screen Reader Considerations

| Component | ARIA Implementation |
|-----------|-------------------|
| Lomi FAB | `<button aria-label="Talk to Lomi" role="button">` |
| Pill badges | `<span role="status" aria-label="Status: Given">Given</span>` |
| Progress bar | `<div role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" aria-label="Shift documentation 75% complete">` |
| Segmented control | `role="tablist"` on container, `role="tab"` with `aria-selected` on each button |
| Star/score display | `aria-label="3 out of 5 independent"` rather than visual-only representation |
| Icon buttons | Always include `aria-label` describing the action (e.g., `aria-label="Back"`, `aria-label="Settings"`) |
| Visually hidden text | `.sr` class: `position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;` |
| Live regions | Auto-save indicator: `aria-live="polite"`. Sync status: `aria-live="polite"`. Clinical alerts: `aria-live="assertive"`. Coverage updates: `aria-live="polite"`. |
| Data tables (supervisor) | `<th scope="col">` for column headers, `<th scope="row">` for row headers, `<caption>` for table purpose |

### 9.7 Cognitive Accessibility

| Principle | Implementation |
|-----------|---------------|
| **Simple language** | All UI copy at or below 8th-grade reading level. Error messages in plain language with specific correction guidance. "Add what time you gave Marcus his evening meds" not "Required field: administration_time is null." |
| **Consistent layout** | Every screen follows the same structure: appbar at top, content in the middle, action bar or nav at bottom. Navigation items stay in the same position across all screens. |
| **Forgiving inputs** | Auto-save every keystroke (500ms debounce). Allow edits before lock. "Resume where you left off?" toast on return. Undo support for destructive actions with 5-second window. |
| **Error prevention** | Required fields marked from the start with "(required)" suffix, not discovered on failed submission. Clinical value inputs show soft warnings for out-of-range values before submission. Destructive actions require confirmation via bottom sheet. |
| **Predictable behavior** | Every button does what its label says. No double-meaning interactions. Tap always means "select" or "navigate." Long-press is never required for any action. |
| **Reduced memory load** | Auto-populate compose context with person name, home, shift time from clock-in. Show active ISP goals pre-loaded. Display medications due this shift as a reminder. Never require the DSP to remember and re-enter context. |

---

## 10. Dark Mode

### 10.1 Activation Strategy

Dark mode is critical for overnight shifts (11pm-7am), which represent approximately one-third of all DSP shifts.

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Light** | Manual toggle or default | Standard warm cream palette. |
| **Dark** | Manual toggle or system preference (`prefers-color-scheme: dark`) | Warm-neutral dark palette. |
| **Auto** | Time-based or system preference | Suggests dark mode at 8pm via non-blocking toast: "Heading into evening? Switch to dark mode." Requires manual toggle -- never forces. Follows `prefers-color-scheme` if no manual preference set. |

**Toggle placement:** Three-way toggle (Light / Dark / Auto) in the app bar, accessible with one tap. Not buried in settings. Stored in the user's local preferences (PowerSync `user_settings` table -- not `localStorage`, per CLAUDE.md rules).

**CSS mechanism:** The current `styles.css` uses `data-theme="guad-dark-off"` as the dark mode selector. (Rebuild proposal: rename to `data-theme="dark"` for clarity -- "guad-dark-off" is confusing since it *enables* dark mode.) All color tokens reference CSS custom properties that are overridden in the dark selector.

### 10.2 Complete Dark Palette

> **(Rebuild proposal -- not in MVP)** The palette below is a *proposed* replacement for the current `styles.css` dark mode. The current MVP dark mode uses a navy-tinted palette (`--bg: #12122E`, `--card: #1C1C42`, etc.) via `[data-theme="guad-dark-off"]`. The values below propose warm-neutral darks that reduce circadian disruption and avoid disturbing sleeping individuals. If this proposal is accepted, `styles.css` and `design-system.md` must be updated to match. Until then, the navy palette in `styles.css` remains the shipped behavior.

**Current MVP dark mode values** (from `styles.css` / `design-system.md`): `--bg: #12122E`, `--card: #1C1C42`, `--ink: #F2F1FF`, `--muted: #B7B6DA`, `--faint: #8C8BB4`, `--blue: #8590FF`.

#### 10.2.1 Backgrounds (Dark)

| Token | Light Value | Dark Value | Rationale |
|-------|------------|------------|-----------|
| `--bg` | `#FFFCF3` | `#1A1A1E` | Warm neutral dark gray. NOT navy. Removes blue-light concern. OLED-friendly without true-black smearing. |
| `--bg-sunken` | `#F7F5EE` | `#141416` | Slightly darker for recessed areas. |
| `--card` | `#FFFFFF` | `#242428` | Lifted above page background. Warm dark gray. |
| `--card-elevated` | `#FFFFFF` | `#2C2C32` | Elevated cards, sheets, modals. |

#### 10.2.2 Primary Brand (Dark)

| Token | Light Value | Dark Value | Contrast on `--card` Dark | Rationale |
|-------|------------|------------|---------------------------|-----------|
| `--blue` | `#2F3ED8` | `#8A96FF` | 5.1:1 (AA) | Lightened for contrast on dark surfaces. |
| `--blue-hover` | `#2D3A8C` | `#A0AAFF` | 6.4:1 (AA) | Hover state. (Rebuild rename from --blue-d) |
| `--blue-active` | `#232F73` | `#7080F0` | 4.2:1 (AA large) | Active/pressed. |
| `--blue-disabled` | `#9CA3D9` | `#4A4E70` | 1.8:1 (intentional) | Disabled. |
| `--sky` | `#EEF0FF` | `#28283A` | -- | Very subtle blue tint on dark. |
| `--sky-hover` | `#E0E3FF` | `#32324A` | -- | Hover on sky. |

#### 10.2.3 Accent (Dark)

| Token | Light Value | Dark Value | Rationale |
|-------|------------|------------|-----------|
| `--lemon` | `#FFD66B` | `#E8C050` | Slightly dimmed. Full brightness `#FFD66B` is too harsh on dark backgrounds. |
| `--lemon-2` | `#FFF4CC` | `#2A2618` | Dark lemon wash background. |
| `--lemon-line` | `#F2D27A` | `#4A4020` | Dark lemon border. |

#### 10.2.4 Text (Dark)

| Token | Light Value | Dark Value | On `--card` Dark (#242428) | Rationale |
|-------|------------|------------|----------------------------|-----------|
| `--ink` | `#1C1B4B` | `#EEEDF5` | 13.30:1 (AAA) | Warm off-white, not pure `#FFFFFF` (reduces eye strain). Slight lavender warmth. |
| `--muted` | `#5A5880` | `#A09EB8` | 5.95:1 (AA) | Secondary text. |
| `--faint` | `#8B89AA` | `#8A88B2` | 4.60:1 (AA) | Tertiary text. (Changed from `#7A78A0` which only achieved 3.70:1 on `--card` `#242428`, failing AA.) |
| `--disabled-text` | `#A09EB8` | `#55536E` | 2.1:1 (intentional) | Disabled. |
| `--ink-inverse` | `#FFFFFF` | `#1C1B4B` | -- | Text on light surfaces in dark mode context. |

#### 10.2.5 Semantic Colors (Dark)

| Token | Light Value | Dark Value | Dark Background |
|-------|------------|------------|-----------------|
| `--ok` | `#1F7A4D` | `#7FD8A8` | -- | (Current MVP dark: `#7FD8A8` -- matches) |
| `--ok-bg` | `#E6F4EC` | `#1B2E24` | Darker green tint | (Current MVP dark: `#1B3A2C`) |
| `--ok-border` | `#B4DFC8` | `#2A4A36` | -- |
| `--warn` | `#9A6700` | `#E8B84A` | -- |
| `--warn-bg` | `#FFF3CD` | `#2A2418` | Darker amber tint |
| `--warn-border` | `#F0D78A` | `#4A3E20` | -- |
| `--bad` | `#B42318` | `#FF9C94` | -- |
| `--bad-bg` | `#FDECEA` | `#2E1C1E` | Darker red tint |
| `--bad-border` | `#F5C6C0` | `#4A2A2A` | -- |
| `--info` | `#2D5FBF` | `#7CA8E8` | -- |
| `--info-bg` | `#E8F0FE` | `#1C2430` | Darker blue tint |
| `--info-border` | `#B8D0F0` | `#2A3A50` | -- |

#### 10.2.6 Clinical Colors (Dark)

Same hue families, adjusted for dark surface contrast:

| Token | Dark Value | Light Equivalent |
|-------|-----------|-----------------|
| `--vital-normal` | `#7FD8A8` | `#1F7A4D` |
| `--vital-watch` | `#E8B84A` | `#9A6700` |
| `--vital-alert` | `#E87A40` | `#C4500A` |
| `--vital-critical` | `#FF9C94` | `#B42318` |
| `--med-given` | `#7FD8A8` | `#1F7A4D` |
| `--med-refused` | `#FF9C94` | `#B42318` |
| `--med-held` | `#E8B84A` | `#9A6700` |
| `--med-due` | `#7CA8E8` | `#2D5FBF` |
| `--med-prn` | `#8A88B2` | `#8B89AA` |

#### 10.2.7 Borders, Shadows, Overlay (Dark)

| Token | Light Value | Dark Value | Rationale |
|-------|------------|------------|-----------|
| `--line` | `#ECEDF6` | `#303038` | Subtle dividers |
| `--line2` | `#DADDF3` | `#404050` | Stronger borders |
| `--shadow-*` | (see Section 2.4) | `none` | Shadows invisible on dark. Use borders and surface color for depth. |
| `--scrim` | `rgba(18, 18, 46, 0.45)` | `rgba(0, 0, 0, 0.60)` | Darker overlay needed on dark backgrounds. |

### 10.3 Clinical Color Verification (Dark Mode)

All clinical status colors must remain visually distinguishable from each other in dark mode. Verified combinations:

| Pair | Color A | Color B | Distinguishable? | Notes |
|------|---------|---------|-------------------|-------|
| Given vs Refused | `#7FD8A8` (green) | `#FF9C94` (red) | Yes | Hue difference > 120 degrees. Also distinguishable by deuteranopic users (lightness differs). |
| Refused vs Held | `#FF9C94` (red) | `#E8B84A` (amber) | Yes | Hue difference ~40 degrees, lightness differs. Text labels always accompany color. |
| Given vs Held | `#7FD8A8` (green) | `#E8B84A` (amber) | Yes | Hue difference ~80 degrees. |
| Watch vs Alert | `#E8B84A` (amber) | `#E87A40` (orange) | Marginal | Close in hue (~20 degrees). MUST use text labels ("Watch" vs "Alert") and distinct icons. |
| Normal vs Critical | `#7FD8A8` (green) | `#FF9C94` (red) | Yes | Maximum hue separation. |
| Due vs Info text | `#7CA8E8` (blue) | `#8A96FF` (indigo) | Marginal | Close in hue. Due uses pill context (`.pill.info`), info uses callout context. Differentiated by component, not color alone. |

### 10.4 OLED Considerations

| Screen Type | `--bg` Value | Rationale |
|-------------|-------------|-----------|
| LCD | `#1A1A1E` | Warm neutral dark. Standard dark mode background. |
| OLED | `#1A1A1E` (same) | True black (`#000000`) causes "black smearing" on OLED displays when scrolling. The `#1A1A1E` value is dark enough to save battery (OLED pixels emit minimal light at this brightness) while avoiding the smearing artifact. |

> **Decision:** Use `#1A1A1E` for all screen types. The battery savings from true black are marginal (1-3%) and not worth the visual quality degradation from black smearing. If future testing shows demand for true-black, add a "Night mode" option as a layer on top of dark mode.

### 10.5 Night Mode (Overlay for 11pm-7am)

An even dimmer variant layered over Dark Mode for documenting while individuals sleep. Activated automatically when a DSP is clocked into an overnight shift, or manually via a "Night" option in the dark mode toggle.

| Token | Dark Value | Night Value | Rationale |
|-------|-----------|-------------|-----------|
| `--bg` | `#1A1A1E` | `#121214` | Nearly black. Minimal light emission. |
| `--card` | `#242428` | `#1C1C20` | Very subtle lift above page. |
| `--ink` | `#EEEDF5` | `#D0CFE0` | Slightly dimmer text to reduce overall brightness. |

Additional night mode behaviors:
- Maximum screen brightness capped at 50% via PWA recommendation prompt (cannot be enforced, only suggested).
- All `--shadow-*` values remain `none`.
- Lomi orb breathing animation pauses (static dim lemon circle) to avoid drawing the eye in dark rooms.

### 10.6 CSS Custom Properties Implementation

> **Implementation note:** The block below is the **TARGET CSS** for the SvelteKit rebuild. It includes proposed changes from the current `styles.css` (warm-neutral dark mode palette, new semantic tokens, WCAG-compliant `--faint`). The current MVP `styles.css` values are documented inline where they differ.

```css
/* Light mode (default) — matches styles.css except where marked REBUILD */
:root,
:root[data-theme="light"] {
  --bg: #FFFCF3;
  --bg-sunken: #F7F5EE;             /* REBUILD: not in current styles.css */
  --card: #FFFFFF;
  --card-elevated: #FFFFFF;          /* REBUILD: not in current styles.css */
  --blue: #2F3ED8;                   /* matches styles.css */
  --blue-d: #2230B8;                 /* matches styles.css --blue-d */
  --blue-active: #232F73;            /* REBUILD: not in current styles.css */
  --blue-disabled: #9CA3D9;          /* REBUILD: not in current styles.css */
  --sky: #EEF0FF;
  --sky-hover: #E0E3FF;              /* REBUILD: not in current styles.css */
  --lemon: #FFD66B;
  --lemon-2: #FFF4CC;
  --lemon-line: #F2D27A;
  --lemon-muted: #E8C455;            /* REBUILD: not in current styles.css */
  --ink: #1C1B4B;
  --muted: #5A5880;                  /* matches styles.css */
  --faint: #8B89AA;                  /* matches styles.css (WCAG fix: change to #706E96) */
  --disabled-text: #A09EB8;          /* REBUILD: not in current styles.css */
  --ink-inverse: #FFFFFF;            /* REBUILD: not in current styles.css */
  --ok: #1F7A4D;                     /* matches styles.css */
  --ok-bg: #E6F4EC;
  --ok-border: #B4DFC8;              /* REBUILD: not in current styles.css */
  --warn: #9A6700;                   /* REBUILD: not in current styles.css */
  --warn-bg: #FFF3CD;               /* REBUILD: not in current styles.css */
  --warn-border: #F0D78A;           /* REBUILD: not in current styles.css */
  --bad: #B42318;
  --bad-bg: #FDECEA;
  --bad-border: #F5C6C0;            /* REBUILD: not in current styles.css */
  --info: #2D5FBF;                   /* REBUILD: not in current styles.css */
  --info-bg: #E8F0FE;               /* REBUILD: not in current styles.css */
  --info-border: #B8D0F0;           /* REBUILD: not in current styles.css */
  --line: #ECEDF6;
  --line2: #DADDF3;
  --scrim: rgba(18, 18, 46, 0.45);  /* matches styles.css */
  --shadow-0: none;
  --shadow-1: 0 1px 2px rgba(28,27,75,.05), 0 4px 12px -8px rgba(28,27,75,.15);
  --shadow-2: 0 1px 2px rgba(28,27,75,.05), 0 8px 24px -16px rgba(28,27,75,.25);
  --shadow-3: 0 4px 12px rgba(28,27,75,.08), 0 16px 40px -16px rgba(28,27,75,.30);
  --shadow-4: 0 8px 24px rgba(28,27,75,.10), 0 30px 80px -40px rgba(28,27,75,.35);
  color-scheme: light;
}

/* Dark mode — REBUILD PROPOSAL (warm-neutral palette)
   Current styles.css uses [data-theme="guad-dark-off"] with a navy palette.
   This proposes warm-neutral darks. Rename selector in rebuild. */
:root[data-theme="guad-dark-off"],
:root[data-theme="dark"] {           /* "dark" is rebuild rename target */
  --bg: #1A1A1E;                     /* Current MVP: #12122E (navy) */
  --bg-sunken: #141416;
  --card: #242428;                   /* Current MVP: #1C1C42 (navy) */
  --card-elevated: #2C2C32;
  --blue: #8A96FF;                   /* Current MVP: #8590FF */
  --blue-d: #A0AAFF;                 /* Current MVP: #A2AAFF */
  --blue-active: #7080F0;
  --blue-disabled: #4A4E70;
  --sky: #28283A;                    /* Current MVP: #24255A (navy) */
  --sky-hover: #32324A;
  --lemon: #E8C050;                  /* Current MVP: #FFD66B (unchanged) */
  --lemon-2: #2A2618;               /* Current MVP: #3A3320 */
  --lemon-line: #4A4020;            /* Current MVP: #6A5A26 */
  --lemon-muted: #B89830;
  --ink: #EEEDF5;                    /* Current MVP: #F2F1FF */
  --muted: #A09EB8;                  /* Current MVP: #B7B6DA */
  --faint: #8A88B2;                  /* Fixed: original #7A78A0 failed AA (3.70:1 on #242428) */
  --disabled-text: #55536E;
  --ink-inverse: #1C1B4B;
  --ok: #7FD8A8;
  --ok-bg: #1B2E24;                  /* Current MVP: #1B3A2C */
  --ok-border: #2A4A36;
  --warn: #E8B84A;
  --warn-bg: #2A2418;
  --warn-border: #4A3E20;
  --bad: #FF9C94;
  --bad-bg: #2E1C1E;                 /* Current MVP: #3D1F25 */
  --bad-border: #4A2A2A;
  --info: #7CA8E8;
  --info-bg: #1C2430;
  --info-border: #2A3A50;
  --line: #303038;                   /* Current MVP: #2B2B5A (navy) */
  --line2: #404050;                  /* Current MVP: #3A3A70 (navy) */
  --scrim: rgba(0, 0, 0, 0.60);
  --shadow-0: none;
  --shadow-1: none;
  --shadow-2: none;
  --shadow-3: none;
  --shadow-4: none;
  color-scheme: dark;
}

/* Auto: follow system preference when no manual override.
   Implementation: use JavaScript to detect prefers-color-scheme and set
   data-theme="guad-dark-off" (or "dark" after rename) on :root.
   This avoids duplicating all custom properties in a media query. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]):not([data-theme="guad-dark-off"]) {
    /* Apply via JS: document.documentElement.dataset.theme = 'guad-dark-off'; */
  }
}

/* Night mode overlay (applied via data-night="true" on :root) */
:root[data-theme="guad-dark-off"][data-night="true"],
:root[data-theme="dark"][data-night="true"] {
  --bg: #121214;
  --card: #1C1C20;
  --ink: #D0CFE0;
}
```

### 10.7 Hardcoded Color Audit

The following hardcoded hex values in the JS rendering code must be replaced with CSS custom property references before dark mode can function correctly:

| File | Location | Current Value | Replace With |
|------|----------|--------------|-------------|
| `app-caregiver.js` | line 159 | `stroke:#8A4510` | `var(--warn)` or a new `--flag-icon` token |
| `app-caregiver.js` | line 70 | `stroke=#fff` | `var(--ink-inverse)` |
| `styles.css` | line 288-291 | `#E7E8F5` on `.cv-card`, `.cv-row` | `var(--line2)` |
| `styles.css` | line 322 | `#C9CFFF` on `.cv-pillbtn` | `color-mix(in srgb, var(--blue) 35%, transparent)` |
| `styles.css` | lines 300-301 | `#FFF3C4` and `#FFE9A8` on orb rings | `var(--lemon-2)` and `var(--lemon)` |
| `styles.css` | line 315 | `#FFE9A8` on `.cv-text.flagged` | `var(--lemon)` |
| `styles.css` | line 315 | `#B45A14` on `.cv-text.flagged` box-shadow | `var(--warn)` |
| `styles.css` | line 319 | `#FFF3C4` on `.cv-flag` | `var(--lemon-2)` |
| `styles.css` | line 320 | `#E8EBFF` and `#C9CFFF` on `.cv-inc` | `var(--sky)` and `color-mix(in srgb, var(--blue) 35%, transparent)` |
| `styles.css` | line 323 | `#B45A14` on `.cv-pillbtn.warn` | `var(--warn)` |

> **Note on `color-mix()` fallbacks:** Android WebView versions older than Chrome 111 do not support `color-mix()`. Provide fallback hex values for these usages or use a PostCSS plugin to generate fallbacks.
