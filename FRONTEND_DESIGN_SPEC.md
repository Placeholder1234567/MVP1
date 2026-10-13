# Guad Frontend Design Specification

**Version:** 1.0  
**Date:** October 2026  
**Status:** Pre-implementation design specification  
**Produced by:** 22-agent research and analysis workflow  

---

## Executive Summary

This specification defines the complete frontend design for Guad, an AI-powered documentation, scheduling, and shift coverage platform for IDD (intellectual/developmental disabilities) residential care. It was produced through a comprehensive 22-agent research workflow analyzing competitors (Therap, Brittco, MediSked, iCareManager, ShareVision, Vertex), user sentiment (positive and negative reviews), modern design patterns, and the existing Guad MVP prototype.

**Key design decisions:**

- **Warm, not clinical:** Cream backgrounds (#FFFCF3), Georgia serif headings, Figtree sans-serif body, 20px card radius, lemon (#FFD66B) accent. The interface respects that DSPs are doing emotionally demanding work.
- **Voice-first documentation:** The speak → draft → review → sign workflow via Lomi (AI assistant) is the primary differentiator. DSPs speak their notes; Lomi organizes them into clinically structured documentation. AI never auto-submits.
- **Offline-first architecture:** PowerSync provides local SQLite (wa-sqlite + OPFS) on every device. All documentation, medication administration, goal scoring, and vitals entry work without connectivity. Data syncs when the connection returns.
- **Caregiver mobile / Supervisor desktop:** Two distinct interfaces optimized for their contexts — DSPs use phones in group homes, supervisors use desktops in offices.
- **HIPAA-compliant by design:** Row-Level Security for tenant isolation, audit triggers on all PHI mutations, session timeouts, MFA, de-identification before AI processing.

**Sections 1–13 cover:** Design philosophy, design system (colors, typography, spacing, elevation, motion), caregiver screens (13 wireframes), supervisor dashboard (8 screens), component library (7 component groups), AI/Lomi UX (voice pipeline, progressive disclosure, brand presence), navigation architecture, offline/PWA behavior, accessibility (WCAG 2.1 AA), dark mode, MVP audit findings, competitive analysis, and a 16-week implementation roadmap.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Design System](#2-design-system)
3. [Caregiver Experience](#3-caregiver-experience)
4. [Supervisor Experience](#4-supervisor-experience)
5. [Component Library](#5-component-library)
6. [AI/Lomi UX](#6-ailomi-ux)
7. [Navigation & Information Architecture](#7-navigation--information-architecture)
8. [Offline & PWA UX](#8-offline--pwa-ux)
9. [Accessibility](#9-accessibility)
10. [Dark Mode](#10-dark-mode)
11. [What to Keep from Current Guad](#11-what-to-keep-from-current-guad)
12. [What Competitors Get Wrong](#12-what-competitors-get-wrong-and-how-guad-fixes-it)
13. [Implementation Priority](#13-implementation-priority)
- [Appendix A: CSS Micro-Interactions](#appendix-css-micro-interactions-implement-immediately)
- [Appendix B: Critical Fixes Checklist](#appendix-critical-fixes-checklist)
- [Appendix C: Design Review & Quality Audit](#appendix-design-review--quality-audit)

> **Source files:** The canonical source for each section lives in `.specify/frontend-spec-{1,2,3}.md`. This assembled document combines all three parts. The `.specify/CLAUDE.md` file indexes exact line ranges for each section in the source files.

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



---

## 3. Caregiver Experience

---

### 3.1 Today/Home Dashboard

**Purpose:** The first screen every DSP sees after sign-in and clock-in. It answers one question: "Who still needs a note, and is anything urgent?"

**Above-the-fold content on a 390x844 viewport (first ~400px):**

| Zone | Height | Content |
|------|--------|---------|
| Status bar + safe area | ~50px | System status bar + `env(safe-area-inset-top)` |
| Home bar | ~56px | "Guad" wordmark (Figtree 24px semibold, left), sync indicator dot (6px, right -- implemented in SvelteKit migration, not in vanilla-JS MVP), team messages icon (44x44 tap target, chat bubble SVG, right), user avatar circle (34px, right) |
| Urgent alert banner (conditional) | ~56px | Red/amber strip. Only when: health vitals flagged, meds overdue >30 min, or open incident. E.g., "Maria: BP high, needs recheck." Left-border 3px `var(--bad)`. |
| Greeting + shift context | ~54px | "Good morning, Aisha" -- Georgia serif, 24px, `var(--ink)`. Below in 14px `var(--muted)`: "Oak Street · Shift 7am to 3pm" (matches code format: `sh.time.replace("–"," to ")`). *(Rebuild target -- not in MVP:)* Countdown timer "4h 23m left" updating every 60s. |
| Progress card | ~56px | White `cv-card` (18px radius). Left: "Today's notes" (15px semibold). Right: "3 of 5 done" (15px `var(--muted)`). Full-width progress bar: 8px height, `var(--sky)` track, `var(--blue)` fill, 999px radius. Transition: `width 600ms cubic-bezier(.32,.72,0,1)`. |
| Coverage offer (conditional) | ~70px | `callout.warn` (lemon-2 bg, lemon-line border, 18px radius). Lomi icon (26px). "Can you pick up a shift? Oak St, tomorrow AM." Two actions: "I'll take it" (`.btn.sm`, primary) and "Not this time" (`.textbtn`). Max 1 offer on Today. |
| Person list | remaining ~160px+ | Scrollable. Shows 2-3 person cards initially. |

**Person card (`.cv-row`):**

- Dimensions: full width, padding 16px 18px, border-radius 18px, bg `var(--card)`, border 1px solid `#E7E8F5`
- Left: avatar circle 44x44, bg `var(--sky)`, color `var(--blue)`, 15px/700 initials
- Center (`.grow`, flex:1): name 16px/600, subtitle 14px `var(--muted)` (truncated with `text-overflow: ellipsis`)
- Right: status indicator
  - To do: `<span class="cv-chip">To do</span>` -- bg `var(--lemon)`, color `#1C1B4B`, 12px/700
  - Done: blue circle SVG (26px) with white checkmark
  - Fix: `<span class="cv-chip bad">Fix</span>` -- bg `var(--bad-bg)`, color `var(--bad)`
- Hover: `border-color: var(--blue)`
- Active: `transform: scale(0.97)`, transition 80ms ease

**Person list sort order (urgency-weighted, top to bottom):**

> **Note:** The MVP code implements a simplified 2-tier sort: unsigned/returned notes first, signed notes last (see `app-caregiver.js` line 67). The 7-tier sort below is the target behavior for the SvelteKit rebuild.

1. Overdue medications (med due >30 min ago, not recorded)
2. Medications due within 30 minutes
3. Health rechecks flagged (vital out of range earlier today)
4. Returned notes (status = "returned", supervisor sent back)
5. Unsigned shift notes with active goals to record
6. Standard unsigned notes (no goals)
7. Completed people (note signed, all meds given) -- pushed to bottom

**Person card subtitles (time-sensitive context):**

> *Note: The MVP renders simplified subtitles ('X meds due' -- see app-caregiver.js lines 68-72). The time-sensitive subtitles below are the target for the SvelteKit rebuild.*

| State | Subtitle text |
|-------|--------------|
| Med due soon | "Med due in 15 min, shift note" |
| Med overdue | "Lisinopril 30 min overdue" |
| BP recheck | "BP recheck at 2pm" |
| Returned note | "Sent back: add more detail about lunch" |
| Unsigned, has goals | "Shift note, 3 goals to record" |
| Unsigned, no goals | "Shift note" |
| Signed | "Signed at 2:14pm" |

**Pre-clock-in state:**

When the DSP has not clocked in, the greeting shows but the people list is replaced by a clock-in card (see section 3.8). The subtitle reads: "Clock in to see today's people and tasks."

**ASCII wireframe -- Today screen (mobile, 40 chars):**

```
+--------------------------------------+
| Guad                     [msg]  AK   |  <- sync indicator added in rebuild
+--------------------------------------+
| ! Maria: BP high, recheck     [!]   |
+--------------------------------------+
| Good morning, Aisha          [serif] |
| Oak St · Shift 7am to 3pm           |
+--------------------------------------+
| Today's notes          3 of 5 done   |
| [=========---------]     progress    |
+--------------------------------------+
| [lemon] Can you pick up a shift?     |
| Oak St, tomorrow AM                  |
| [I'll take it]    Not this time      |
+--------------------------------------+
| +--+                                 |
| |MK| Marcus King            [due]    |
| +--+ Med due 15m, shift note         |
+--------------------------------------+
| +--+                                 |
| |JD| John Davis             [fix]    |
| +--+ Sent back: add detail           |
+--------------------------------------+
| +--+                                 |
| |SR| Sarah Rivera           [done]   |
| +--+ Signed at 2:14pm        [ok]   |
+--------------------------------------+
|          ...more people...           |
|                                      |
+--------------------------------------+
|                                      |
| [        Talk to Lomi         ]      |
| Today   Notes   Shifts   Me         |
+--------------------------------------+
```

**Desktop (>=900px):** Left sidebar replaces bottom dock. Person list becomes a 2-column CSS grid (`grid-template-columns: repeat(2, minmax(0, 1fr))`, gap 14px). Max-width of main content area: 920px, centered.

---

### 3.2 Shift Note Creation (Full Voice -> AI -> Review -> Submit Flow)

This is Guad's core differentiator: a shift note in under 5 minutes via voice, compared to 15-25 minutes of typing on Therap.

#### Entry Points

1. **From Today screen:** Tap a person card -> Person Detail -> "Shift note (T-Log)" row
2. **From Lomi button:** Tap "Talk to Lomi" in dock/sidebar -> person picker bottom sheet -> compose screen
3. **Quick mic (future):** Small mic icon on each person card row (24px, `var(--muted)`), tapping starts recording immediately for that person

#### Step 1: Select Person

When the DSP taps "Talk to Lomi," a bottom sheet (`.sheet`) opens with the title "Who is this note about?" and a list of all individuals assigned to the current home. Each row is a button with avatar, name, and chevron. Tapping a person navigates to the compose screen.

If entering via Today -> Person Detail -> Shift note row, person selection is implicit.

**ASCII wireframe -- Person picker sheet:**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| Who is this note about?              |
|                                      |
| +-------------------------------+    |
| | +--+                          |    |
| | |MK| Marcus King         [>] |    |
| | +--+                          |    |
| +-------------------------------+    |
| | +--+                          |    |
| | |JD| John Davis          [>] |    |
| | +--+                          |    |
| +-------------------------------+    |
| | +--+                          |    |
| | |SR| Sarah Rivera        [>] |    |
| | +--+                          |    |
| +-------------------------------+    |
+--------------------------------------+
```

#### Step 2: Voice or Type -- Compose Screen

**App bar:** Back button (44x44 `.iconbtn`) + person name (17px/600) + "Shift note -- Oak Street" subtitle (13px `var(--muted)`)

**Layout (mobile, top to bottom):**

| Element | Spec |
|---------|------|
| Topic chips (`.cv-try`) | Horizontal flex, gap 8px, centered. Muted label "Try covering:" (14px). Pills: bg `var(--sky)`, color `var(--blue)`, 13px/600, 999px radius, padding 6px 12px. Topic chips vary by shift time (see section 6.3 for per-shift variants). Default (no shift context): "Meals" "Mood" "Goals" "Anything unusual". Behavior note: "Before" "What happened" "Your response" "How it ended". Therap shift: "Activities" "ISP Data" "Health" "Meals". |
| Lomi orb (`.orb`) | Container: 210x210px default (reduce to 150x150px when viewport height <700px). Per design-system.md the compose screen size is 150px; 210px is used only when vertical space allows. Position relative. Ring1: absolute inset 0, 999px radius, bg `#FFF3C4`. Ring2: absolute inset 26px, 999px radius, bg `#FFE9A8`. Lemon SVG: 104px, centered, position relative. |
| Status text | Centered serif, 26px. Idle: "Tell Lomi about the shift". Recording: "Lomi is listening". Below in 15px `var(--muted)`: "Tap Speak, or type below" / "Speak naturally". |
| Waveform (`.wave`, recording only) | 10 vertical bars, 5px wide, bg `var(--blue)`, 3px radius. Heights: 14, 28, 38, 22, 32, 16, 26, 36, 18, 10px. CSS keyframe `wv`: scaleY .6 -> 1.0 -> .6, 1s ease-in-out infinite. Stagger: `:nth-child(2n)` delay .2s, `:nth-child(3n)` delay .4s. Reduced motion: `animation: none`. |
| Transcript card | `.cv-card` (18px radius), self-stretch. Label: "Live transcript" (`.cv-lbl`, 12px/700 uppercase, `var(--muted)`). Textarea (`#say`, `.say-plain`): border 0, bg transparent, 16px, line-height 1.6, min-height 110px. Placeholder: "Talk the way you would to a coworker at shift change..." |
| Skip link | `.textbtn`: "Write it myself instead". Color `var(--blue)`, 14px/600. Navigates to review screen with empty fields. |
| Action bar (`.actionbar`) | Fixed bottom. Two buttons side by side, gap 10px. Left: "Speak"/"Pause" (`.btn.sec`). Right: "Done, write my note" (`.btn`, primary blue). Mic button disabled if `MediaRecorder` unavailable. |

**Orb animation states:**

| State | Ring1 | Ring2 | Additional |
|-------|-------|-------|------------|
| Idle | Static | Static | No glow |
| Recording (`.orb.live`) | `scale(1) -> scale(1.25)`, 2.4s ease-in-out infinite | Similar with offset timing | Blue glow shadow |
| Thinking | Slow pulse, 3s duration | Same | Three-dot animation below |
| Reduced motion | Static at `scale(1.05)` | Static at `scale(1.15)` | No animation |

**Recording interaction flow:**

1. DSP taps "Speak" -> browser requests microphone permission (first time only)
2. `MediaRecorder` starts. `.orb` gets `.live` class. Waveform appears. Button label changes to "Pause"
3. DSP speaks naturally. Audio chunks captured via `ondataavailable`
4. DSP taps "Pause" -> recording stops, transcript arrives in textarea (via `/api/transcribe` Whisper call)
5. Transcript is editable -- DSP can fix names, add details
6. DSP can tap "Speak" again to add more audio
7. DSP taps "Done, write my note" -> sends transcript to Lomi API

**Thinking state (replaces compose screen content):**

```
+--------------------------------------+
| [<] Marcus King                      |
|     Shift note - Oak Street          |
+--------------------------------------+
|                                      |
|                                      |
|           +----------+              |
|           |  ring1   |              |
|           | +------+ |              |
|           | |ring2 | |              |
|           | |lemon | |              |
|           | +------+ |              |
|           +----------+              |
|                                      |
|     Lomi is writing your note        |
|            . . .                     |
|                                      |
|                                      |
+--------------------------------------+
```

**Error handling:**

- Mic denied: "Microphone access was denied or is unavailable. Allow access, then try again." shown as `errLine()` below transcript
- Transcription failed: "Transcription failed. Type instead or try recording again."
- Transcript too short (<15 chars): "Tell Lomi a little more first."

**ASCII wireframe -- Compose screen, recording state:**

```
+--------------------------------------+
| [<] Marcus King                      |
|     Shift note - Oak Street          |
+--------------------------------------+
|  Try covering:                       |
|  [Meals] [Mood] [Goals] [Unusual]    |
|                                      |
|           +----------+              |
|           |  (orb    |              |
|           |  pulsing)|              |
|           +----------+              |
|                                      |
|       Lomi is listening              |
|        Speak naturally               |
|                                      |
|     | | | | | | | | | |   waveform  |
|                                      |
| +----------------------------------+ |
| | LIVE TRANSCRIPT                  | |
| | Marcus had a good lunch, he     | |
| | ate all his chicken and rice...  | |
| +----------------------------------+ |
|                                      |
| Write it myself instead              |
|                                      |
+--------------------------------------+
| [  Pause  ] [Done, write my note]    |
+--------------------------------------+
```

#### Step 3: AI Structures the Transcript

After the DSP taps "Done, write my note":

1. Compose screen shows thinking state (orb + "Lomi is writing your note" + dots animation)
2. Transcript + Lomi prompt sent to API. MVP: single Claude call via `/api/lomi` with `max_tokens: 1200`. Production: parallel pipeline per ai-pipeline.md (`POST /api/lomi/draft`, 3 Haiku + 1 Sonnet in parallel).
3. API returns structured JSON with fields: `activities`, `meals`, `mood`, `health`, plus `goals` (matched to person's active goals), `flags` (vague language array), `incident` (detected incident object)
4. Data normalized via `normalizeDraft()` in `app-core.js`
5. Screen transitions to Review

**Typical latency:** 3-8 seconds. If >10 seconds, show secondary text: "Still working..." below the dots.

**Fallback:** If API fails, `rules()` function runs locally -- regex-based categorization of sentences into Activities/Meals/Mood/Health sections. Produces usable but less polished output. Fallback banner shown on review screen.

#### Step 4: Review/Edit Structured Output -- Review Screen

**App bar:** Back button + title that varies:
- AI-drafted: "Review Lomi's draft"
- Manual: "Write your note"
- Returned/editing: "Fix your note"
- Subtitle: person name + note type + today's date (13px `var(--muted)`)

**Layout (mobile, top to bottom):**

| Element | Spec |
|---------|------|
| Supervisor comment (returned notes only) | `.cv-flag` with red tint: `background: var(--bad-bg)`, `border-color: color-mix(in srgb, var(--bad) 30%, transparent)`. Bold "Supervisor:" + comment text. |
| Fallback banner (if AI unavailable) | `.cv-flag` with default warm tint: `background: #FFF3C4`, `border: 1px solid #F2D27A`. "Lomi wasn't available, so this draft was sorted by simple rules. Check each section carefully." |
| Note card (`.cv-card.cv-note`) | bg `var(--card)`, border 1px solid `#E7E8F5`, 18px radius, padding 14px 16px. Contains vertically stacked sections, gap 12px. |
| Each section | Label (`.cv-lbl`): 12px/700, uppercase, letter-spacing .06em, `var(--muted)`. Textarea (`.cv-text`): 15px, line-height 1.5, border 0, bg transparent, 8px radius, `field-sizing: content` (auto-grow), min-height 26px. Hover: bg `color-mix(in srgb, var(--sky) 55%, transparent)`. Focus: bg `var(--sky)`, outline none. Placeholder: "Nothing to note". |
| Flagged section | `.cv-text.flagged`: bg `#FFE9A8`, `box-shadow: inset 0 -2px 0 #B45A14`. Indicates vague language detected in this section. |
| Goal picker | See section 3.3 below. |
| Vague language flags | `.cv-flag` callouts. See details below. |
| Incident detection | `.cv-inc` callout. See details below. |
| Action bar | Fixed bottom. Top: trust message "You review and sign every note. Lomi never submits for you." (13px `var(--muted)`, centered). Bottom: two buttons -- "Edit" (`.btn.sec`) + "Sign and submit" (`.btn`, flex:1). For returned notes: "Sign and resubmit". |

**Section order by preset:**

| Default preset | Therap preset |
|---------------|---------------|
| Activities | General Information (auto-populated: date, shift, home -- not an editable section) |
| Meals | Activities |
| Mood | ISP Data Collection (goals) |
| Health and safety | Health and safety |
| Goals | Meals |
| -- | Mood / Behavioral Observations |

**Behavior note sections (both presets):** Behavior type (choice group from person's behavior plan + "Other"), What happened right before, What [name] did, How staff responded, How it ended, How long it lasted.

**Vague language flags (`.cv-flag`):**

- Background: `#FFF3C4`, border `1px solid #F2D27A`, border-radius 16px, padding 12px 14px
- Info icon: 18px SVG circle, stroke `#8A4510`
- Text: tip from AI (e.g., "Describe what you saw") or default: `"[phrase]" is vague. Describe what you saw.`
- Actions: "Fix it" (`.cv-pillbtn.warn`, border-color `#B45A14`) + "Keep as is" (`.textbtn`)
- "Fix it" dismisses the flag and focuses + selects the flagged text in the relevant textarea

**Incident detection (`.cv-inc`):**

- Background: `#E8EBFF`, border `1px solid #C9CFFF`, border-radius 16px, padding 12px 14px
- Text: "You mentioned: [summary]. File an incident report? Your supervisor will be notified."
- Actions: "File report" (`.cv-pillbtn.blue`, bg `var(--blue)`, color white) + "Not an incident" (`.cv-pillbtn`)
- "File report" saves review state, navigates to incident wizard pre-populated with detected details
- "Not an incident" dismisses and marks as handled

**ASCII wireframe -- Review screen:**

```
+--------------------------------------+
| [<] Review Lomi's draft              |
|     Marcus King - Shift note - Oct 11|
+--------------------------------------+
| [!] Supervisor: Add more detail      |  <- only if returned
|     about lunch behavior             |
+--------------------------------------+
| +----------------------------------+ |
| | ACTIVITIES                       | |
| | Marcus had a good day. He        | |
| | participated in the cooking      | |
| | activity and helped set the      | |
| | table for lunch.                 | |
| |                                  | |
| | MEALS                            | |
| | Ate all his chicken and rice     | |
| | at lunch. Drank two glasses of   | |
| | water.                           | |
| |                                  | |
| | MOOD                             | |
| | [In a great mood all afternoon]  | |  <- flagged (amber bg)
| |                                  | |
| | HEALTH AND SAFETY                | |
| | No health issues today.          | |
| |                                  | |
| | GOALS                            | |
| | v Brush teeth on own             | |
| |   1.Verbal 2.Verbal             | |
| |   (2 of 2 independent) [Edit]   | |  <- collapsed, data
| |                                  | |
| |   Use fork independently         | |
| |   [Independent][Verbal]         | |
| |   [Gestural][Model]            | |
| |   [Partial physical]           | |
| |   [Full physical][Refused]     | |  <- expanded, picking
| |   [Done] [Not attempted]        | |
| +----------------------------------+ |
|                                      |
| [i] "great mood" is vague.          |
|     Describe what you saw.           |
|     [Fix it]  Keep as is             |
|                                      |
+--------------------------------------+
| You review and sign every note.      |
| [  Edit  ] [  Sign and submit    ]  |
+--------------------------------------+
```

#### Step 5: Metadata (Type Chips, Notification Level, Summary)

In the Therap preset, the review screen includes additional metadata fields above the note card:

> *(Rebuild target -- the MVP review screen has no preset-dependent metadata fields.)*

| Field | Spec |
|-------|------|
| Type selector chips | Choice group: "Health" "Notes" "Follow-up" "Behavior" "Contacts" "General". Default: "Notes". Pill buttons, 14px/600, 999px radius, min-height 44px. |
| Summary field | Single-line text input, 16px, 14px radius. Placeholder: "Brief summary (optional)". Auto-generated from first sentence of Activities section if blank. |
| Notification level | Choice group: "Low" "Medium" "High". Default: "Low". |
| Time in / Time out | Two time inputs in `.grid2` layout. Auto-filled from clock-in/out times. Editable. |

In the default preset, these fields are omitted (the system infers them from context).

#### Step 6: Sign and Submit

1. DSP taps "Sign and submit" -> validation runs (`validateNote()`)
2. Validation checks:
   - Activities or mood must have content
   - All goals must have at least one trial OR be marked "Not attempted" with a reason
   - All vague language flags must be addressed (fixed or kept)
   - Incident detection must be handled (filed or dismissed)
3. If validation fails: error displayed as `.callout.bad` with `role="alert"`, scrolled into view
4. If validation passes: sign confirmation bottom sheet opens

**Sign confirmation bottom sheet:**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| Sign this note?                      |
|                                      |
| Once signed, it goes to your         |
| supervisor. Later changes are saved  |
| as amendments.                       |
|                                      |
| [x] I confirm this note is accurate  |
|     and based on what I saw during   |
|     my shift.                        |
|                                      |
| [ Sign as Aisha Kebede            ]  |  <- always enabled
| [ Keep editing                    ]  |
+--------------------------------------+
```

- Title: "Sign this note?" (20px/600)
- Explanation: 14px `var(--muted)`
- Attestation checkbox (`.check`): 22x22 input, accent-color `var(--blue)`, 15px label
- Sign button: `.btn.full`, always enabled (matches MVP code, which validates on click rather than disabling)
- Cancel: `.btn.sec.full`, "Keep editing"
- If checkbox unchecked and sign tapped: inline error text "Check the box to confirm the note is accurate." in `var(--bad)`, `role="alert"` (click-to-validate pattern -- better for accessibility than disabled state)

**Post-sign success screen:**

```
+--------------------------------------+
|                                      |
|                                      |
|          +--[ok circle]--+           |
|          |      [check]  |           |
|          +---------------+           |
|                                      |
|         Note signed                  |  <- serif, 30px
|                                      |
|    Your supervisor can see it now.   |  <- muted, 15px
|                                      |
| [ Back to today                   ]  |
| [ More for Marcus                 ]  |
+--------------------------------------+
```

- Green circle (72px, bg `var(--ok-bg)`) with check SVG (36px, color `var(--ok)`)
- Heading: serif 30px
- Subtitle: 15px `var(--muted)`
- Two full-width buttons: "Back to today" (primary) + "More for [first name]" (secondary)

---

### 3.3 Goal/ISP Scoring

Goal scoring is embedded within the note review screen (section 3.2 Step 4), not a separate screen.

**Layout:** Below the note sections inside the `.cv-card.cv-note`, under the "Goals" label.

**Three states per goal:**

**State 1: Expanded / Picking (default when no data recorded)**

```
+----------------------------------+
| Use fork independently           |  <- 14px/600
|                                  |
| 1.Verbal 2.Ind               [x]|  <- trial pills
|                                  |
| Tap the prompt level for another |  <- 13px muted
| attempt                          |
|                                  |
| [Independent][Verbal][Gestural]  |  <- prompt level buttons
| [Model][Partial physical]        |
| [Full physical][Refused]         |
|                                  |
| [Done]  [Not attempted]         |  <- text buttons
+----------------------------------+
```

- Goal text: 14px/600, `var(--ink)`
- Trial pills (`.trial`): inline-flex, 999px radius, padding 3px 3px 3px 11px, 13.5px/600
  - Default: bg `var(--sky)`, color `var(--ink)`
  - Independent (`.trial.ind`): bg `var(--ok-bg)`, color `var(--ok)`
  - Refused (`.trial.ref`): bg `var(--bad-bg)`, color `var(--bad)`
  - Remove button: 28px circle, transparent bg, "x" character. **Touch target: pad to 44x44px** (visual remains 28px, hit area expands via padding)
- Prompt level buttons (`.levels`): flex-wrap, gap 6px
  - Each button: dashed border 1px `var(--line2)`, transparent bg, 999px radius, padding 6px 11px, 13px/600, `var(--muted)`, **min-height 44px** (increased from current 36px for WCAG)
  - Hover: solid border, `var(--blue)` color
  - Tapping adds a numbered trial pill
- "Done" and "Not attempted": `.textbtn`, 13px/600, `var(--blue)`
- Trials numbered sequentially (1. Verbal, 2. Ind, etc.)
- Score shown after trials: "2 of 3 independent" in 13px `var(--muted)`

**State 2: Collapsed with data recorded**

```
+----------------------------------+
| [check] Brush teeth on own:      |
|   verbal, verbal (0 of 2 ind)   |
|                          [Edit]  |
+----------------------------------+
```

- Left: SVG checkmark in sky circle (18px)
- Text: goal text + level abbreviations (lowercase, comma-separated) + score
- "Edit" text button reopens the picker

**State 3: Not attempted**

```
+----------------------------------+
| Use fork independently:          |
| not attempted                    |
| [Why? For example: out at a..]   |  <- reason input
| Record attempts instead          |  <- text link
+----------------------------------+
```

- Goal text + ": not attempted" in 14px/600
- Reason text input: `.input`, placeholder "Why? For example: out at a family visit"
- "Record attempts instead" link toggles back to expanded picker

**Prompt levels (7 total, IDD standard):**

| Level | Display (SHORT map) | Color when trial |
|-------|---------------------|-----------------|
| Independent | Independent | Green (ok-bg/ok) |
| Verbal prompt | Verbal | Default (sky/ink) |
| Gestural prompt | Gestural | Default |
| Model | Model | Default |
| Partial physical | Partial physical | Default |
| Full physical | Full physical | Default |
| Refused | Refused | Red (bad-bg/bad) |

**Progress indicator (future enhancement):** Add an SVG progress ring (48px donut, stroke-width 4) next to each goal showing the independence rate over the last 14 days. Track circle: `var(--sky)`. Progress arc: `var(--blue)` for on-track, `var(--lemon)` for approaching target, `var(--bad)` for declining. Center text: percentage (14px/600). Accompanied by a trend arrow (up/steady/down SVG, 16px) computed from last-2-weeks vs prior-2-weeks average.

---

### 3.4 Medication Administration (eMAR)

**Purpose:** Record whether each scheduled medication was given, refused, or held. Safety-critical workflow with zero tolerance for error.

**App bar:** Back button + "Medications" + person name subtitle. (The "(eMAR)" suffix is not rendered in MVP code. Use "Medications" only.)

**Layout (mobile, card-based -- correct for phone ergonomics):**

| Element | Spec |
|---------|------|
| Safety callout | `.callout.warn` (lemon-2 bg, lemon-line border). Info icon (20px). "Check the right person, medication, dose, time and route against the label before giving." Always visible, never dismissible. |
| Section header: "Scheduled today" | `.section-h`, 15px/600 |
| Medication cards | One `.cv-card` per scheduled medication, sorted by time (earliest first). Gap 18px between cards. |
| Section header: "As needed" | `.section-h`, shown only if PRN medications exist |
| PRN cards | One `.cv-card` per PRN medication |

**Scheduled medication card (not yet recorded):**

```
+--------------------------------------+
| Lisinopril 10mg              [Due]   |
| By mouth - 8:00am                    |
| Take with food                       |
|                                      |
| [ Mark as given                   ]  |  <- .btn.full, primary
| [ Refused     ] [ Held           ]  |  <- .btn.sec.sm, grid2
+--------------------------------------+
```

- Name: 17px/600 bold
- Details: 14px `var(--muted)`, dose + route + time + notes
- Status pill: `.pill.due` (bg `var(--lemon)`, color `#1C1B4B`)
- "Mark as given": `.btn.full`, primary blue, includes check icon (20px)
- Refused/Held: `.btn.sec.sm` in `.grid2` layout, gap 12px

**Scheduled medication card (recorded):**

```
+--------------------------------------+
| Lisinopril 10mg            [Given]   |
| By mouth - 8:00am                    |
|                                      |
| Given at 8:12am by Aisha K          |  <- 14px muted
+--------------------------------------+
```

- Status pill: `.pill.ok` for Given, `.pill.bad` for Refused/Held
- Recorded info: 14px `var(--muted)`, timestamp + recorder name + reason (if refused/held)
- No action buttons

**Refused/Held bottom sheet:**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| Refused: Lisinopril 10mg            |
|                                      |
| What happened when you offered it?   |
| +----------------------------------+ |
| |                                  | |
| |                                  | |
| +----------------------------------+ |
|                                      |
| Your supervisor will be alerted.     |
|                                      |
| [ Save                           ]  |
| [ Cancel                         ]  |
+--------------------------------------+
```

- Title: 20px/600, "[Refused/Held]: [med name]"
- Textarea: `.input`, 96px min-height, label varies by status
- Info text: 13px `var(--faint)`
- Save validates that reason is not empty

**PRN medication card:**

```
+--------------------------------------+
| Acetaminophen 500mg                  |
| For headache or mild pain            |
|                                      |
| Given at 1:30pm for: headache       |  <- if given today
| Effect: Helped some                  |
|                                      |
| [ Give as needed                  ]  |  <- .btn.sec.full
+--------------------------------------+
```

- "Give as needed" opens a bottom sheet with a reason textarea
- After PRN given, "Record whether it helped" button appears (opens effect choice group: "Symptoms went away" / "Helped some" / "No change" / "Got worse")

**MAR grid view (supervisor desktop only, future):**

```
         Mon  Tue  Wed  Thu  Fri  Sat  Sun
Lisin.   [v]  [v]  [v]  [v]  [ ]  [ ]  [ ]
Metfo.   [v]  [v]  [R]  [v]  [ ]  [ ]  [ ]
Sertr.   [v]  [v]  [v]  [v]  [ ]  [ ]  [ ]

v = Given (filled blue circle + checkmark)
R = Refused (red circle with R)
H = Held (orange circle with H)
[ ] = Not recorded (hollow gray circle)
```

CSS grid: `grid-template-columns: 160px repeat(7, minmax(0, 1fr))`. Each cell: minimum 44x44px touch target. Below grid: compliance bar showing percentage of doses given.

**ASCII wireframe -- MAR screen (mobile):**

```
+--------------------------------------+
| [<] Medications                      |
|     Marcus King                      |
+--------------------------------------+
| [i] Check the right person,         |
|     medication, dose, time and       |
|     route against the label.         |
+--------------------------------------+
|                                      |
| Scheduled today                      |
|                                      |
| +----------------------------------+ |
| | Lisinopril 10mg          [Due]   | |
| | By mouth - 8:00am               | |
| |                                  | |
| | [   Mark as given            ]   | |
| | [ Refused   ] [   Held      ]   | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | Metformin 500mg         [Given]  | |
| | By mouth - 12:00pm              | |
| | Given at 12:05pm by Aisha K     | |
| +----------------------------------+ |
|                                      |
| As needed                            |
|                                      |
| +----------------------------------+ |
| | Acetaminophen 500mg              | |
| | For headache or mild pain        | |
| | [   Give as needed           ]   | |
| +----------------------------------+ |
+--------------------------------------+
```

---

### 3.5 Health Vital Entry

**Purpose:** Record vitals, seizures, illness, or doctor visits. Flags out-of-range values per agency-configured thresholds.

**App bar:** Back button + "Health" + person name subtitle

**Layout:**

| Element | Spec |
|---------|------|
| Segmented control (`.seg`) | 4 segments: "Vitals" "Seizure" "Illness" "Visit". bg `var(--sky)`, 14px radius, 4px padding. Active: bg `var(--card)`, color `var(--blue)`, shadow. **Min-height: 44px** (increased from 42px). |
| Form card (`.cv-card.fieldset`) | Contains fields that change per selected type. 18px radius. |
| Error line | `.callout.bad` with `role="alert"`, shown on validation failure |
| Recent entries | Last 3 health entries for this person, as a `.list.card` with rows |
| Action bar | Fixed bottom. "Save [type]" primary button. |

**Vitals form fields:**

```
+--------------------------------------+
| [Vitals] Seizure  Illness  Visit     |  <- segmented control
+--------------------------------------+
| +----------------------------------+ |
| | Blood pressure, top    [   ] mmHg| |
| | Blood pressure, bottom [   ] mmHg| |
| |                                  | |
| | Pulse        [   ] bpm          | |
| | Temperature  [   ] deg F        | |
| |                                  | |
| | Weight       [   ] lb           | |
| +----------------------------------+ |
|                                      |
| Recent                               |
| +----------------------------------+ |
| | Vitals - Oct 10 2:30pm          | |
| | BP 128/82 - Pulse 76 - 98.4F   | |
| +----------------------------------+ |
| | Vitals - Oct 9 9:15am           | |
| | BP 145/92 - Pulse 84     [Alrt] | |
| +----------------------------------+ |
+--------------------------------------+
| [    Save vitals                  ]  |
+--------------------------------------+
```

- BP fields: `.grid2` layout (2-column, gap 12px). `type="number"`, `inputmode="numeric"`. Unit suffix (`.unit`): `em` tag positioned absolute right. Padding-right 58px on input.
- Pulse/Temperature: same pattern, temperature uses `inputmode="decimal"`, `step="0.1"`
- Weight: full width, `inputmode="decimal"`, `step="0.1"`
- All fields: `.input` class, 50px min-height, 14px radius, 16px font (prevents iOS zoom)

**Threshold color coding (enhancement):**

| Vital | Normal range | Borderline | Critical |
|-------|-------------|------------|----------|
| Temp | 95.0-100.4 F | -- | <95 or >=100.4 |
| Pulse | 50-100 bpm | -- | <50 or >100 |
| Systolic BP | 90-140 mmHg | -- | <90 or >=140 |
| Diastolic BP | 60-90 mmHg | -- | <60 or >=90 |

> **Operator note:** The MVP code (app-core.js `vitalFlags()`) uses `>=` for temperature (`t>=LIM.tempHi`), systolic (`s>=LIM.sysHi`), and diastolic (`di>=LIM.diaHi`) upper bounds. The lower bounds and pulse use `<` and `>` respectively. All specs must use these operators to match clinical standards (e.g., 100.4F IS the fever threshold and must trigger an alert).

On blur: if value is out of range, field border turns `var(--bad)`, helper text appears below in 13px `var(--bad)`: "Temperature 101.2F is outside the normal range." Save still allowed (flagged automatically).

**Seizure form fields:** Time started (`type="time"`), Duration (`type="text"`, placeholder "About 2 minutes"), What you saw (textarea), Afterwards (textarea), What you did (textarea). All in `.grid2` where appropriate.

**Illness form fields:** Symptoms (textarea), Started (`type="text"`, placeholder "This morning"), Might it spread? (select: "Not sure" / "Yes" / "No"), What you did (textarea).

**Visit form fields:** Date (`type="date"`), With (`type="text"`), Reason (`type="text"`), Outcome and follow-up (textarea).

**Recent entries list:** Last 3 entries for this person, most recent first. Each row: bold label + date/time, muted summary line, alert pill if flagged.

**ASCII wireframe -- Health vitals entry:**

```
+--------------------------------------+
| [<] Health                           |
|     Marcus King                      |
+--------------------------------------+
| [*Vitals*] Seizure  Illness  Visit   |
+--------------------------------------+
| +----------------------------------+ |
| | BP top          [128     ] mmHg  | |
| | BP bottom       [ 82     ] mmHg  | |
| |                                  | |
| | Pulse           [ 76     ] bpm   | |
| | Temperature     [ 98.4   ] F     | |
| |                                  | |
| | Weight          [185.0   ] lb    | |
| +----------------------------------+ |
|                                      |
| Recent                               |
| +----------------------------------+ |
| | Vitals - Oct 10 2:30pm          | |
| | BP 128/82 - Pulse 76 - 98.4F   | |
| |------------------------------   | |
| | Vitals - Oct 9 9:15am           | |
| | BP 145/92 - Pulse 84    [Alert] | |
| +----------------------------------+ |
+--------------------------------------+
| [       Save vitals               ]  |
+--------------------------------------+
```

---

### 3.6 Incident Report Wizard (3 Steps)

**Purpose:** Report falls, injuries, seizures, medication errors, and other incidents with structured data for compliance and follow-up.

**App bar:** Back button + "Incident report" + person name + "Step X of 3" subtitle

**Progress bar:** `.cv-bar` at top of screen. 8px height, `var(--sky)` track, `var(--blue)` fill. Width: 33% / 67% / 100%.

#### Step 1: What Happened

```
+--------------------------------------+
| [<] Incident report                  |
|     Marcus King - Step 1 of 3        |
+--------------------------------------+
| [====----------]  33%               |
| +----------------------------------+ |
| | What kind of incident?           | |
| |                                  | |
| | [*Fall*] [Injury] [Seizure]      | |
| | [Med error] [Left w/o staff]     | |
| | [Behavior w/ harm] [Prop dmg]    | |
| | [Other]                          | |
| |                                  | |
| | Time           [  14:30  ]      | |
| | Where          [ Kitchen  v]    | |
| |                                  | |
| | What happened                    | |
| | +------------------------------+ | |
| | | Marcus slipped on wet floor  | | |
| | | near the sink while walking  | | |
| | | to the table.                | | |
| | +------------------------------+ | |
| |                                  | |
| | What happened right before       | |
| | +------------------------------+ | |
| | | Floor had been mopped, was   | | |
| | | still wet.                   | | |
| | +------------------------------+ | |
| +----------------------------------+ |
+--------------------------------------+
| [           Next                  ]  |
+--------------------------------------+
```

- Type selection: `.choice` group (pill buttons, 14px/600, 999px radius, min-height 44px). Options: "Fall", "Injury", "Seizure", "Medication error", "Left without staff", "Behavior with harm", "Property damage", "Other"
- Time: `type="time"`, auto-filled with current time rounded to nearest 5 minutes
- Where: `select.input`. Options: "Bedroom", "Bathroom", "Kitchen", "Living room", "Outside", "Community", "Vehicle", "Other"
- What happened: `textarea.input`, placeholder "Describe only what you saw or heard"
- What happened right before: `textarea.input`, min-height 70px
- Validation: "What happened" and "Time" are required before proceeding

#### Step 2: Injury and Response

```
+--------------------------------------+
| [<] Incident report                  |
|     Marcus King - Step 2 of 3        |
+--------------------------------------+
| [=========-----]  67%               |
| +----------------------------------+ |
| | Any injury?                      | |
| |                                  | |
| | [No injury seen] [*Yes*]         | |
| | [Not checked yet]               | |
| |                                  | |
| | Describe the injury              | |  <- conditional, shown if Yes
| | +------------------------------+ | |
| | | Small red mark on right      | | |
| | | knee, no bleeding            | | |
| | +------------------------------+ | |
| |                                  | |
| | What you did                     | |
| | +------------------------------+ | |
| | | Applied ice pack, helped     | | |
| | | Marcus to the couch.         | | |
| | +------------------------------+ | |
| |                                  | |
| | Medical follow-up               | |
| | [*None needed*] [Nurse check]   | |
| | [Doctor visit] [Emergency]      | |
| |                                  | |
| | Witnesses                        | |
| | [Priya, Aisha               ]   | |
| +----------------------------------+ |
+--------------------------------------+
| [  Back  ] [       Next          ]   |
+--------------------------------------+
```

- Injury assessment: `.choice` group: "No injury seen", "Yes", "Not checked yet"
- Injury description: `textarea.input`, conditional on "Yes" selection
- What you did: `textarea.input`, required
- Medical follow-up: `.choice` group: "None needed", "Nurse to check", "Doctor visit", "Emergency care"
- Witnesses: text input

#### Step 3: Severity and Notifications

```
+--------------------------------------+
| [<] Incident report                  |
|     Marcus King - Step 3 of 3        |
+--------------------------------------+
| [================]  100%             |
| +----------------------------------+ |
| | How serious was it?              | |
| |                                  | |
| | [*Low*] [Medium] [High]         | |
| |                                  | |
| | Who needs to be told             | |
| | Check anyone you've told.        | |
| |                                  | |
| | [x] Supervisor    Right away     | |
| | [ ] Family/guard  Within 24h    | |
| | [ ] Nurse         Within 2h     | |
| +----------------------------------+ |
+--------------------------------------+
| [  Back  ] [   Submit report     ]   |
+--------------------------------------+
```

- Severity: `.choice` group: "Low", "Medium", "High"
- Notification checklist: dynamic based on severity + incident type (via `notifRules()` in `app-core.js`). Each row is a `.check` element with checkbox + "who" + "when" text
  - High severity or "Left without staff" adds: "State reporting system -- Check your state's deadline"
  - Seizure, Medication error, Injury, Fall add: "Nurse -- Within 2 hours"
- Action bar: "Back" (`.btn.sec`) + "Submit report" (`.btn`, primary)

**Post-submit:** Lomi posts to the home's team messages: "[DSP name] reported an incident ([type], [severity] severity). A supervisor will follow up." Success screen with green checkmark.

**Auto-save (Rebuild target -- not in MVP):** All wizard state persists to PowerSync local DB on every input change (debounced 500ms). On return to the wizard after interruption, restore saved state. Show "Draft saved [timestamp]" indicator at bottom of form. *(Note: IndexedDB/localStorage must NOT be used for PHI-containing data per the project constitution. PowerSync OPFS is the only permitted client-side PHI cache.)*

---

### 3.7 Messages/SComm

**Purpose:** Team messaging for staff, supervisors, and Lomi at a specific home.

**App bar:** Back button + "[Home name] team" + "Staff, supervisors and Lomi" subtitle

**Layout:**

```
+--------------------------------------+
| [<] Oak Street team                  |
|     Staff, supervisors and Lomi      |
+--------------------------------------+
|                                      |
| Lomi - Oct 11 9:14am                |
| +------------------------------+    |
| | Today's PM shift needs cover.|    |  <- .msg.lomi (lemon bg)
| | I've offered it to 3 staff.  |    |
| +------------------------------+    |
|                                      |
|                 David - Oct 11 9:20am|
|    +------------------------------+  |
|    | Thanks for the heads up.     |  |  <- .msg.me (blue bg)
|    +------------------------------+  |
|                                      |
| Priya - Oct 11 9:25am               |
| +------------------------------+    |
| | I can take the PM shift if   |    |  <- .msg.them (white bg)
| | no one else has claimed it.  |    |
| +------------------------------+    |
|                                      |
+--------------------------------------+
| [Message the Oak Street team] [Send] |
+--------------------------------------+
```

**Message bubble (`.msg`):**

- Max-width: 82%, padding 10px 14px, border-radius 18px, 15px, line-height 1.45
- Sender label (`.who`): 12px/600, `var(--muted)`, margin-bottom 2px
- `.msg.them`: bg `var(--card)`, border 1px solid `var(--line)`, left-aligned, bottom-left-radius 6px
- `.msg.me`: bg `var(--blue)`, color white, right-aligned, bottom-right-radius 6px
- `.msg.lomi`: bg `var(--lemon-2)`, border 1px solid `var(--lemon-line)`, left-aligned, bottom-left-radius 6px

**Composer (`.composer`):**

- Sticky bottom, bg `var(--card)`, border-top 1px solid `var(--line)`, padding 12px 16px
- Text input: `.input`, min-height 46px, placeholder "Message the [home name] team"
- Send button: `.btn.sm`, icon-only with send arrow SVG (18px), aria-label "Send"
- Enter key sends message

**HIPAA:** No PHI in push notification previews. Notification shows: "Guad: New message from [first name]" -- no message content on lock screen.

---

### 3.8 Clock In/Out

**Purpose:** EVV-compliant time tracking with GPS verification.

**Pre-clock-in card (shown on Today screen when not clocked in):**

```
+--------------------------------------+
| +----------------------------------+ |
| | [pin icon]  Where are you        | |
| |             working?             | |
| |                                  | |
| | Guad uses your location to       | |  <- 14px muted
| | confirm you're at the home.      | |
| |                                  | |
| | [   Find my location         ]   | |  <- .btn.full, primary
| +----------------------------------+ |
```

**After location found, within geofence:**

```
+--------------------------------------+
| +----------------------------------+ |
| | [pin]  Where are you working?    | |
| |                                  | |
| | Location found (accurate to      | |
| | about 12 m).                     | |
| |                                  | |
| | [i] You're at Oak Street.        | |  <- .callout.info
| |     [ Clock in at Oak Street ]   | |
| |                                  | |
| +----------------------------------+ |
```

**After location found, outside all geofences:**

```
+--------------------------------------+
| +----------------------------------+ |
| | [pin]  Where are you working?    | |
| |                                  | |
| | Location found (accurate to      | |
| | about 15 m).                     | |
| |                                  | |
| | +------------------------------+ | |
| | | Oak Street         [Clock in]| | |
| | | 123 Oak Ave - 0.3 mi        | | |
| | |------------------------------| | |
| | | Maple Avenue       [Clock in]| | |
| | | 456 Maple Dr - 2.1 mi       | | |
| | +------------------------------+ | |
| |                                  | |
| | You don't appear to be at any of | |
| | your homes. If you clock in      | |
| | anyway, your supervisor will see | |
| | it was outside the check-in area.| |
| +----------------------------------+ |
```

**Location states:**

| State | Visual |
|-------|--------|
| Not requested | "Find my location" primary button |
| Locating | "Checking your location..." muted text, button hidden |
| Found, within geofence | `.callout.info` with home name + "Clock in at [home]" button |
| Found, outside geofence | List of homes with distances + "Clock in" secondary buttons + privacy note |
| Denied | "[Error message]. You can still choose your home." + home list |

**Clock-in action:** Creates a clock record with: staffId, homeId, timestamp, GPS coordinates, accuracy, distance to home, verified (boolean), manual (boolean if outside geofence). Logged as `clock.in` event. Toast: "Clocked in. Location verified at [home]." or "Clocked in at [home]. Your supervisor will see this was outside the check-in area."

**Clock-out (from Shifts tab or Me tab):**

```
+--------------------------------------+
| +----------------------------------+ |
| | [pin]  Clocked in at 7:02am     | |
| |        Oak Street               | |
| |        location verified        | |
| |                        [Clock   | |
| |                         out]    | |
| +----------------------------------+ |
```

- `.cv-card` with pin avatar, clock-in time, home name, verification status
- "Clock out" button: `.btn.sec.sm`
- On clock-out: records `outAt` timestamp, logs `clock.out` event, returns to Today tab, toast "Clocked out"

**Shift auto-detection:** Clock-in time determines shift via `SHIFTS` array: AM 07:00-15:00, PM 15:00-23:00, ON 23:00-07:00. Displayed in greeting subtitle.

---

### 3.9 Person Detail View

**Purpose:** Hub for all records and actions for one individual today.

**App bar:** Back button + person name (17px/600) + home name subtitle (13px `var(--muted)`)

**Layout (mobile, top to bottom):**

```
+--------------------------------------+
| [<] Marcus King                      |
|     Oak Street                       |
+--------------------------------------+
| Marcus likes to be called Marc.      |  <- info card (if exists)
| He uses a wheelchair for distances   |
| over 100 feet.                       |  <- .cv-card, 14px muted
+--------------------------------------+
|                                      |
| Today                                |
| +----------------------------------+ |
| | [doc] Shift note          [To do]| |
| |       Includes 3 goals          | |
| |----------------------------------| |
| | [pill] Medications       [2 due] | |
| |        3 scheduled doses         | |
| |----------------------------------| |
| | [cal] Attendance         [To do] | |
| |       Which services did Marc    | |
| |       get today?                 | |
| +----------------------------------+ |
|                                      |
| Record                               |
| +----------------------------------+ |
| | [heart] Health              [>]  | |
| |         Vitals, seizures, etc.   | |
| |----------------------------------| |
| | [wave] Behavior note        [>]  | |  <- only if behaviors
| |        Plan: hitting, elopement  | |
| |----------------------------------| |
| | [alert] Report an incident  [>]  | |
| |         Falls, injuries, etc.    | |
| +----------------------------------+ |
|                                      |
| About Marcus                         |
| +----------------------------------+ |
| | [file] Health summary       [>]  | |
| |        Allergies, conditions,    | |
| |        doctor, guardian          | |
| +----------------------------------+ |
+--------------------------------------+
```

**Row pattern (`.row` within `.list.card`):**

- Layout: flex, align-items center, gap 14px, padding 14px 16px
- Left: square avatar (`.avatar.sq`, 44x44, 14px radius) with icon SVG
- Center (`.grow`): name bold + subtitle muted, flex column, gap 1px
- Right: status pill or chevron
- Border-top: 1px solid `var(--line)` (except first child)
- First/last child get card border-radius (20px per design-system.md). Note: `.cv-card` uses 18px radius (a deliberate distinction from `.card` at 20px -- see design-system.md "Cards" for the canonical 20px value).
- Hover: bg `color-mix(in srgb, var(--sky) 55%, transparent)`

**Status pills per row:**

| Row | Not done | Done |
|-----|----------|------|
| Shift note | `.pill.due` "To do" | `.pill.ok` "Done" |
| Shift note (returned) | `.pill.bad` "Fix" | -- |
| Medications | `.pill.due` "2 due" | `.pill.ok` "Done" |
| Attendance | `.pill.due` "To do" | `.pill.ok` "Saved" |

**Health summary screen (read-only, accessed from "About" section):**

```
+--------------------------------------+
| [<] Health summary                   |
|     Marcus King                      |
+--------------------------------------+
| +----------------------------------+ |
| | Allergies      Penicillin        | |
| | Conditions     Type 2 diabetes   | |
| | Diet           Low sodium        | |
| | Doctor         Dr. Sarah Chen    | |
| | Guardian       Maria King        | |
| |                (555) 123-4567    | |
| | Date of birth  March 15, 1985    | |
| +----------------------------------+ |
|                                      |
| Current medications                  |
| +----------------------------------+ |
| | Lisinopril 10mg                  | |
| | By mouth - 8:00am               | |
| |----------------------------------| |
| | Metformin 500mg                  | |
| | By mouth - 12:00pm              | |
| +----------------------------------+ |
|                                      |
| Latest vitals                        |
| +----------------------------------+ |
| | BP 128/82 - Pulse 76 - 98.4F    | |
| | Oct 10 2:30pm                    | |
| +----------------------------------+ |
+--------------------------------------+
```

---

### 3.10 Bottom Tab Navigation

**Container (`.dock`):**

- Position: fixed bottom, z-index 10
- Width: `min(420px, 100%)`
- Background: `var(--card)`, border-top 1px solid `var(--line)`
- Padding-bottom: `env(safe-area-inset-bottom)` for iPhone home indicator

**"Talk to Lomi" button (`.talk`, above tabs):**

- Container: `.talkwrap`, padding 12px 16px 4px
- Button: full width, min-height 56px, 999px radius, bg `var(--blue)`, color white, 17px/600
- Content: lemon SVG icon (30px) + "Talk to Lomi" text, gap 12px
- Hover: bg `var(--blue-d)` (#2230B8)

**Tab bar (`.tabs4`):**

- Layout: 4-column grid, padding 2px 6px 8px
- Each tab: flex column, align center, gap 3px, min-height 52px, position relative

| Tab | Icon (22px SVG) | Label | Badge rule |
|-----|----------------|-------|------------|
| Today | Calendar with checkmark (filled when active, outlined inactive) | "Today" | Never |
| Notes | Document with lines | "Notes" | Red dot if supervisor returned any notes today. *(Rebuild target -- MVP code does not pass a badge parameter for the Notes tab; see app-caregiver.js line 114.)* |
| Shifts | Clock | "Shifts" | Red dot if shift coverage offers are pending |
| Me | Person silhouette | "Me" | Never |

**Tab styling:**

- Inactive: color `var(--faint)` (#8B89AA -> darken to #706E94 for WCAG AA), 12px/600
- Active: color `var(--blue)` (#2F3ED8), `aria-current="page"`
- Notification dot (`.dot`): 9px circle, bg `var(--bad)`, positioned `top: 6px; left: calc(50% + 8px)`, border 2px solid `var(--card)` (creates visual separation)
- No haptic feedback in current prototype; add `navigator.vibrate(10)` on tab switch where supported

**Dimensions:**

- Total dock height: ~130px (56px talk button + 8px padding + 52px tabs + safe area)
- Tab bar height: 64px including padding
- Tab icons: 22px
- Tab labels: 12px

**Desktop (>=900px):** `.dock` disappears (`display: none`). Navigation moves to left sidebar (`.cg-side`, 248px wide).

---

### 3.11 Notes Tab (Activity Log)

**Purpose:** Chronological activity log of everything the caregiver recorded today.

**App bar:** Home bar with title "Notes"

**Layout (mobile):**

```
+--------------------------------------+
| Notes                    [msg]  AK   |
+--------------------------------------+
| Everything you recorded today        |  <- 14px muted
|                                      |
| +----------------------------------+ |
| | [MK] Shift note        [Submitted]|
| |      Marcus King - 2:14pm        | |
| |----------------------------------| |
| | [JD] Lisinopril (as needed)      | |
| |      [Given]                      | |
| |      John Davis - 1:30pm         | |
| |----------------------------------| |
| | [SR] Vitals - Oct 11 9:15am      | |
| |      [Saved]                      | |
| |      Sarah Rivera - 9:15am       | |
| +----------------------------------+ |
+--------------------------------------+
```

**Data sources (from app-caregiver.js V.cgNotes):**

| Record type | Display format | Status pill |
|---|---|---|
| Shift/behavior notes | Note type (e.g., "Shift note", "Behavior note") | `.pill.ok` "Approved", `.pill.bad` "Sent back", `.pill.info` "Submitted" |
| MAR entries | Medication name + PRN indicator | `.pill.ok` "Given", `.pill.bad` "Refused" or "Held" |
| Health entries | Kind label (Vitals, Seizure, Illness, Visit) | `.pill.bad` "Alert" if flags, `.pill.ok` "Saved" otherwise |
| Incidents | "Incident: [type]" | `.pill.bad` "Open", `.pill.ok` "Reviewed" |
| Attendance | "Attendance: [services]" | `.pill.ok` "Saved" |

**Sort:** Most recent first (reverse chronological by timestamp).

**Empty state:** "Nothing yet. Your notes, medications, health entries and reports will show up here." (`.card.empty`)

---

### 3.12 Shifts Tab

**Purpose:** Clock status, shift offers, and upcoming schedule.

**App bar:** Home bar with title "Shifts"

**Layout (mobile):**

```
+--------------------------------------+
| Shifts                   [msg]  AK   |
+--------------------------------------+
| +----------------------------------+ |
| | [pin] Clocked in at 7:02am      | |
| |       Oak Street                 | |
| |       location verified          | |
| |                      [Clock out] | |
| +----------------------------------+ |
|                                      |
| Shifts offered to you                |  <- section header (if any)
| +----------------------------------+ |
| | [lemon] Can you pick up a shift? | |
| | Elm St, Tomorrow, PM (3pm-11pm)  | |
| | [I'll take it] Not this time     | |
| +----------------------------------+ |
|                                      |
| Your schedule (Next 7 days)          |
| +----------------------------------+ |
| | [cal] Today, Morning             | |
| |       7am-3pm - Oak Street       | |
| |                 [Can't make it]  | |
| |----------------------------------| |
| | [cal] Wednesday, Evening         | |
| |       3pm-11pm - Oak Street      | |
| |                 [Can't make it]  | |
| +----------------------------------+ |
+--------------------------------------+
```

**Components (from app-caregiver.js V.cgShifts):**

- **Clock status card:** `.cv-card` with pin avatar, clock-in time, home name, verification status, "Clock out" button
- **Shift offers:** Coverage offers via `offerCard()` -- same as Today screen
- **Schedule list:** `.list.card` with calendar icon, day label + shift label, time + home name, "Can't make it" button (`.btn.sec.sm`)
- **Callout status:** When DSP has called out, shows Lomi coverage status callout (`.callout.info`)

**Empty schedule:** "No shifts scheduled. Your supervisor adds shifts in the Schedule section." (`.card.empty`)

---

### 3.13 Me Tab

**Purpose:** Profile info, certifications, and session management.

**App bar:** Home bar with title "Me"

**Layout (mobile):**

```
+--------------------------------------+
| Me                       [msg]  AK   |
+--------------------------------------+
| +----------------------------------+ |
| | [AK 56px]  Aisha Kebede         | |
| |            Direct support        | |
| |            professional          | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | Homes      Oak Street, Elm Ave   | |
| |----------------------------------| |
| | Shifts this week    3 shifts     | |
| |----------------------------------| |
| | Medication certified    Yes      | |
| +----------------------------------+ |
|                                      |
| [ Clock out                       ]  |  <- if clocked in
| [ Switch user                     ]  |
+--------------------------------------+
```

**Components (from app-caregiver.js V.cgMe):**

- **Profile card:** `.cv-card` with large avatar (56x56px), name (18px bold), role subtitle
- **Info list:** `.list.card` with key-value rows for homes, weekly shifts, med certification
- **Action buttons:** "Clock out" (`.btn.sec.full`, only if clocked in) + "Switch user" (`.btn.sec.full`)

---



---

## 4. Supervisor Experience

The supervisor interface is a desktop-first dashboard that manages documentation review, scheduling, health monitoring, and staff oversight across one or more group homes. The current prototype renders all supervisor views through `app-office.js` within a `<div class="dash">` grid (`grid-template-columns: 220px minmax(0,1fr)`). The sidebar contains 11 flat navigation items with badge counts. This section specifies every screen with exact dimensions, behaviors, and ASCII wireframes.

### Design Density Principle

Supervisor views use tighter spacing than caregiver views on desktop:
- Card padding: 14px (vs 16-18px caregiver)
- Row gap in lists: 12px internal padding (vs 14px caregiver)
- Body text: 15px (vs 16px caregiver)
- Section gap: 16px (vs 18px caregiver)
- On mobile (<=900px), supervisor views revert to caregiver-density spacing for thumb-friendliness.

---

### 4.1 Overview Dashboard

The overview is the supervisor's home screen. It answers three questions above the fold: (1) What happened since I last looked? (2) What needs my action? (3) How is documentation progressing?

**Sidebar Navigation (left rail)**

| Property | Value |
|---|---|
| Width (expanded, >900px) | 220px |
| Width (collapsed, <=900px) | Full-width horizontal scroll strip at top (sidebar becomes horizontal scroll tabs) |
| *(Rebuild target)* | 64px icon rail at tablet sizes *(not in current MVP -- single 900px breakpoint)* |
| Background | var(--bg) #FFFCF3 (inherited from page -- the CSS `.side` has no explicit background property) |
| Border-right | 1px solid var(--line) #ECEDF6 |
| Position | sticky, top: 0, height: 100vh |
| Z-index | 5 |

**Sidebar Sections (grouped, replaces current 11-item flat list)**

> *Rebuild target -- the current MVP prototype (app-office.js O.render()) renders all nav items as a flat button list with no section groupings or section labels. The grouped layout below is the rebuild specification.*

```
SECTION LABEL STYLE:
  font-size: 11px
  font-weight: 700
  letter-spacing: 0.08em
  text-transform: uppercase
  color: var(--faint)
  padding: 18px 12px 6px
  margin-top: 4px (except first section)
```

| Section | Items | Icon | Badge Logic |
|---|---|---|---|
| **TODAY** | | | |
| | Overview | dashboard grid | Attention item count (blue .count.n) |
| | Schedule | calendar | Open shift count (red .count if > 0) |
| | Messages | chat bubble | Unread count (blue .count.n) |

> *Note: In the current MVP, Messages is positioned between People and Analytics (effectively in the MANAGEMENT area). The placement under TODAY above is an intentional reordering for the rebuild.*

| **CARE RECORDS** | | | |
| | Notes | document | To-review count (blue .count.n) |
| | Incidents | alert triangle | Open count (red .count) |
| | Medications | pill | Refused/held unacked (red .count) |
| | Health | heart | Flagged alerts (red .count) |
| **MANAGEMENT** | | | |
| | People | people group | -- |
| | Analytics | bar chart | -- |
| | Reports | file/download | -- |
| | Setup | gear | -- |

**Nav Item Styling:**
```
  border: 0
  background: none
  text-align: left
  display: flex
  align-items: center
  gap: 10px
  padding: 10px 12px
  border-radius: 12px
  font-weight: 600
  font-size: 15px
  color: var(--muted)
  min-height: 44px
  width: 100%

  :hover → background: var(--sky); color: var(--ink)
  [aria-current="page"] → background: var(--card); color: var(--blue);
    box-shadow: var(--shadow); border: 1px solid var(--line)
```

**Home Selector:**
```
  Position: top of sidebar, below wordmark
  Element: <select class="input">
  Options: "All homes" (if >1 home) + each home name
  Width: 100%
  Margin-bottom: 12px
```

**User Info (pinned to sidebar bottom):**
```
  margin-top: auto
  padding: 12px
  border-top: 1px solid var(--line)
  display: flex
  gap: 10px
  align-items: center
  Content: avatar (34px) + name (14px bold) + role (13px muted)
  Action: "Switch" text button (sign out)
```

**Main Content Area:**
```
  padding: 26px 28px 60px
  display: flex
  flex-direction: column
  gap: 20px
  min-width: 0
  max-width: none (note: the 1200px max-width is on the .dash container including sidebar, not the content area alone; effective main area width is ~980px)
```

**Page Header:**
```
  display: flex
  justify-content: space-between
  align-items: flex-end
  gap: 14px
  flex-wrap: wrap

  h1: 32px Georgia serif
  Subtitle: 14px var(--muted), margin-top 4px
  Right side: date, action buttons
```

**Lomi Summary Card (auto-generated on page load):**
```
  background: var(--lemon-2) #FFF4CC
  border: 1px solid var(--lemon-line) #F2D27A
  border-radius: 20px
  padding: 18px 20px
  display: flex
  gap: 14px
  align-items: flex-start

  Left: lemon icon SVG (40px)
  Right: flex column
    Title: "Lomi's summary" (bold)
    Body: pre-computed plain-English summary (15px, line-height 1.5)
    Footer: "Refreshed 2 min ago" timestamp (13px muted)
    Action: "Refresh summary" button (.btn.sm)
```

**KPI Stat Cards (4 cards in current MVP, 4-column grid desktop, 2-column mobile):**

```css
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); /* matches styles.css */
  gap: 12px;
}
@media (max-width: 900px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

| Card | Large Number | Label | Click-through |
|---|---|---|---|
| Shift Notes | 3/5 | Shift notes in today | Notes tab, today filter |
| Open Shifts | 2 | Open shifts ahead | Schedule tab |
| Open Incidents | 1 | Open incidents | Incidents tab, open filter |
| Doses Due | 3 | Doses not recorded | Medications tab |

> *(Rebuild target -- not in MVP)* The following stat cards are planned enhancements requiring new computed properties in O.stats():
>
> | Card | Label | Requires |
> |---|---|---|
> | Compliance Score | Documentation compliance (progress ring, delta arrow) | New fields: notes_completed_on_time, notes_expected, meds_given_on_time, meds_scheduled, incidents_reviewed_within_SLA, incidents_reported |
> | Med Compliance | Medications on time (7-day sparkline) | New computed percentage from MAR records |

**Stat Card Anatomy:**
```
  .card.stat
  padding: 16px 18px
  Large number: 30px / 600 weight / letter-spacing -0.01em / line-height 1.1
  Label: 14px / color var(--muted)
  Trend arrow: 13px / 600 / color var(--ok) for improvement, var(--bad) for decline
  Sparkline: inline SVG, 80px wide, 24px tall, stroke var(--blue), stroke-width 1.5
```

**Compliance Score Formula:** *(Rebuild target -- not in current MVP. No backing implementation exists in O.stats().)*
```
compliance = (
  notes_completed_on_time / notes_expected +
  meds_given_on_time / meds_scheduled +
  incidents_reviewed_within_SLA / incidents_reported
) / 3 * 100
```

Display as a progress ring (SVG donut, 48px diameter, stroke-width 5):
- `>= 90%`: stroke var(--ok) #1F7A4D
- `70-89%`: stroke var(--lemon) #FFD66B
- `< 70%`: stroke var(--bad) #B42318

> *Note: These compliance-specific thresholds (90/70) differ from the generic progress ring thresholds (80/50) in section 5.5. The compliance score uses stricter thresholds because regulatory standards typically require >=90% documentation compliance.*

**Attention Queue (severity-tiered, replaces current flat list):**

> *Rebuild target -- the current MVP prototype (app-office.js attention() + O.overview()) renders all attention items as a single flat list inside one `<div class="list card">` with no urgency banding, no colored left borders, and no collapsible sections.*

Three urgency bands, each rendered as a section within `<div class="list card">`:

| Band | Left Border | Background | Items |
|---|---|---|---|
| CRITICAL | 3px solid var(--bad) #B42318 | Faint red tint rgba(180,35,24,0.04) | Open high-severity incidents, medication errors, dangerous vital flags |
| NEEDS ACTION | 3px solid #D97706 (amber -- add to design system tokens if implementing) | None | Coverage gaps, refused/held meds unacked, notes awaiting review, unverified clock-ins |
| INFORMATIONAL | None | None | Low-severity incidents, Lomi-filling coverage, approved notes summary |

Informational band is collapsed by default: "Show X informational items" expander link.

**Batch Actions Bar (above attention list when >= 2 notes pending):** *(Rebuild target -- not in current MVP)*
```
  display: flex
  gap: 10px
  align-items: center
  padding: 8px 0

  "Approve all X notes" button (.btn.sm)
  Muted text: "Review individually below"
```

**Attention Row Anatomy:**
```
  <button class="row">
    Left: avatar (44px, person initials) or icon (calendar for coverage)
    Center: .grow
      b: description (bold 15px)
      span: timestamp/details (14px muted)
    Right: semantic pill (Coverage/Incident/Health/Medication/Review/Check-in)
           + chevron SVG (18px, var(--faint))
  </button>

  Inline action (for notes): "Approve" button directly on the row
  Inline action (for meds): "Mark followed up" inline
```

**ASCII Wireframe -- Supervisor Overview (Desktop, ~80 chars):**

```
+--------+------------------------------------------------------+
| Guad   |                                                      |
|        | Hello, David                               Oct 11    |
| [home] | Oak Street                                           |
| v Oak  |                                                      |
|        | +----------------------------------------------------+
| TODAY  | | [lemon] Lomi's summary                             |
| .......| | 1 incident open (high). 2 meds refused. 3 of 5    |
|  Overv | | notes submitted. All shifts covered thru Friday.   |
|  Sched | |                         Refreshed 2m   [Refresh]   |
|  Msgs  | +----------------------------------------------------+
|        |                                                      |
| CARE   | +----------+ +----------+ +----------+               |
| RECORDS| |   94%    | |   3/5    | |    2     |               |
| .......| | Complnce | |  Notes   | |  Shifts  |               |
|  Notes | |  +2% ^   | |  -1 v    | |  ~~~~~   |               |
|  Incid | +----------+ +----------+ +----------+               |
|  Meds  | +----------+ +----------+ +----------+               |
|  Healt | |    1     | |   97%    | |    3     |               |
|        | | Incidents| | Med Comp | | Due Soon |               |
| MGMT   | | 1 high   | |  ~~~~~   | | 2 in 1h  |               |
| .......| +----------+ +----------+ +----------+               |
|  Peopl |                                                      |
|  Analy | ---- CRITICAL ----                                   |
|  Repor | | [!] Fall: Maria K                                  |
|  Setup | |     High severity, 9:14am       [Review now]       |
|        | +----------------------------------------------------+
|        | ---- NEEDS ACTION ----                               |
| ====== | | Oak St: Tomorrow PM shift      [pill: Coverage]    |
| [AK]   | | Lisinopril refused: John D     [pill: Medication] |
| David  | | Shift note from Aisha K        [Approve]          |
| Admin  | | Shift note from Marcus J       [Approve]          |
| Switch | +----------------------------------------------------+
|        | v Show 2 informational items                         |
+--------+------------------------------------------------------+
```

---

### 4.2 Note Review & Approval

The notes screen uses a split-pane layout on desktop (list left, detail right) and stacked views on mobile.

**Split Pane Layout:**
```css
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 18px;
  align-items: start;
}
@media (max-width: 900px) {
  .split { grid-template-columns: 1fr; }
}
```

**Filter Bar (above the note list):** *(Rebuild target -- the current MVP (O.list()) has no filter, search, or sort UI; it renders the full list reversed.)*

```
  display: flex
  gap: 8px
  padding: 0 0 12px
  flex-wrap: wrap

  Filter pills (segmented or choice group):
    All | To review | Approved | Sent back
  Sort: newest first (default), oldest first
  Search: by person name or author name
  Date range: date inputs (from/to)
```

| Filter | Logic |
|---|---|
| All | No status filter |
| To review | status === "submitted" |
| Approved | status === "approved" |
| Sent back | status === "returned" |

**Note List Item:**
```
  <button class="row" data-a="sel" data-n="[id]">
    avatar (44px, person initials)
    .grow:
      b: person name (15px bold)
      span: note type + author + date (14px muted)
    Pill: status (To review = info blue, Approved = ok green, Sent back = bad red)
  </button>

  Selected row: background: var(--sky), aria-current="true"
```

**Note Detail Panel (right side of split):**
```
  .card.detail
  Header (.hd):
    padding: 18px 20px
    border-bottom: 1px solid var(--line)
    Left: person name (19px bold) + metadata line (14px muted):
      "Shift note / Behavior note · Author name · Date, Time"
    Right: status pill

  Body (.bd):
    Key-value pairs (.kv) for each note section:
      .lbl: section label (13px 600 muted uppercase)
      span: section content (15px)
    Sections for shift notes: Activities, Meals, Mood, Health and safety
    Sections for behavior notes: Behavior type, Right before, What happened,
      Staff response, How it ended, Duration

  Goals (if present):
    .kv per goal:
      .lbl: "Goal: [goal text]"
      span: trial abbreviations + score ("2 of 3 independent")

  Audit Trail (.trail):
    padding: 14px 20px
    border-top: 1px solid var(--line)
    13px muted text
    Each entry: bullet dot (7px circle) + timestamp + who + action

  Actions (.foot, only when status === "submitted"):
    padding: 16px 20px
    border-top: 1px solid var(--line)
    Comment textarea: label "Comment for [first name]"
      with hint "(required to send back)"
      min-height: 70px
    Buttons: "Approve note" (.btn.sm) + "Send back" (.btn.sec.sm)
```

**Batch Approval (when >= 2 notes have status "submitted"):** *(Rebuild target -- not in current MVP. Note: batch approval has data integrity implications; consider whether approving multiple notes without individual review conflicts with the review-each-note principle implied by the split-pane design.)*
```
  Banner above note list:
    display: flex
    align-items: center
    justify-content: space-between
    padding: 10px 16px
    background: var(--sky)
    border-radius: 14px
    margin-bottom: 8px

    Left: "X notes ready for review" (14px 600)
    Right: "Approve all" (.btn.sm)
```

**ASCII Wireframe -- Note Review (Desktop):**

```
+--------+------------------------------------------------------+
| Guad   | Notes                                                |
|        |                                                      |
|  ...   | [All] [To review] [Approved] [Sent back]   [Search] |
|  Notes*|                                                      |
|  ...   | +---------------------+ +----------------------------+
|        | | Note list           | | Note detail                |
|        | |                     | |                            |
|        | | [AK] Marcus King    | | Marcus King                |
|        | | Shift · Aisha · Oct | | Shift note · Aisha Khouri  |
|        | | [pill: To review]*  | | Oct 11, 2:14pm  [To review]|
|        | |---------------------| |                            |
|        | | [JD] John Davis     | | ACTIVITIES                 |
|        | | Shift · Marcus · Oc | | Marcus helped set the      |
|        | | [pill: Approved]    | | table and ate independently|
|        | |---------------------| |                            |
|        | | [SR] Sarah Rivera   | | MEALS                      |
|        | | Behavior · Aisha    | | Full lunch, drank 2 cups   |
|        | | [pill: Sent back]   | | of water with meal         |
|        | |                     | |                            |
|        | |                     | | MOOD                       |
|        | |                     | | Cheerful, engaged in       |
|        | |                     | | afternoon activities       |
|        | |                     | |                            |
|        | |                     | | GOAL: Use fork at meals    |
|        | |                     | | Ind, Ind, Verbal (2/3 ind) |
|        | |                     | |                            |
|        | |                     | | ---- Audit Trail ----      |
|        | |                     | | * Oct 11 2:14pm Aisha:     |
|        | |                     | |   Signed with Lomi draft   |
|        | |                     | |                            |
|        | |                     | | Comment for Aisha           |
|        | |                     | | [textarea____________]    |
|        | |                     | |                            |
|        | |                     | | [Approve note] [Send back] |
|        | +---------------------+ +----------------------------+
+--------+------------------------------------------------------+
```

---

### 4.3 Schedule Management

A 7-day grid view with rows for each shift period (Morning, Evening, Overnight) and columns for each day.

**Schedule Grid:**
```css
.week {
  display: grid;
  grid-template-columns: 110px repeat(7, minmax(0, 1fr));
  gap: 6px;
  min-width: 820px;
}
```

Wrapped in `overflow-x: auto` container for horizontal scroll on narrow screens.

**Column Headers:**
```
  .hd: 13px / 600 / color var(--muted) / padding 4px 6px
  Today's column: color var(--blue)
  Format: "Mon 14", "Tue 15", etc. Today shows "Today"
```

**Row Headers (shift labels):**
```
  .hd: shift name bold + time range in var(--faint) below
  "Morning" / "7am-3pm"
  "Evening" / "3pm-11pm"
  "Overnight" / "11pm-7am"
```

**Slot Cell Variants:**

| State | CSS Class | Background | Border | Content |
|---|---|---|---|---|
| Filled | `.slot` | var(--sky) #EEF0FF | transparent | Staff name bold, "Covered by Lomi" subtitle if applicable |
| Open | `.slot.open` | var(--lemon-2) #FFF4CC | 1px dashed var(--lemon-line) | "Open shift" bold |
| Filling (Lomi working) | `.slot.filling` | var(--lemon) #FFD66B | none | "Offered to staff" bold |
| Empty (add) | `.slot` | transparent | 1px dashed var(--line2) | "+ Add" in var(--faint) |
| Past | `.slot.past` | opacity 0.55 | -- | Same as filled but dimmed |
| My shift | `.slot.mine` | var(--blue) #2F3ED8 | none | Staff name in white |

```
  All slots:
    border-radius: 12px
    padding: 8px 10px
    font-size: 13px
    min-height: 52px
    text-align: left
    cursor: pointer (except past/disabled)

  button.slot:hover → border-color: var(--blue)
```

**Slot Click Action:**
Clicking any slot opens a bottom sheet (`.sheet`) for assignment:

```
  Sheet contents:
    Title: "Tuesday 15, Morning (7am-3pm)" (20px 600)
    Subtitle: home name (14px muted)
    Staff dropdown (<select>):
      Each option: "Staff Name · X shifts this week"
      Pre-selected if slot already filled
    "Save" button (.btn.full)
    "Post as open shift and let Lomi fill it" (.btn.sec.full) with lemon icon
    "Remove this shift" text button (if slot is filled)
    "Cancel" (.btn.sec.full)
```

**Week Navigation:**
```
  Two buttons in page header, right-aligned:
    "Previous week" (.btn.sec.sm)
    "Next week" (.btn.sec.sm)
  Label: "Week of Oct 7" (muted subtitle)
```

**Coverage Activity Feed (below schedule grid):**

Section header: "Coverage activity"

Each coverage event is a card with:
```
  .card.detail
    Header (.hd):
      Title: "Day, Shift (time)" (17px bold)
      Subtitle: "Staff called out · reason" (14px muted)
      Pill: status (Filled by Name / Needs you / Offered)
    Timeline (.timeline):
      Each step: timestamp (66px) + description text
    Candidates:
      Each: staff name + eligibility reason + pill (Accepted/Declined/Offered/Not eligible)
```

**ASCII Wireframe -- Schedule Grid (Desktop):**

```
+--------+------------------------------------------------------+
| Guad   | Schedule                                             |
|        | Oak Street · week of Oct 7   [< Prev] [Next >]      |
|  ...   |                                                      |
|  Sched*| +----------------------------------------------------+
|  ...   | |        Mon 7  Tue 8  Wed 9  Thu10  Fri11  Sat12  S |
|        | |        -----  -----  -----  -----  -----  -----  - |
|        | | Morn   Aisha  Aisha  Marcus Aisha  Marcus [OPEN]  + |
|        | | 7a-3p   ok     ok     ok     ok     ok   shift    A |
|        | |                                                    |
|        | | Eve    Marcus  Priya  Priya  Marcus [FILLING]  +   + |
|        | | 3p-11p  ok     ok     ok     ok    offered   Add  A |
|        | |                                                    |
|        | | Over   Priya   +Add   Priya  Priya  Priya  +Add  + |
|        | | 11p-7a  ok            ok     ok     ok          A |
|        | +----------------------------------------------------+
|        |                                                      |
|        | Coverage activity                                    |
|        | +----------------------------------------------------+
|        | | Friday, Evening (3pm-11pm)                         |
|        | | Marcus Johnson called out · sick     [Offered]     |
|        | |                                                    |
|        | | 5:47am  Marcus called out: sick                    |
|        | | 5:47am  Lomi checked 4 staff against the rules     |
|        | | 5:47am  Offered to 2 eligible people: Priya, Aisha |
|        | |                                                    |
|        | | Priya Patel · Trained, under 40h       [Offered]   |
|        | | Aisha Khouri · Trained, under 40h      [Offered]   |
|        | | David Chen · Already working that day  [Ineligible]|
|        | +----------------------------------------------------+
+--------+------------------------------------------------------+
```

---

### 4.4 Analytics

A four-section analytics dashboard with KPI cards containing embedded bar charts, computed from the event log. All charts use CSS-based bars (no charting library required for MVP).

**Section Layout:**
```
  Each section: section header (.section-h) + KPI card grid (.kpis)

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
```

**KPI Card Anatomy:**
```
  .card.kpi
  padding: 18px 20px
  display: flex
  flex-direction: column
  gap: 10px

  Top row: label (14px 600 muted) + delta indicator (.delta.up or .delta.down, 13px 600)
  Large number: 30px / 600 / line-height 1
  Chart: 4-bar chart (one per week, last 4 weeks)
    .chart: display flex, align-items flex-end, gap 10px, height 120px
    Each bar (.c): flex column, align center, gap 6px
      Value (.v): 12.5px 600
      Bar (.b): width 100%, max-width 46px, border-radius 8px 8px 3px 3px, bg var(--sky)
      Current week bar: bg var(--blue)
      Label (.l): 12px muted (week start date)
```

**Analytics Sections:**

| Section | KPI Cards |
|---|---|
| **Coverage** (subtitle: "Powered by Lomi") | Shifts needing cover, Fill rate %, Average time to fill (min) |
| **Documentation** | Notes signed, Drafted with Lomi %, Minutes to chart, Notes sent back |
| **Care** | Doses given, Refused or held, Incidents, Goal progress (independent rate per goal) |

**Goal Progress Card (special layout within Care section):**
```
  Title: "Goal progress"
  Subtitle: "Independent rate"
  Body: stacked per-person goal bars
    Each: "PersonFirst: Goal text" (13px) + percentage bold + .bar progress bar
    .bar: 6px height, var(--sky) bg, var(--blue) fill
```

**Future Enhancement: SVG Sparklines**
Replace the bar charts with inline SVG sparklines in each KPI card:
```
  <svg width="80" height="24" viewBox="0 0 80 24">
    <polyline points="..." fill="none" stroke="var(--blue)" stroke-width="1.5"/>
  </svg>
  aria-label: "Trend: [description]"
```

**ASCII Wireframe -- Analytics (Desktop):**

```
+--------+------------------------------------------------------+
| Guad   | Analytics                                            |
|        | Oak Street · last 4 weeks, by week starting           |
|  ...   |                                                      |
|  Analy*| Coverage                           Powered by Lomi   |
|  ...   | +-----------+ +-----------+ +-----------+            |
|        | | 4         | | 75%       | | 19 min    |            |
|        | | Shifts    | | Filled    | | Avg fill  |            |
|        | |           | |           | |           |            |
|        | | |_ |_ |_|| | |_ |_ |_|| | |_ |_ |_||            |
|        | | S22 S29 O6| | S22 S29 O6| | S22 S29 O6|            |
|        | +-----------+ +-----------+ +-----------+            |
|        |                                                      |
|        | Documentation                                        |
|        | +--------+ +--------+ +--------+ +--------+         |
|        | | 12     | | 83%    | | 4 min  | | 1      |         |
|        | | Notes  | | w/Lomi | | Chart  | | Sent   |         |
|        | | signed | | draft  | | time   | | back   |         |
|        | | ||||   | | ||||   | | ||||   | | ||||   |         |
|        | +--------+ +--------+ +--------+ +--------+         |
|        |                                                      |
|        | Care                                                 |
|        | +--------+ +--------+ +--------+ +---------------+  |
|        | | 48     | | 3      | | 2      | | Goal progress |  |
|        | | Doses  | | Refusd | | Incid  | | Marcus: Fork  |  |
|        | | given  | | /held  | | ents   | | 75% [=====--] |  |
|        | | ||||   | | ||||   | | ||||   | | Sarah: Walk   |  |
|        | +--------+ +--------+ +--------+ | 60% [====---] |  |
|        |                                   +---------------+  |
+--------+------------------------------------------------------+
```

---

### 4.5 Reports

A single-page list of predefined report types with one-click CSV export.

**Report List:**
```
  .list.card
  Each row: .row with
    Left: avatar.sq (file icon, 44px)
    Center: .grow
      b: report title (15px bold)
      span: description (14px muted)
    Right: "Download CSV" button (.btn.sec.sm)
```

**Available Reports:**

| Report | Title | Description |
|---|---|---|
| notes | Shift and behavior notes | Every note with goal data, signatures and approvals |
| incidents | Incident log | All incidents with notifications and follow-up |
| mar | Medication record | Every dose given, refused or held, with reasons |
| goals | Goal progress | Attempts and independent rate for each goal |
| attendance | Attendance | Services each person received by day |
| coverage | Coverage log | Callouts, who was offered each shift, and who filled it |
| clock | Clock-ins | Clock-in and out times, homes and location checks |

**Future Enhancement: Filters and PDF**
```
  Filter bar above list:
    Date range picker (from/to)
    Home selector
    Individual multi-select
    Staff multi-select

  Export format toggle: CSV (default) | PDF
  PDF: printable format for ISP meetings and guardian updates
```

**ASCII Wireframe -- Reports:**

```
+--------+------------------------------------------------------+
| Guad   | Reports                                              |
|        | Export records for audits, guardians and quality       |
|  ...   | reviews                                              |
|  Repor*|                                                      |
|  ...   | +----------------------------------------------------+
|        | | [file] Shift and behavior notes                    |
|        | |        Every note with goal data,    [Download CSV]|
|        | |        signatures and approvals                    |
|        | |----------------------------------------------------|
|        | | [file] Incident log                                |
|        | |        All incidents with           [Download CSV] |
|        | |        notifications and follow-up                 |
|        | |----------------------------------------------------|
|        | | [file] Medication record                           |
|        | |        Every dose given, refused    [Download CSV] |
|        | |        or held, with reasons                       |
|        | |----------------------------------------------------|
|        | | [file] Goal progress                               |
|        | |        Attempts and independent     [Download CSV] |
|        | |        rate for each goal                          |
|        | |----------------------------------------------------|
|        | | [file] Attendance                                  |
|        | |        Services each person         [Download CSV] |
|        | |        received by day                             |
|        | |----------------------------------------------------|
|        | | [file] Coverage log                                |
|        | |        Callouts, who was offered    [Download CSV] |
|        | |        each shift, and who filled it               |
|        | |----------------------------------------------------|
|        | | [file] Clock-ins                                   |
|        | |        Clock-in/out times, homes    [Download CSV] |
|        | |        and location checks                         |
|        | +----------------------------------------------------+
+--------+------------------------------------------------------+
```

---

### 4.6 Staff Management

Rendered within the Setup tab in the current prototype. In the rebuild, this becomes its own sidebar item under MANAGEMENT.

**Staff Roster List:**
```
  .list.card
  Each row:
    avatar (44px, initials)
    .grow:
      b: staff name + "(you)" suffix if current user
      span: role (capitalized) + "med-certified" if true + home names
    Right: "Edit" button (.btn.sec.sm)
```

**Staff Detail (future: split pane or modal):**

| Field | Type | Notes |
|---|---|---|
| Full name | text input | required |
| Role | choice group | Caregiver / Supervisor / Admin |
| Medication certified | checkbox (.check) | Boolean |
| Homes | checkbox list (.check per home) | Multi-select |
| Phone | text input (future) | For Lomi coverage texts |
| Email | text input (future) | For notifications |

**Add/Edit Staff Form:**
```
  .cv-card.fieldset
    Title: "Edit staff member" or "Add staff" (bold)
    Fields: name, role choice, med-cert checkbox, home checkboxes
    Error display: .callout.bad (if validation fails)
    Actions: "Save" (.btn.sm) + "Cancel" (.btn.sec.sm)
    Helper: "In production, saving here would send this person
             an invitation to sign in." (13px faint)
```

**ASCII Wireframe -- Staff Management:**

```
+--------+------------------------------------------------------+
| Guad   | Setup                                                |
|        | Acme Residential Services                             |
|  ...   |                                                      |
|  Setup*| Staff                                                |
|  ...   | +----------------------------------------------------+
|        | | [AK] Aisha Khouri                                  |
|        | |      Caregiver · med-certified ·    [Edit]         |
|        | |      Oak Street, Pine Road                         |
|        | |----------------------------------------------------|
|        | | [MJ] Marcus Johnson                                |
|        | |      Caregiver · Oak Street         [Edit]         |
|        | |----------------------------------------------------|
|        | | [PP] Priya Patel                                   |
|        | |      Caregiver · med-certified ·    [Edit]         |
|        | |      Oak Street                                    |
|        | |----------------------------------------------------|
|        | | [DC] David Chen (you)                              |
|        | |      Admin · Oak Street, Pine Road  [Edit]         |
|        | +----------------------------------------------------+
|        | [Add staff]                                          |
|        |                                                      |
|        | +----------------------------------------------------+
|        | | Add staff                                          |
|        | |                                                    |
|        | | Full name                                          |
|        | | [_________________________________]                |
|        | |                                                    |
|        | | Role                                               |
|        | | (Caregiver) (Supervisor) (Admin)                   |
|        | |                                                    |
|        | | [x] Medication certified                           |
|        | |                                                    |
|        | | Homes they work at                                 |
|        | | [x] Oak Street                                     |
|        | | [ ] Pine Road                                      |
|        | |                                                    |
|        | | [Save]  [Cancel]                                   |
|        | +----------------------------------------------------+
+--------+------------------------------------------------------+
```

---

### 4.7 Individual Management

Person-centric view with roster grid and detailed person profile with tabbed sub-navigation.

**People Grid (roster view):**
```css
.people {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
```

Each person card in the grid:
```
  .row within .list.card
    avatar (44px)
    .grow:
      b: full name
      span: home name + goal count + medication count
    Right: chevron
    On click: opens person detail view
```

Page header includes "Add a person" button (.btn.sm).

**Person Detail View:**

```
  Header:
    Back button (.iconbtn, "Back to people")
    Large avatar (56x56px)
    Name: 28px serif
    Home: 14px muted
    "Edit details" button (.btn.sec.sm)

  Tabbed navigation (.ptabs):
    horizontal scroll, pill-shaped buttons
    Tabs: Health summary | Goals | Medications | Attendance | Case notes
```

**Tab: Health Summary (overview)**
```
  .card with stacked .kv pairs:
    "What staff should know" → free text
    "Allergies" → text
    "Conditions" → text
    "Diet" → text
    "Doctor" → text
    "Guardian or contact" → text
    "Date of birth" → date
    "Behavior plan" → comma-separated list
```

**Tab: Goals**

Each active goal renders as a standalone card:
```
  .card flex-column
    .kv: Area label (muted) + goal text (17px bold)
    .kv: "How often" → frequency text
    .kv: "Target" → target text
    .kv: "Steps" → numbered list
    .kv: "Progress"
      Text: "X% independent across Y attempts"
      .bar: progress bar (6px, var(--sky) bg, var(--blue) fill)
      Enhancement: SVG sparkline (14-day independence trend)
      Enhancement: trend arrow (up/steady/down)
    Footer: start date + "Stop this goal" text button
```

Add Goal form (below active goals):
```
  .cv-card.fieldset
    Title: "Add a goal"
    Template selector: <select> grouped by area
      (Daily living, Community, Health, Social)
    Goal text: text input
    Grid2: "How often" + "Target"
    Steps: textarea (one per line)
    "Add goal" button (.btn.sm)
```

**Tab: Medications**

Active medications as `.list.card` rows:
```
  Each row:
    avatar.sq with pill icon
    .grow: name (bold) + dose/route/time/since (14px muted)
    "Stop" text button
```

Add Medication form:
```
  .cv-card.fieldset
    Title: "Add a medication"
    Helper: "Enter exactly as written on the prescription or pharmacy label."
    Grid2: Medication name + Dose
    Grid2: Route (default "By mouth") + When (select: Scheduled/As needed)
    Grid2: Time (time input) + As-needed instructions
    Notes: text input (placeholder "with food")
    "Add medication" button (.btn.sm)
```

Medication History:
```
  .card > .timeline
    Reverse chronological entries
    Each: date/time + change description
```

**Tab: Attendance**

7-day table:
```
  table.t
    Columns: Day | Services received
    Each row: day label (bold) + services (comma-separated) + recorder name
    Empty: "Not recorded" (muted)
```

**Tab: Case Notes**

```
  New case note form:
    .cv-card.fieldset
    textarea (placeholder: meetings, calls, plan changes)
    "Save case note" button (.btn.sm)

  Case note history:
    .list.card
    Each row: author + date (bold) + note text (white-space normal)
    Reverse chronological
```

**Person Edit Form (.personForm):**

| Field | Type | Layout |
|---|---|---|
| Full name | text input | full-width |
| Home | select | full-width |
| What staff should know | textarea (min-height 70px) | full-width |
| Date of birth | date input | grid2 left |
| Allergies | text input | grid2 right |
| Conditions | text input | full-width |
| Diet | text input | full-width |
| Doctor | text input | grid2 left |
| Guardian or contact | text input | grid2 right |
| Behaviors in support plan | text input (comma-separated) | full-width |

**ASCII Wireframe -- Person Detail (Goals tab, Desktop):**

```
+--------+------------------------------------------------------+
| Guad   | [<] [Avatar] Marcus King                             |
|        |              Oak Street           [Edit details]     |
|  ...   |                                                      |
|  Peopl*| [Health summary] [Goals*] [Meds] [Attendance] [Case] |
|  ...   |                                                      |
|        | +-------------------------+ +-------------------------+
|        | | DAILY LIVING            | | COMMUNITY               |
|        | | Use fork at meals       | | Order food at restaurant|
|        | |                         | |                         |
|        | | How often: Every meal   | | How often: Weekly       |
|        | | Target: 80% independent | | Target: Independent     |
|        | | Steps:                  | | Steps:                  |
|        | |  1. Pick up fork        | |  1. Read menu           |
|        | |  2. Scoop food          | |  2. Choose item         |
|        | |  3. Bring to mouth      | |  3. Tell server         |
|        | |                         | |                         |
|        | | Progress                | | Progress                |
|        | | 75% independent (12 att)| | 40% independent (5 att) |
|        | | [=========-------]      | | [=====----------]       |
|        | |                         | |                         |
|        | | Started Oct 1  [Stop]   | | Started Sep 15  [Stop]  |
|        | +-------------------------+ +-------------------------+
|        |                                                      |
|        | +----------------------------------------------------+
|        | | Add a goal                                         |
|        | | Template: [Choose a template v]                    |
|        | | Goal: [________________________]                   |
|        | | How often [_________]  Target [_________]          |
|        | | Steps (one per line): [textarea_________]          |
|        | | [Add goal]                                        |
|        | +----------------------------------------------------+
+--------+------------------------------------------------------+
```

---

### 4.8 Agency Settings

Renders within the Setup sidebar item. Contains agency configuration, home management, and staff management (see 4.6).

**Sections:**

1. **Homes** -- List of group homes with name, address, GPS radius
   - Each row: pin icon + name + address + GPS status
   - "Edit" button per row
   - "Add a home" button below list
   - Home edit form: name, address, lat/lng, radius, "Use my location" button

2. **Staff** -- See Section 4.6 above

3. **Agency Profile (future):**
   - Agency name, state, notification email
   - Charting preset toggle: "Default" / "Therap terminology"
   - Data retention settings

4. **Notification Preferences (future):**
   - Per-event-type toggles for push/email/SMS
   - Incident severity thresholds

5. **Data Export (future):**
   - "Export all data" button with full CSV download
   - "Your data belongs to your agency" messaging

---



---

## 5. Component Library

Every component with variants, states, and exact dimensions. A developer should be able to implement any component from this specification alone.

> **Note:** This library specifies both existing components (ported from styles.css) and new components (marked **NEW**). Where values differ from the current MVP prototype, the Critical Fixes table in section 13 captures the delta. New components must be created during the rebuild.

---

### 5.1 Buttons

**Size Scale:**

| Size | Class | Min-Height | Padding | Font-Size | Touch Target |
|---|---|---|---|---|---|
| Small | `.btn.sm` | 44px (currently 42px in MVP -- see Critical Fixes #5) | 0 16px | 14px | 44x44px |
| Medium (default) | `.btn` | 52px | 0 22px | 16px | 52x52px |
| Large **NEW** | `.btn.lg` | 56px | 0 28px | 17px | 56x56px |
| Full-width | `.btn.full` | 52px | 0 22px | 16px | 52x full-width |

**Variant Spec Table:**

| Variant | Class | Background | Text Color | Border | Hover BG | Active BG |
|---|---|---|---|---|---|---|
| Primary | `.btn` | var(--blue) #2F3ED8 | #FFFFFF | none | var(--blue-d) #2230B8 | #1A2694 |
| Secondary | `.btn.sec` | var(--card) #FFFFFF | var(--ink) #1C1B4B | 1px solid var(--line2) | border-color: var(--blue) | bg: var(--sky) |
| Ghost/Text | `.textbtn` | transparent | var(--blue) | none | text-decoration: underline | opacity 0.8 |
| Danger **NEW** | `.btn.danger` | var(--bad) #B42318 | #FFFFFF | none | #9A1E14 | #7D1810 |
| Success **NEW** | `.btn.ok` | var(--ok) #1F7A4D | #FFFFFF | none | #186B40 | #145C36 |

**Note on `.btn.lemon`:** This class exists in styles.css and design-system.md. The contrast ratio of #FFD66B background with #1C1B4B text is approximately 11.5:1, which passes WCAG AAA. The earlier claim of 2.1:1 was incorrect. However, lemon yellow should remain restricted to Lomi brand elements (orb, FAB, callouts) for visual discipline. Do not use `.btn.lemon` for general-purpose actions.

**Icon-Only Button (.iconbtn):**
```
  width: 44px
  height: 44px
  flex: none
  border: 0
  background: transparent
  border-radius: 999px
  display: flex
  align-items: center
  justify-content: center
  color: var(--ink)

  :hover → background: var(--sky)
  :active → background: color-mix(in srgb, var(--blue) 15%, transparent)
  MUST have aria-label
```

**Icon+Label Button:**
```
  gap: 10px between icon (20px SVG) and label text
  Icon inherits button text color
```

**Loading State:**
```
  Label replaced with .dots animation (3 pulsing circles, 8px each)
  Button width preserved: min-width matches text content width
  pointer-events: none
  aria-busy="true"
  aria-label updated to "[action] in progress"
```

**Disabled State:**
```
  opacity: 0.5
  cursor: default
  No hover effect
  aria-disabled="true" (prefer over HTML disabled)
```

**Focus State (all buttons):**
```
  :focus-visible {
    outline: 3px solid var(--blue);
    outline-offset: 2px;
    border-radius: 10px;
  }
```

**Active/Pressed Feedback:**
```
  :active {
    transform: scale(0.98);
    transition: transform 100ms;
  }
```

---

### 5.2 Inputs

**Text Input (.input):**

| Property | Value |
|---|---|
| Width | 100% |
| Min-height | 50px |
| Padding | 12px 14px |
| Border-radius | 14px |
| Font-size | 16px (prevents iOS auto-zoom) |
| Background | var(--card) #FFFFFF |
| Border | 1px solid var(--line2) #DADDF3 |
| Color | var(--ink) #1C1B4B |

| State | Border | Shadow |
|---|---|---|
| Default | var(--line2) | none |
| Hover | color-mix(in srgb, var(--blue) 40%, var(--line2)) | none |
| Focus | var(--blue) | 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent) |
| Error | var(--bad) | 0 0 0 3px color-mix(in srgb, var(--bad) 18%, transparent) |
| Disabled | var(--line) | none; opacity 0.5; bg var(--line) |

**Textarea:**
```
  Inherits .input styles
  min-height: 96px (standard), 70px (compact), 120px (compose)
  resize: vertical
  line-height: 1.5
```

**Note Section Textarea (.cv-text, auto-growing inline):**
```
  border: 0
  background: transparent
  padding: 4px 6px
  margin: -4px -6px
  border-radius: 8px
  font-size: 15px
  line-height: 1.5
  resize: none
  min-height: 26px
  field-sizing: content (auto-grow)

  :hover → bg: color-mix(in srgb, var(--sky) 55%, transparent)
  :focus → bg: var(--sky); outline: none
  .flagged → bg: #FFE9A8; box-shadow: inset 0 -2px 0 #B45A14
```

**Number Input (clinical):**
```
  inputmode="numeric" for integers (pulse, BP)
  inputmode="decimal" for decimals (temp, weight)
  pattern="[0-9]*" for older iOS
  Unit suffix (.unit): <em> positioned absolute right at 14px, 14px faint
    Input gets padding-right: 58px
```

**Date/Time Input:**
```
  type="date" / type="time" → native OS pickers
  Same .input styling
  Do NOT use custom date picker libraries
```

**Select (.input as select):**
```
  Same dimensions and styling as text input
  Native OS picker on mobile (correct for accessibility)
  Reserve for lists with 10+ options only
```

**Segmented Control (.seg):**
```
  Container:
    display: flex
    background: var(--sky)
    border-radius: 14px
    padding: 4px
    gap: 4px

  Segment button:
    flex: 1
    border: 0
    background: transparent
    border-radius: 11px
    min-height: 44px (currently 42px in MVP -- see Critical Fixes #7)
    font-weight: 600
    font-size: 14px
    color: var(--muted)

  Active ([aria-pressed="true"]):
    background: var(--card)
    color: var(--blue)
    box-shadow: 0 1px 3px rgba(28,27,75,.12)

  ARIA: role="group" on container, aria-pressed on buttons
```

**Choice Group / Pill Selector (.choice):**
```
  Container:
    display: flex
    flex-wrap: wrap
    gap: 8px
    role="group"

  Chip button:
    border: 1px solid var(--line2)
    background: var(--card)
    border-radius: 999px
    padding: 8px 14px
    font-size: 14px
    font-weight: 600
    min-height: 44px (currently 42px in MVP, fix pending)

  Selected ([aria-pressed="true"]):
    background: var(--ink)
    color: var(--bg)
    border-color: var(--ink)
```

**Toggle / Checkbox (.check):**
```
  Container:
    display: flex
    align-items: center
    gap: 12px
    padding: 12px 14px
    border: 1px solid var(--line2)
    border-radius: 14px
    background: var(--card)
    font-size: 15px

  Checkbox input:
    width: 22px
    height: 22px
    accent-color: var(--blue)
    flex: none
```

**Search Input (new):**
```
  Same as .input
  Left: search icon (magnifying glass, 18px, var(--faint)), padding-left 40px
  Right: clear button (X, 18px), appears when value is non-empty
  debounce: 300ms on input event
```

**Field Wrapper (.field):**
```
  display: flex
  flex-direction: column
  gap: 6px

  Label: 13px / 600 / var(--muted) / linked via for/id
  Helper text: 13px / 400 / var(--muted)
  Error text: 13px / 600 / var(--bad) / role="alert" / aria-describedby
  Required: asterisk after label, color var(--bad)
```

**Grid Layout (.grid2):**
```
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 12px

  @media (max-width: 375px) { grid-template-columns: 1fr; }
  *(Rebuild target -- this media query does not exist in current styles.css)*
```

---

### 5.3 Cards

**Card Variants:**

| Variant | Class | Border-Radius | Background | Border | Shadow | Padding |
|---|---|---|---|---|---|---|
| Base | `.card` | 20px | var(--card) | 1px solid var(--line) | var(--shadow) | via .pad: 16px 18px |
| Canvas | `.cv-card` | 18px | var(--card) | 1px solid #E7E8F5 | none | 16px 18px |
| Stat | `.card.stat` | 20px | var(--card) | 1px solid var(--line) | var(--shadow) | 16px 18px |
| KPI | `.card.kpi` | 20px | var(--card) | 1px solid var(--line) | var(--shadow) | 18px 20px |
| Lomi | `.lomi-card` | 20px | var(--lemon-2) | 1px solid var(--lemon-line) | none | 18px 20px |
| Alert **NEW** | `.card.alert` | 20px | var(--bad-bg) | 1px solid var(--bad) | none | 16px 18px |
| Highlighted | `.card` + inline sky | 20px | var(--sky) | 1px solid var(--line) | var(--shadow) | 16px 18px |

**Person Card (.cv-row / .clientcard):**
```
  width: 100%
  text-align: left
  display: flex
  align-items: center
  gap: 14px
  padding: 14px 16px (cv-row: 16px 18px)
  border-radius: 18px
  background: var(--card)
  border: 1px solid var(--line)
  box-shadow: var(--shadow) (clientcard only)

  :hover → border-color: color-mix(in srgb, var(--blue) 40%, transparent)

  Left: avatar (44px, initials, bg var(--sky), color var(--blue))
  Center (.grow): flex column, gap 3px
    b: name (16px 600)
    span: subtitle (14px muted, ellipsis overflow)
  Right: status indicator
    .cv-chip (To do: lemon bg, 12px 700)
    .cv-chip.bad (Fix: bad-bg, bad color)
    Done checkmark SVG (26px circle, blue bg, white checkmark)

  Mobile: full-width, stacked in .cv-list (flex column, gap 10px)
  Desktop: .cv-list becomes 2-column grid (gap 14px)
```

**Medication Card (caregiver MAR):**
```
  .cv-card flex-column gap-12px
  Header: med name (17px bold) + dose/route/time (14px muted) + status pill
  Action area (if unrecorded):
    "Mark as given" primary full-width button
    Grid2: "Refused" secondary + "Held" secondary
  Recorded state: timestamp + recorder name (muted), no buttons
```

**Schedule Slot Card (.slot):**
```
  border-radius: 12px
  padding: 8px 10px
  font-size: 13px
  min-height: 52px
  text-align: left

  Variants:
    Filled: bg var(--sky), staff name bold
    Open: bg var(--lemon-2), border 1px dashed var(--lemon-line)
    Filling: bg var(--lemon), solid border
    Mine: bg var(--blue), color #fff
    Past: opacity 0.55
    Empty: bg transparent, border 1px dashed var(--line2)

  button.slot:hover → border-color: var(--blue)
```

**Message Bubble (.msg):**
```
  max-width: 82%
  padding: 10px 14px
  border-radius: 18px
  font-size: 15px
  line-height: 1.45

  .msg.them: bg var(--card), border 1px solid var(--line), left-aligned,
             bottom-left-radius 6px
  .msg.me: bg var(--blue), color #fff, right-aligned,
           bottom-right-radius 6px
  .msg.lomi: bg var(--lemon-2), border 1px solid var(--lemon-line),
             left-aligned, bottom-left-radius 6px

  Sender label (.who): 12px 600 muted, margin-bottom 2px
```

**Interactive States (all tappable cards):**
```
  Default: as specified per variant
  Hover (desktop): border-color shifts toward var(--blue)
  Pressed: border-color var(--blue), subtle scale(0.99) for 80ms
  Selected (split pane): background var(--sky), aria-current="true"
  Focus-visible: 3px solid var(--blue) outline, 2px offset
```

**Action Patterns:**
```
  Tap/click: navigates to detail view (person detail, note detail, etc.)
  Swipe right (mobile, future): quick action (mark med as given)
  Long-press (mobile, future): context menu
  Overflow menu (desktop, future): three-dot icon button, dropdown menu
```

---

### 5.4 Lists

**Base List (.list):**
```
  display: flex
  flex-direction: column

  Within a card (.list.card):
    first .row: border-radius 20px 20px 0 0
    last .row: border-radius 0 0 20px 20px
```

**List Row (.row):**
```
  display: flex
  align-items: center
  gap: 14px
  padding: 14px 16px
  border: 0
  background: none
  width: 100%
  text-align: left
  border-top: 1px solid var(--line) (except first child)
  min-height: 64px

  Interactive (button.row, a.row):
    :hover → background: color-mix(in srgb, var(--sky) 55%, transparent)
    cursor: pointer

  Content structure:
    avatar or icon (44px)
    .grow (flex: 1, min-width: 0)
      b: primary text (15px 600)
      span: secondary text (14px muted, ellipsis)
    Right: pill or action button + chevron (18px, var(--faint))
```

**Filter Bar (above filterable lists):**
```
  display: flex
  gap: 8px
  padding: 0 0 12px
  flex-wrap: wrap
  align-items: center

  Search input: flex 1, min-width 200px
  Filter pills: .choice buttons or .seg segmented control
  Sort: icon button (sort arrows) with dropdown
```

**Empty State (.empty):**
```
  padding: 28px 18px
  text-align: center
  color: var(--muted)
  font-size: 15px

  Enhanced (rebuild):
    padding: 40px 20px
    Illustration: simple SVG (60px), muted
    Heading: 17px 600 var(--ink)
    Description: 15px 400 var(--muted), max-width 280px
    CTA button: optional, centered
```

**Loading Skeleton** **NEW**:
```
  3-5 skeleton rows matching real row geometry:
    Circle (avatar placeholder): 44px, bg #E8E8F0, border-radius 999px
    Bar (name placeholder): 120px x 14px, bg #E8E8F0, border-radius 4px
    Bar (subtitle placeholder): 180px x 12px, bg #E8E8F0, border-radius 4px
    Bar (pill placeholder): 60px x 22px, bg #E8E8F0, border-radius 999px

  Shimmer animation:
    background: linear-gradient(90deg, #E8E8F0 25%, #F0F0F8 50%, #E8E8F0 75%)
    background-size: 200% 100%
    animation: shimmer 1.5s infinite ease-in-out

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    Static gray bars at opacity 0.5, no animation
  }
```

**Pagination (for lists > 25 items)** **NEW**:
```
  "Load more" button (.btn.sec.full) at bottom of list
  Shows: "Showing X of Y items"
  NOT auto-infinite-scroll (causes scroll position confusion)
```

---

### 5.5 Data Visualization

**Progress Ring (SVG donut)** **NEW**:
```
  Sizes: 48px (small) / 72px (large) diameter
  Track circle: stroke var(--sky), stroke-width 4, fill none
  Progress arc: stroke-dasharray computed from percentage
    cx, cy: center
    r: (diameter/2 - stroke-width)
    circumference: 2 * pi * r
    dash: circumference * percentage / 100
    gap: circumference - dash
    transform: rotate(-90deg) from center

  Color by value (generic progress rings, e.g. goal progress):
    >= 80%: stroke var(--ok) #1F7A4D
    50-79%: stroke var(--lemon) #FFD66B
    < 50%: stroke var(--bad) #B42318

  Note: The compliance score ring in section 4.1 uses stricter thresholds
  (>=90%/70-89%/<70%) because regulatory standards require higher compliance.
  When implementing, use the threshold set appropriate to the context.

  Center text: percentage (14px 600, small) or (18px 600, large)
  Accessibility: role="img", aria-label="X% independent"
```

**Sparkline (inline SVG)** **NEW**:
```
  Width: 80px
  Height: 24px
  viewBox: "0 0 80 24"
  No axes, no labels
  <polyline points="..." fill="none" stroke="var(--blue)" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round"/>
  Optional data points: <circle r="2" fill="var(--blue)"/>
  Accessibility: aria-label describing trend in text
```

**Trend Arrow** **NEW**:
```
  Inline SVG, 16px
  Computation: compare last-2-weeks avg vs prior-2-weeks avg
    Improving (> +5%): upward arrow, color var(--ok)
    Steady (-5% to +5%): rightward arrow, color var(--muted)
    Declining (< -5%): downward arrow, color var(--bad)
  Font: 13px 600, displayed next to arrow
  Example: "^+3%" in green, "v-2%" in red
```

**Progress Bar (.bar / .cv-bar):**
```
  Container:
    height: 6px (.bar) or 8px (.cv-bar)
    background: var(--sky)
    border-radius: 999px
    overflow: hidden

  Fill (<i> element):
    display: block
    height: 100%
    background: var(--blue)
    border-radius: 999px
    transition: width 0.4s ease

  @media (prefers-reduced-motion: reduce) { transition: none }
```

**Bar Chart (.chart):**
```
  display: flex
  align-items: flex-end
  gap: 10px
  height: 120px
  padding-top: 6px

  Each column (.c):
    flex: 1
    display: flex
    flex-direction: column
    align-items: center
    gap: 6px
    height: 100%
    justify-content: flex-end

    Value (.v): 12.5px 600
    Bar (.b): width 100%, max-width 46px, border-radius 8px 8px 3px 3px
      Default: bg var(--sky)
      Current period (last child): bg var(--blue)
      Height: computed as percentage of max value, min 4px
    Label (.l): 12px muted

  Accessibility: role="img", aria-label with all data points as text
```

**MAR Grid (supervisor desktop medication view):** *(Rebuild target, Phase 4 item #31 -- not in current MVP. Neither the .mar-grid CSS class nor any grid implementation exists.)*
```css
.mar-grid {
  display: grid;
  grid-template-columns: 160px repeat(7, minmax(0, 1fr));
  gap: 2px;
  min-width: 700px;
}
```

```
  Row header: medication name (14px bold) + dose (13px muted)
  Column header: day labels, today highlighted var(--blue)

  Cell: 44x44px minimum, centered content
    Given: blue filled circle (24px) with white checkmark
    Refused: "R" in red circle (24px), bg var(--bad-bg), color var(--bad)
    Held: "H" in amber circle (24px), bg var(--lemon-2), color var(--ink)
    Not recorded: hollow gray circle (24px), border 2px solid var(--line2)
    Not applicable: em dash (muted)

  Below grid: compliance bar
    Full-width .bar showing percentage given
    >= 95%: fill var(--ok)
    90-94%: fill var(--lemon)
    < 90%: fill var(--bad)
```

**Line Chart (vital sign trends, future):**
```
  Container: .cv-card, height 140px
  Reference bands: SVG rects with low opacity
    Normal: fill var(--ok-bg) at 30% opacity
    Alert: fill var(--bad-bg) at 30% opacity
  Data line: SVG polyline, stroke var(--blue), stroke-width 2
  Data points: circles 6px
    Normal: fill var(--blue)
    Out-of-range: fill var(--bad)
  X-axis: date labels (13px muted) at bottom
  No Y-axis labels on mobile (reference bands communicate range)
  Touch: tap data point for tooltip with exact value
  Accessibility: role="img", aria-label with all values
  Zero library dependency: pure SVG
```

---

### 5.6 Navigation Components

**Bottom Tab Bar -- Caregiver Mobile (.dock):**

> *Note: styles.css also contains a legacy `.nav` class (V3 5-column layout with `.lomi-fab`) which is superseded by `.dock` + `.tabs4` (V4). The `.nav` and `.lomi-fab` classes should be considered deprecated and removed during the rebuild.*

```
  Position: fixed bottom
  Width: min(420px, 100%)
  Background: var(--card)
  Border-top: 1px solid var(--line)
  Z-index: 10
  Padding-bottom: env(safe-area-inset-bottom)
```

"Talk to Lomi" button (above tabs):
```
  .talk
  width: 100%
  min-height: 56px
  border: 0
  border-radius: 999px
  background: var(--blue)
  color: #fff
  font-weight: 600
  font-size: 17px
  display: flex
  align-items: center
  justify-content: center
  gap: 12px

  Contains: lemon icon (30px) + "Talk to Lomi" text
  :hover → bg: var(--blue-d)
```

Tab bar (.tabs4):
```
  display: grid
  grid-template-columns: repeat(4, 1fr)
  padding: 2px 6px 8px

  Each tab button:
    border: 0
    background: none
    display: flex
    flex-direction: column
    align-items: center
    gap: 3px
    font-size: 12px
    font-weight: 600
    color: var(--faint)
    padding: 6px 0
    min-height: 52px

  Active [aria-current="page"]: color var(--blue)
  Icons: 22px SVG (Today/Notes/Shifts/Me)
```

| Tab | Icon | Label | Badge |
|---|---|---|---|
| Today | calendar-with-check | Today | never |
| Notes | document | Notes | red dot if returned notes |
| Shifts | clock | Shifts | red dot if coverage pending |
| Me | person | Me | never |

**Notification Dot (.dot):**
```
  position: absolute
  top: 6px
  left: calc(50% + 8px)
  width: 9px
  height: 9px
  border-radius: 50%
  background: var(--bad)
  border: 2px solid var(--card)
```

**Sidebar -- Supervisor Desktop (.side):**
See section 4.1 for full specification.

**Sidebar -- Caregiver Desktop (.cg-side):**
```
  Appears at >= 900px breakpoint
  Width: 248px
  Border-right: 1px solid var(--line)
  Position: sticky, top 0, height calc(100vh - 50px)
  Background: var(--bg)
  Padding: 22px 16px

  Contents:
    Wordmark: "Guad" serif 26px
    "Talk to Lomi" button (same styling, min-height 50px, font 16px)
    Nav items (.cg-nav): same styling as supervisor sidebar items
    Bottom: user info (avatar + name + clock status)

  At >= 900px, .dock (bottom tabs) is hidden (display: none)
```

**Page Header / App Bar (.appbar):**
```
  display: flex
  align-items: center
  gap: 8px
  padding: 16px 16px 8px
  min-height: 64px

  Back button: .iconbtn (44x44px) with back arrow SVG
  Title area (.title): flex column
    b: page title (17px 600)
    span: subtitle (13px muted)
  Right: action icon buttons (messages, settings)
```

**Horizontal Tab Bar (.ptabs):**
```
  display: flex
  gap: 6px
  overflow-x: auto
  padding-bottom: 2px
  scrollbar-width: none

  Each tab button:
    flex: none
    border: 1px solid var(--line2)
    background: var(--card)
    border-radius: 999px
    padding: 8px 14px
    font-weight: 600
    font-size: 14px
    min-height: 40px
    white-space: nowrap

  Active [aria-pressed="true"]:
    background: var(--ink)
    color: var(--bg)
    border-color: var(--ink)
```

**Section Headers (.section-h):**
```
  display: flex
  justify-content: space-between
  align-items: baseline
  gap: 10px
  margin: 2px 4px -8px

  h2: 15px 600
  span: 13px muted
```

---

### 5.7 Feedback Components

**Toast / Snackbar (.toast):**
```
  position: fixed
  left: 50%
  bottom: calc(110px + env(safe-area-inset-bottom))
  transform: translateX(-50%)
  background: var(--ink) #1C1B4B
  color: var(--bg)
  padding: 12px 18px
  border-radius: 999px
  font-weight: 600
  font-size: 14px
  z-index: 40
  width: max-content
  max-width: calc(100vw - 32px)
  text-align: center
  box-shadow: 0 10px 30px -10px rgba(0,0,0,.4)

  Auto-dismiss: 2.8 seconds (matches design-system.md)
  Caregiver context (.toast.cg): bottom 200px (above dock)
  Desktop: bottom 28px

  Animation (enter): translateY(20px) + opacity 0 → translateY(0) + opacity 1, 200ms
  Animation (exit): reverse, 150ms
  Role: role="status" (informational), role="alert" (error)
```

**Alert Banner / Callout (.callout):**

| Variant | Class | Background | Border |
|---|---|---|---|
| Warning | `.callout.warn` | var(--lemon-2) | 1px solid var(--lemon-line) |
| Info | `.callout.info` | var(--sky) | 1px solid color-mix(in srgb, var(--blue) 25%, transparent) |
| Error | `.callout.bad` | var(--bad-bg) | 1px solid color-mix(in srgb, var(--bad) 25%, transparent) |

```
  border-radius: 18px
  padding: 14px 16px
  display: flex
  gap: 12px
  align-items: flex-start
  font-size: 15px

  Content: icon (20px SVG) + .body (flex column, gap 10px)
  Actions (.acts): flex, gap 8px, flex-wrap wrap
```

**Confirmation Dialog (bottom sheet pattern):**
```
  All destructive or commitment actions use a bottom sheet, NOT browser confirm()
  Pattern:
    Sheet title (20px 600)
    Explanation text (15px)
    Primary action button
    Cancel button (.btn.sec.full or .textbtn)

  Examples:
    Sign note: attestation checkbox + "Sign and submit" button
    Clock out: "Clock out of [home]?" + confirm/cancel
    Stop goal: "Stop tracking this goal?" + Stop/Cancel
```

**Loading Skeleton (component-level):**
```
  Gray pulsing placeholder bars matching content geometry
  Card: 18px radius rectangle, 100% width, bg #E8E8F0, shimmer animation
  Row: circle (44px) + bars (120px + 180px) + pill (60px)
  Stat: large bar (80px x 30px) + small bar (100px x 14px)

  Animation: opacity 0.4 to 0.7, 1.5s infinite ease-in-out
  Reduced motion: static at 0.5 opacity
```

**Error State:**
```
  Full-screen: centered layout
    Error icon (alert triangle, 48px, var(--bad))
    Heading: "Something went wrong" (17px 600)
    Description: error reference ID (never PHI)
    "Try again" button + "Go back" text button

  Inline: red text below failed component
    role="alert"
    color: var(--bad)
    font-size: 13px 600
```

**Sync Status Indicator** **NEW**:
```
  Position: app bar, right side
  Size: 8px diameter dot

  States:
    Synced: no dot visible (clean state)
    Pending: amber dot, tappable → "3 changes waiting to sync"
    Offline: gray dot with "Offline" tooltip

  NEVER: red banner, disabled inputs, blocking spinner, word "error" for offline
```

**Draft Saved Indicator** **NEW**:
```
  Position: bottom of compose/review screens
  Layout: flex, gap 4px, align center
  Content: checkmark icon (12px) + "Draft saved" + relative time
  Colors:
    Saved: var(--ok) icon, var(--muted) text
    Saving: pulsing dot, "Saving..." text
  Updates: on every auto-save (500ms debounce)
```

---

### 5.8 Overlays

**Bottom Sheet (.sheet + .scrim):**

```
  Scrim:
    position: fixed
    inset: 0
    background: rgba(18, 18, 46, 0.45)
    z-index: 30
    display: flex
    align-items: flex-end
    justify-content: center

  Sheet:
    background: var(--card)
    width: min(420px, 100%)
    border-radius: 26px 26px 0 0
    padding: 10px 20px calc(22px + env(safe-area-inset-bottom))
    display: flex
    flex-direction: column
    gap: 14px
    max-height: 85vh
    overflow: auto

  Desktop (>= 700px):
    .scrim { align-items: center; }
    .sheet { border-radius: 26px; } /* all corners rounded */

  Grab handle (.grab):
    width: 40px
    height: 5px
    border-radius: 9px
    background: var(--line2)
    align-self: center
    margin-bottom: 4px

  Title: 20px 600
```

**Snap Points (future SvelteKit implementation):**
```
  Peek: 25% viewport height (title + primary action)
  Half: 50% viewport height (most content)
  Full: 90% viewport height (all content, scrollable)

  Swipe-down: velocity-based dismiss vs snap-back
  Fast swipe (> 500px/s): dismiss
  Slow swipe: snap to nearest point
```

**Focus Management:**
```
  Opening: focus moves to sheet title or first interactive element
  Tab trap: Tab cycles within sheet, does not escape
  Escape key: closes sheet
  Closing: focus returns to trigger element
  aria-modal="true", role="dialog", aria-labelledby="sh-t"
```

**Modal Dialog (desktop only):**
```
  Same as bottom sheet on desktop: centered, border-radius 26px, max-width 480px
  Scrim click: closes modal
  Used for: person edit, staff edit, goal add, medication add
```

**Dropdown Menu (new, for supervisor actions):**
```
  Trigger: icon button (three dots or chevron-down)
  Menu:
    background: var(--card)
    border: 1px solid var(--line)
    border-radius: 14px
    box-shadow: var(--shadow)
    padding: 4px
    min-width: 180px
    max-width: 240px
    z-index: 20

  Menu items:
    padding: 10px 14px
    font-size: 15px
    font-weight: 400
    border-radius: 10px
    :hover → bg: var(--sky)

  Destructive items: color: var(--bad)
  Divider: 1px solid var(--line), margin: 4px 0
  Max visible: 8 items, scroll for more
```

**Tooltip (new):**
```
  Trigger: hover (desktop), long-press (mobile)
  Position: above trigger, centered, 8px gap
  Background: var(--ink)
  Color: var(--bg)
  Padding: 6px 12px
  Border-radius: 8px
  Font-size: 13px
  Max-width: 200px
  Arrow: 6px CSS triangle pointing down
  Role: role="tooltip", aria-describedby on trigger
```

---

> **Section numbering note:** This file contains sections 4, 5, 7, 11, 12, and 13. Section 6 (AI/Lomi UX) and Section 8 (Offline & PWA UX) are in frontend-spec-2.md. Sections 9 (Accessibility) and 10 (Dark Mode) are in frontend-spec-1.md. The numbering is intentionally shared across all three frontend-spec files.



---

## 6. AI/Lomi UX

---

### 6.1 Voice-to-Note Flow

**Design principle:** Lomi should feel like autocorrect, not ChatGPT. The DSP should use Guad for a week before thinking "wait, this is using AI?"

**Mic button placement (current prototype):**

The mic button lives inside the compose screen as a "Speak"/"Pause" secondary-style button in the action bar. This requires navigating to a dedicated compose screen first.

**Mic button spec:**

| Property | Value |
|----------|-------|
| Size | 52px height (current `.btn.sec` in action bar). Future: 64px circular FAB for standalone mic |
| Position | Action bar, left of "Done, write my note" button |
| Idle state | `.btn.sec` styling: white bg, dark text, 1px border `var(--line2)`, "Speak" label |
| Recording state | Label changes to "Pause". Orb above goes `.live` (pulsing rings). Waveform appears. |
| Disabled state | When `MediaRecorder` unavailable: button hidden entirely, textarea prompt: "Type your note" |

**Recording state UI:**

- Lomi orb: rings pulse (scale 1.0 -> 1.25, 2.4s ease-in-out infinite)
- Status text: "Lomi is listening" (serif 26px)
- Waveform: 10 bars animating (see 3.2 compose screen spec)
- Transcript textarea receives text after recording stops (batch, via Whisper API)
- Duration: no timer in current prototype. **Enhancement:** add elapsed time display (MM:SS) next to the waveform, 14px `var(--muted)`, `font-variant-numeric: tabular-nums`

**Post-recording AI processing:**

- Compose screen replaced by thinking state: orb + "Lomi is writing your note" + dots animation
- Processing indicator: three-dot animation (`.dots`): 3 circles, 8px, `var(--blue)`, staggered opacity animation (1s infinite)
- Target latency: 3-8 seconds
- On completion: screen transitions to review screen with structured sections

**Future enhancement -- inline recording:**

Instead of a separate compose screen, embed a mic FAB (56px circle, `var(--lemon)` bg, mic icon) in the bottom-right corner of the note form. Tapping starts recording with a minimal bar (48px height) at the bottom showing red dot + elapsed time + "Done" button. Note form fields show skeleton shimmer while waiting. Fields populate progressively from top to bottom as each section completes (150ms fade-in per field).

**ASCII wireframe -- Recording state:**

```
+--------------------------------------+
| [<] Marcus King                      |
|     Shift note - Oak Street          |
+--------------------------------------+
|  Try covering:                       |
|  [Meals] [Mood] [Goals] [Unusual]    |
|                                      |
|        +----------------+            |
|        |   [ring1]      |            |
|        |  [ring2]       |  PULSING   |
|        |  [lemon]       |            |
|        +----------------+            |
|                                      |
|      Lomi is listening               |
|       Speak naturally                |
|                                      |
|     | | | | | | | | | |    0:34     |
|                                      |
| +----------------------------------+ |
| | LIVE TRANSCRIPT                  | |
| | Marcus had a good lunch...       | |
| +----------------------------------+ |
|                                      |
+--------------------------------------+
| [  Pause  ] [Done, write my note]    |
+--------------------------------------+
```

**ASCII wireframe -- Post-processing thinking state:**

```
+--------------------------------------+
| [<] Marcus King                      |
|     Shift note - Oak Street          |
+--------------------------------------+
|                                      |
|                                      |
|        +----------------+            |
|        |   [ring1]      |            |
|        |  [ring2]       |  SLOW PULSE|
|        |  [lemon]       |            |
|        +----------------+            |
|                                      |
|    Lomi is writing your note         |
|              . . .                   |
|                                      |
|                                      |
+--------------------------------------+
```

---

### 6.2 AI Draft Review Interface

The review screen (section 3.2 Step 4) IS the AI draft review interface. There is no separate "AI review" screen.

**Structured output in editable sections:**

Each section of the note card (`.cv-card.cv-note`) contains:
- Label (`.cv-lbl`): 12px/700, uppercase, letter-spacing .06em, `var(--muted)`. E.g., "ACTIVITIES", "MEALS", "MOOD", "HEALTH AND SAFETY"
- Textarea (`.cv-text`): AI-generated text, editable. 15px, line-height 1.5. Auto-grows with content. Tap to edit inline.

**AI-drafted indicator:**

- Current prototype: the app bar title says "Review Lomi's draft" when `fromLomi` is true
- The note card itself has no per-section AI indicator -- text appears as the DSP's own content
- The audit trail (visible only to supervisors, at the bottom of the note detail) records: "Drafted with Lomi, reviewed and signed" vs "Written and signed"
- Design rationale: once the DSP signs the attestation, the note is theirs. Per-section "AI drafted" badges would undermine ownership

**Ghost text pattern (future enhancement):**

AI-filled sections appear at opacity 0.85 (slightly faded). When the DSP taps into any field, text transitions to opacity 1.0 (150ms ease), signaling "you own this now." No italic, no sparkle icons -- subtle opacity shift only.

**Original transcript reference (Rebuild target -- not in MVP):**

> **Note:** The MVP code (V.review in app-caregiver.js) does not render a collapsible transcript element. This is a planned enhancement for the SvelteKit rebuild.

- Collapsible "What I said" disclosure at the top of the review form
- Collapsed by default after AI processing completes
- Contains the raw transcript text in 14px `var(--muted)`, monospace feel
- 95% of users will never expand it

**Per-section editing:**

- Tap any section textarea to edit inline
- No accept/reject buttons per section (too noisy)
- Only interaction: edit text, or leave as-is
- Vague language flags (`.cv-flag`) serve as the quality signal
- "Edit" button in action bar focuses the first textarea

**ASCII wireframe -- Review with AI draft:**

```
+--------------------------------------+
| [<] Review Lomi's draft              |
|     Marcus - Shift note - Oct 11     |
+--------------------------------------+
| +----------------------------------+ |
| | ACTIVITIES                       | |
| | Marcus had a good day. He helped | |
| | set the table and participated   | |
| | in the cooking activity.         | |
| |                                  | |
| | MEALS                            | |
| | Ate all his chicken and rice at  | |
| | lunch. Drank two glasses of      | |
| | water throughout the afternoon.  | |
| |                                  | |
| | MOOD                             | |
| | Marcus was in a positive mood    | |
| | throughout the shift. He smiled  | |
| | when greeting housemates.        | |
| |                                  | |
| | HEALTH AND SAFETY                | |
| | No health concerns today.        | |
| |                                  | |
| | GOALS                            | |
| |   Brush teeth on own             | |
| |   1.Verbal 2.Verbal             | |
| |   (0 of 2 ind)          [Edit]  | |
| +----------------------------------+ |
|                                      |
+--------------------------------------+
| You review and sign every note.      |
| [  Edit  ] [  Sign and submit    ]  |
+--------------------------------------+
```

---

### 6.3 Smart Defaults

**Auto-filled fields and their sources:**

| Field | Source | Where it appears |
|-------|--------|-----------------|
| Time | `new Date()`, rounded to nearest 5 min | Incident report Step 1 time input |
| Person | `data-c` attribute from person card tap, or clock-in home assignment | All forms opened from person detail |
| Shift type | `SHIFTS` array matched against clock-in time (AM 7-3, PM 3-11, ON 11-7) | Greeting subtitle, topic suggestion chips |
| Home | `cgHome()` from active clock record | Greeting, all form headers |
| Medication schedule | `scheduledMeds(c)` for person, sorted by time | MAR screen, "meds due" subtitle on person cards |
| Last weight | Most recent vitals entry for person | Health form placeholder: "Last: 185 lb on Oct 3" *(Rebuild target -- not in MVP)* |
| Baseline BP | Most recent vitals with normal BP | Health form reference below BP fields *(Rebuild target -- not in MVP)* |

**Visual indicator for auto-filled values:** *(Rebuild target -- not in MVP)*

- A 2px left border in `var(--lemon)` on any auto-filled field
- Border fades out (200ms transition to transparent) when the user taps into or edits the field
- No text labels, no icons, no "AI" branding
- For the time field in incident reports: a tiny clock icon (12px, `var(--faint)`) appears inside the field, disappears on edit

**User can override any auto-filled value** by simply editing the field. Auto-fill indicator disappears on first interaction.

**Contextual topic suggestions by shift time (Rebuild target -- not in MVP):**

> **Note:** The MVP code always shows the same default topics regardless of shift time. The per-shift variants below are the target for the SvelteKit rebuild.

| Shift | Suggested topics (compose screen chips) |
|-------|----------------------------------------|
| Morning (7am-3pm) | "Morning routine" "Medications" "Breakfast" "Goals" |
| Evening (3pm-11pm) | "Dinner" "Evening meds" "Activities" "Mood" |
| Overnight (11pm-7am) | "Bed routine" "Sleep" "Checks" "Incidents" |
| Default (no shift / MVP) | "Meals" "Mood" "Goals" "Anything unusual" |

---

### 6.4 Lomi Brand Presence

**Design principle:** Lomi is a mascot that pervades the experience subtly -- like Duolingo's owl -- not a chatbot the user "talks to."

**Where Lomi appears:**

| Context | Size | Expression | Content |
|---------|------|-----------|---------|
| Onboarding (first 3 sessions) (Rebuild target) | 40px | Encouraging | Speech bubble tips: "Just talk about your shift. I'll organize it." |
| Empty states (18 occurrences) (Rebuild target) | 32px | Varies | Contextual one-liner + optional action button |
| Compose screen orb | 104px | Neutral/Listening | Centered orb with ring animations |
| Coverage offers | 26px | Neutral | Inline with offer text |
| Team messages | 26px | Neutral | Message sender avatar |
| All-notes-done celebration (Rebuild target) | 24px | Happy | Next to "6 of 6 done" text, brief bounce animation |
| Error encouragement (Rebuild target) | 24px | Encouraging | In `.callout.warn` for recoverable errors |
| Supervisor summary card | 28px | Neutral | Left of summary text |

**Where Lomi does NOT appear:**

- During active documentation (note form editing)
- MAR screen (medication safety, zero distractions)
- Incident reports (serious clinical events)
- Supervisor note review (focus on content quality)
- Vitals entry (clinical precision)

**Lomi expressions (5 minimum) (Rebuild target -- not in MVP):**

> **Note:** The MVP `lemon(s)` function accepts only a size parameter and renders a single fixed smile path. The expression parameter described below is a planned enhancement for the SvelteKit rebuild.

The `lemon(size)` SVG function will accept an optional expression parameter:

| Expression | Mouth path | Usage |
|-----------|-----------|-------|
| neutral (default) | Smile curve: `M11 16.2q4 2.6 8 0` | Nav, summary card, compose idle |
| happy | Wider smile, slight upward tilt | All notes signed, shift covered |
| thinking | Flat line, no curve | AI processing (dots state) |
| encouraging | Smile with small speech line | Onboarding prompts, first-use tips |
| concerned | Slight downturn | Incident auto-detected from text |

**Animation constraints:**

- All Lomi animations: ease-in-out, 200-400ms duration
- Compose screen breathe animation: 2.4s (keep for orb only)
- Max Lomi size outside onboarding: 40px
- Bounce animation on celebration: `translateY(-4px)` and back, 200ms
- All animations respect `prefers-reduced-motion`

**Max 1 proactive tip per session:** From clock-in to clock-out, Lomi shows at most one unsolicited suggestion. E.g., after 4 hours with no signed notes: "[lemon 24px] You have 4 notes to finish -- want to start with Marcus?" Dismiss prevents further proactive tips until next shift.

---

### 6.5 Progressive Disclosure

> **Note:** The phased feature reveals below are target behavior for the SvelteKit rebuild, not implemented in the MVP. The MVP code makes voice/AI always available from the start. All phases should be labeled as rebuild targets during implementation planning.

**Feature visibility gated by usage thresholds (Rebuild target -- not in MVP):**

| Phase | Threshold | What changes |
|-------|-----------|-------------|
| Day 1 | `sessionCount === 1` | Plain forms with labeled textareas. No voice button. No AI drafting. No topic suggestions. Lomi present only in warm empty states. |
| Week 1 | `notesCompleted >= 3` | Mic button appears in compose screen action bar. One-time tooltip above mic: "Try speaking your note instead of typing." `.callout.info` styling, positioned above mic, with dismiss X. Never appears again after dismissed. |
| Week 2 | `voiceUsed >= 5` | Voice becomes the default entry point. Compose screen opens with orb and "Speak" button prominent. "Write it myself" link still available. |
| Month 1 | `notesCompleted >= 15` | Smart defaults silently activate: carry-forward from previous notes, medication reminders inline, Lomi suggestions based on person's goals/history. |
| Month 3+ | Supervisor/admin role on desktop | Cmd+K command palette available. Goal progress sparklines visible. Analytics drill-down from stat tiles. |

**Feature flag storage:**

```javascript
// Stored in user's local state (PowerSync local DB, user_settings table)
{
  sessionCount: 0,
  notesCompleted: 0,
  voiceUsed: 0,
  micRevealed: false,
  onboardingDone: false,
  lastProactiveTipAt: null
}
```

Each feature's visibility is gated by a threshold check. No server-side feature flags needed.

**Onboarding flow for DSPs (learn-by-doing):**

1. Clock in at your home
2. Tap a person
3. Write a quick note about how they are doing right now
4. Sign it

Total time: 3 minutes. Lomi appears as a 40px lemon in the corner of each step with a one-sentence instruction. After completing, DSP has clocked in, written one note, and signed it.

---

### 6.6 Offline AI Degradation

**Design principle:** No degradation path should ever prevent a DSP from completing and signing a note.

**Degradation cascade:**

| Condition | Voice recording | Transcription | AI structuring | Goal scoring | Signing |
|-----------|----------------|--------------|----------------|-------------|---------|
| Full connectivity | MediaRecorder | Whisper API | Lomi API (Claude) | Local | Local + sync |
| Offline, SpeechRecognition available | MediaRecorder | Browser SpeechRecognition (Web Speech API) | Rules-based (`rules()` function) | Local | Local + sync |
| Offline, no SpeechRecognition | Not available | Not available | Rules-based if text entered | Local | Local + sync |
| API error | MediaRecorder works | Whisper fails -> fallback to typing | Rules-based fallback | Local | Local + sync |

**Offline voice behavior:**

- Mic recording still works offline (MediaRecorder is browser-native)
- Transcription fails (Whisper API unreachable)
- Fallback 1 (Rebuild target -- not in MVP): Use browser's `SpeechRecognition` API if available (check `window.SpeechRecognition || window.webkitSpeechRecognition`). Note: offline-sync.md does not list this fallback; if implemented, update offline-sync.md's "Voice transcription" row accordingly.
- Fallback 2: If SpeechRecognition unavailable or not planned for MVP, show text input prominently: "Type your note -- voice is available when you're online." (matches offline-sync.md: "DSP types manually")
- The "Speak" button is hidden (not disabled with error) when voice is completely unavailable

**Offline AI structuring:**

- When `/api/lomi` unreachable, `rules()` function runs locally
- Regex-based categorization of sentences into Activities/Meals/Mood/Health sections
- Vague language detection via `VAGUE` array still works (client-side)
- Output appears in the same review form
- Fallback banner is shown on the review screen: "Lomi wasn't available, so this draft was sorted by simple rules. Check each section carefully." (matches app-caregiver.js line 169 behavior, which renders `g.fallback` banner)

**Queued AI processing on reconnect:**

- When network reconnects, do NOT re-process already-signed notes
- For in-progress drafts (not yet signed): silently re-send original text to Lomi API
- Only update fields the user has NOT manually edited (track `userEdited` boolean per field via `input` event listener)
- No user action required

**No error dialogs that block documentation:**

- NEVER show a blocking modal for offline state
- NEVER disable form fields when offline
- NEVER show a spinner waiting for connectivity
- NEVER use the word "error" for expected offline states
- "Saved to your phone" explicit confirmation for the first week of use

**Offline summary (supervisor):**

- Rules-based summary loads instantly from local data
- AI-generated summary replaces it when API responds (1-2 second delay)
- Supervisor always sees a summary immediately -- no loading state

---

### 6.7 Per-Box Voice and Text Rewrite UX (Mode 2)

> **Source:** ai-pipeline.md, Mode 2 "Per-Box Editing". This mode is not implemented in the MVP but is a core interaction pattern for the SvelteKit rebuild.

**Concept:** Every section on the review screen (Activities, Meals, Mood, Health) is a dual-input box: a text area for typing AND a mic button for speaking. Both produce the same result: Lomi rewrites the input into clinical language for that specific section.

**Layout per section box:**

```
+--------------------------------------+
| ACTIVITIES                       [mic]|  <- label + mic button
| +----------------------------------+ |
| | Marcus attended day program and  | |  <- editable textarea
| | participated in art class.       | |
| +----------------------------------+ |
+--------------------------------------+
```

**Mic button (per box):**

| Property | Value |
|----------|-------|
| Size | 32x32px visual, 44x44px touch target (padding extends hit area) |
| Position | Right side of section label row, vertically centered with label text |
| Idle | Gray mic icon (`var(--faint)`), no background |
| Recording | Red pulsing mic icon, section border turns `var(--lemon)` (#FFE066), timer "0:12" appears next to icon in 13px `var(--muted)` tabular-nums |
| Processing | Spinner replaces mic, "Updating..." text below section label in 12px `var(--muted)` |
| Updated | Section flashes lemon briefly (200ms), new/changed text appears. "Undo" text button (`.textbtn`, 13px) appears for 10 seconds. |
| Error | Red mic icon, "Couldn't update -- try again or type" in 12px `var(--bad)` below textarea |
| Offline | Crossed-out mic icon (`var(--faint)`, opacity 0.5), not tappable. Text input remains available. "Lomi is offline -- you can type directly" appears in 12px `var(--muted)` below label. |
| Max recording | 30 seconds per box (client-side enforcement) |

**Voice path flow:**

1. Caregiver taps mic on a section (e.g., Activities)
2. Recording begins. Section border turns lemon. Timer starts.
3. Caregiver speaks about that section (e.g., "he went to the park and helped make lunch")
4. Caregiver taps mic again (or 3s silence auto-stop)
5. Audio sent to `POST /api/transcribe` (Whisper, ~2s)
6. Transcript sent to `POST /api/lomi/edit` with `{ section: "activities", current: "<existing text>", input: "<transcript>", person: "<name>" }` (Haiku, ~1.5s)
7. Section updates in-place with rewritten clinical text. Total: ~3.5s.

**Text path flow:**

1. Caregiver types in a section textarea (e.g., types "he didnt eat lunch refused it")
2. On blur (or explicit "Rewrite" tap if added): typed text sent to `POST /api/lomi/edit`
3. Haiku rewrites into clinical language: "James refused lunch." (~1.5s)
4. Section updates in-place.
5. If caregiver writes clinical-quality text directly, no AI rewrite occurs (direct edit, Mode 4).

**Merge behavior:**

- Empty section: Haiku writes fresh from input
- Section has content: Haiku merges new information into existing text
- Contradicting input: new input wins (e.g., "actually he skipped lunch" replaces previous meals text)
- Each edit is cumulative -- the section grows more detailed with each voice or text addition

**Undo pattern:**

- After any AI rewrite, an "Undo" text button (`.textbtn`, `var(--blue)`, 13px/600) appears inline below the textarea
- Tapping "Undo" restores the previous section content
- "Undo" disappears after 10 seconds or after the next edit
- Only one level of undo (last rewrite only)

**ASCII wireframe -- Per-box editing, recording state:**

```
+--------------------------------------+
| [<] Review Lomi's draft              |
|     Marcus - Shift note - Oct 11     |
+--------------------------------------+
| +----------------------------------+ |
| | ACTIVITIES                  [mic]| |  <- idle
| | Marcus attended day program and  | |
| | participated in art class.       | |
| |                                  | |
| | MEALS                   [*mic*]  | |  <- RECORDING
| | +----- lemon border -----------+ | |  <- border: var(--lemon)
| | | (typing or speaking here)    | | |
| | +------------------------------+ | |  <- 0:08 timer
| |                                  | |
| | MOOD                        [mic]| |  <- idle
| | Marcus was calm today.           | |
| |                                  | |
| | HEALTH AND SAFETY           [mic]| |  <- idle
| | No concerns.                     | |
| +----------------------------------+ |
+--------------------------------------+
```

---

### 6.8 Chat Panel UX (Mode 3)

> **Source:** ai-pipeline.md, Mode 3 "Chat". This mode is not implemented in the MVP but is a core interaction pattern for the SvelteKit rebuild.

**Concept:** A panel at the bottom of the review screen where the caregiver can send messages to Lomi by typing or tapping a mic. The caregiver does not need to specify which section they're talking about -- Lomi routes the content to the right sections automatically.

**Layout:**

The chat panel sits below the note card and flags, above the action bar (Sign/Edit buttons). It is always visible on the review screen when online.

```
+--------------------------------------+
| [<] Review Lomi's draft              |
|     Marcus - Shift note - Oct 11     |
+--------------------------------------+
|                                      |
| +--note card with sections--------+ |
| | (Activities, Meals, Mood, etc.) | |
| +---------------------------------+ |
|                                      |
| +-- flags / incidents if any -----+ |
|                                      |
| -- Lomi ----------------------------+|
|                                      |
| [lemon 20px] What was Marcus's       |
|              mood today?             |  <- proactive question
|                                      |
| [lemon 20px] How did Marcus do on    |
|              "Make bed"?             |  <- proactive question
|                                      |
|                     [user avatar]    |
|      actually he didn't eat lunch,   |
|      he refused                      |  <- user message
|                                      |
| [lemon 20px] Got it -- I updated     |
|              the meals section.      |  <- Lomi response
|                                      |
| +----------------------------------+ |
| | Type a message...           [mic]| |  <- chat input
| +----------------------------------+ |
|                                      |
+--------------------------------------+
| You review and sign every note.      |
| [  Edit  ] [  Sign and submit    ]  |
+--------------------------------------+
```

**Chat panel components:**

| Element | Spec |
|---------|------|
| Section divider | "Lomi" label with horizontal rule. 12px/700, uppercase, `var(--muted)`, letter-spacing .06em. |
| Proactive questions | Left-aligned, lemon avatar (20px) + question text. 14px, `var(--muted)`. Appear as Lomi messages. Max 3 at a time (per ai-pipeline.md). |
| User messages | Right-aligned, blue bg (`var(--blue)`), white text, 15px, 18px radius (bottom-right 6px). Max-width 82%. |
| Lomi responses | Left-aligned, lemon-2 bg, lemon-line border, 15px, 18px radius (bottom-left 6px). Includes routing feedback: "Got it -- I updated the meals section." |
| Multi-section feedback | When a message updates multiple sections: "Updated meals and mood." Each affected section name is bold. |
| Chat input | `.input` field, min-height 46px, placeholder "Type a message...", mic button (32x32 visual, 44x44 touch target) on right. Enter key sends. |
| Chat mic | Same states as per-box mic (section 6.7). Max 30s recording. |

**Routing feedback:**

After Lomi processes a chat message, the UI:
1. Shows Lomi's response in the chat ("Got it -- I updated the meals section.")
2. Scrolls the note card to highlight the affected section(s) with a brief lemon flash (200ms background pulse)
3. If multiple sections updated, each is highlighted sequentially (200ms stagger)

**Examples of chat routing:**

| User message | Lomi routes to | Lomi response |
|---|---|---|
| "actually he didn't eat lunch, he refused" | Meals | "Updated meals." |
| "his mood was calm in the morning but got anxious around 2pm" | Mood | "Updated mood." |
| "he also had a verbal prompt on the teeth brushing goal" | Goals (specific goal) | "Added a verbal prompt trial to 'Brush teeth on own'." |
| "he skipped lunch and was in a bad mood all afternoon" | Meals AND Mood | "Updated meals and mood." |
| "the activities were wrong, he didn't go to the park" | Activities (replace) | "Replaced activities." |

**Offline behavior:**

- Chat mic: disabled (crossed-out icon). Text input available but without AI routing.
- When offline, chat input shows: "Lomi is offline -- you can type directly in each section above."
- Direct box editing (Mode 4) always works offline.

**Chat messages are ephemeral:** Held in browser memory for the session, not persisted to the database. The resulting note content (in the section boxes) is what gets saved.

**Proactive questions (from ai-pipeline.md):**

After the initial draft renders, Lomi examines the result for gaps and displays questions:

| Condition | Question |
|---|---|
| `mood === ""` | What was {person}'s mood today? |
| `meals === ""` | Did {person} eat their meals? |
| `health === ""` | Any health observations -- vitals, medications, concerns? |
| `activities` under 20 chars | Can you tell me more about what {person} did today? |
| A goal has empty `trials` | How did {person} do on {goal.text}? |
| flags array is non-empty | You said {person} "was fine" -- what did that look like? |

Questions appear as Lomi chat messages. Max 3 at a time. Additional questions appear as earlier ones are answered. Generated client-side from draft output (no API call).

---

### 6.9 Fallback Behavior Per Mode

> **Source:** ai-pipeline.md "Fallback Behavior Per Mode"

| Mode | Online | Offline |
|---|---|---|
| Voice brain dump (Mode 1) | Full pipeline | Voice unavailable (no Whisper). Caregiver types, rules-based classification runs. |
| Per-box voice (Mode 2) | Whisper + Haiku rewrite | Mic button disabled (crossed-out icon, not hidden). Text input works. No AI rewrite -- text stays as typed. |
| Per-box text (Mode 2) | Haiku rewrite | No AI rewrite. Text stays as typed. |
| Chat voice (Mode 3) | Whisper + Haiku route + rewrite | Mic disabled. Text chat available without AI routing -- caregiver must edit boxes directly. |
| Chat text (Mode 3) | Haiku route + rewrite | Chat disabled. Direct box editing only. |
| Direct edit (Mode 4) | No AI | Works normally. |

The UI communicates mode availability clearly. Disabled mic buttons show a crossed-out icon, not a hidden element. The text "Lomi is offline -- you can type directly" appears in the chat panel when the network is down.

---



---

## 7. Navigation & Information Architecture

### 7.1 Complete Route Map

> *Note: The MVP prototype uses a single-page innerHTML rendering approach with no URL routing. The route map below is the target specification for the SvelteKit rebuild.*

```
CAREGIVER ROUTES
------------------------------------------------------------
/                         Redirect to /today or /dashboard
/today                    Caregiver home (Today screen)
/notes                    Activity log (today's records)
/shifts                   Schedule, clock status, offers
/shifts/coverage          Coverage request detail
/me                       Profile, settings, clock out
/people/:id               Person detail hub
/people/:id/note          Compose screen (voice/type)
/people/:id/note/review   Review screen (Lomi draft)
/people/:id/note/done     Success screen (note signed)
/people/:id/mar           Medication Administration Record
/people/:id/health        Health entry (vitals/seizure)
/people/:id/health/summary Health summary (read-only)
/people/:id/incident      Incident report wizard
/people/:id/incident/done Success (incident submitted)
/people/:id/behavior      Behavior note compose
/people/:id/behavior/review Behavior note review
/messages                 Team messages for current home
/clock                    Clock in/out with GPS

SUPERVISOR ROUTES
------------------------------------------------------------
/dashboard                Overview (KPIs, Lomi, attention)
/dashboard/schedule       Schedule grid + coverage activity
/dashboard/notes          Note review (split pane)
/dashboard/incidents      Incident review (split pane)
/dashboard/medications    Medication table (all people)
/dashboard/health         Health entries list
/dashboard/people         People grid
/dashboard/people/:id     Person detail (tabbed)
/dashboard/messages       Team messages for selected home
/dashboard/analytics      Analytics (4-week trends)
/dashboard/reports        CSV/PDF export list
/dashboard/staff          Staff roster + management (NEW -- split from current /dashboard/setup)
/dashboard/settings       Agency setup (homes, config) (NEW -- split from current /dashboard/setup)

SHARED ROUTES
------------------------------------------------------------
/setup                    First-run agency setup wizard
/signin                   User selection (dev) / Auth (prod)
```

### 7.2 Navigation Patterns

| Pattern | Caregiver | Supervisor |
|---|---|---|
| Primary nav | Bottom tabs (Today / Notes / Shifts / Me) | Left sidebar (grouped sections) |
| Secondary nav | Contextual sheets + page pushes | Split panes + horizontal tabs |
| Lomi access | "Talk to Lomi" button above tabs / in sidebar | Lomi summary card on overview |
| Quick actions | Sheet overlays for med pass, goal scoring | Inline approve/reject in list rows |
| Back | Native browser/gesture + explicit back arrow | Sidebar item selection (lateral) |

**Maximum Navigation Depth:**

| Flow | Taps from Home |
|---|---|
| Today -> Person -> Note -> Review -> Sign -> Success | 5 |
| Today -> Person -> MAR -> Mark as given | 3 |
| Today -> Person -> Health -> Save vitals | 3 |
| Lomi -> Person picker -> Compose -> Review -> Sign | 4 |
| Dashboard -> Attention item -> Detail | 2 |
| Dashboard -> Notes -> Select -> Approve | 3 |
| Schedule -> Slot -> Assign staff | 3 |
| People -> Person -> Goals -> Add goal | 4 |

**Maximum depth: 5 taps.** This beats Therap's 7-8 taps for equivalent flows.

**Sheet vs Page Decision:**

| Use a SHEET when | Use a PAGE when |
|---|---|
| Action takes < 30 seconds | Action takes > 30 seconds |
| 1-3 input fields | > 3 fields |
| User needs context behind | Content scrolls independently |
| Cancelable without data loss | Has its own sub-navigation |

### 7.3 Responsive Breakpoints

**Current MVP (styles.css):** A single 900px breakpoint for the supervisor dashboard. At <=900px, the sidebar collapses to a horizontal scroll strip and stat cards go to a 2-column grid. The caregiver app uses 700px for the phone frame border.

| Breakpoint | Width | Navigation | Layout | Cards | Touch Target |
|---|---|---|---|---|---|
| **Mobile** | <=900px | Bottom tabs (caregiver) / horizontal scroll strip (supervisor) | Single column, max-width 420px (caregiver) | Full-width, 18-20px radius | 44px min |
| **Tablet (caregiver)** | 700px | Caregiver phone-frame shell (.app), bottom nav (.nav), action bar (.actionbar), bottom sheet (.scrim/.sheet), dock (.dock) transition from mobile-fixed to desktop-centered |
| **Desktop** | >900px | Sidebar (caregiver 248px, supervisor 220px) | Sidebar + main (max-width 1200px for .dash), split panes | 14px padding (supervisor dense) | 44px min |

> *(Rebuild target)* The planned three-tier breakpoint system is:
>
> | Breakpoint | Width | Navigation |
> |---|---|---|
> | Mobile | < 640px | Bottom tabs |
> | Tablet | 640-1024px | 64px icon rail sidebar |
> | Desktop | > 1024px | Full 220px sidebar |

**CSS Custom Properties for Breakpoints:**
```css
/* Current MVP uses a single 900px breakpoint. Planned rebuild values: */
--breakpoint-tablet: 640px;   /* Rebuild target (current: 900px) */
--breakpoint-desktop: 1024px; /* Rebuild target (current: 900px) */
--sidebar-width: 220px;       /* Matches styles.css */
--sidebar-rail: 64px;         /* Rebuild target -- not in current MVP */
--content-max-mobile: 420px;
--content-max-caregiver: 720px;
--content-max-supervisor: 1200px;
--dock-height: 64px; /* + safe-area-inset-bottom */
--appbar-height: 56px; /* + safe-area-inset-top */
```

**What Changes at Each Break (current MVP):**

| Transition | Changes |
|---|---|
| <=900px -> >900px | Sidebar appears (220px for supervisor, 248px for caregiver). Bottom dock hidden (caregiver). Stat cards go from 2-column to 4-column. Split panes activate for Notes/Incidents. |

**Role-Adaptive Density:**
- DSP views: Always spacious card layouts regardless of viewport (18px radius, 16px padding, 10px gaps)
- Supervisor views on desktop: Tighter layouts (14px padding, 8px row gaps, 15px body text)
- Supervisor views on mobile: Revert to spacious layout (same as DSP)

### 7.4 Search

> *(Rebuild target -- no search functionality exists in the MVP. Cmd+K is also listed as Phase 4 in section 13.)*

**Placement:**
- Desktop: Cmd+K / Ctrl+K command palette (modal overlay)
- Mobile: Search icon in app bar, opens full-screen search

**Searchable Content:**

| Category | Indexed Fields | DSP Priority | Supervisor Priority |
|---|---|---|---|
| People | name, home | 1st | 2nd |
| Staff | name, role | 4th | 3rd |
| Notes | person name, date, content | 3rd | 1st |
| Medications | med name, person | 2nd | 4th |
| Incidents | type, person | 5th | 1st (tied) |
| Goals | goal text, person | 6th | 5th |

**Results Layout:**
```
  Modal overlay with categorized results
  Each category: header + top 3 matches + "View all" link
  Result row: avatar/icon + primary text + secondary text (home, date, status)
  Tap: navigates to relevant screen
  Offline: searches local PowerSync SQLite database
```

---

> *Sections 8, 9, 10 are in frontend-spec-2.md and frontend-spec-1.md respectively. See the section numbering note before section 7.*



---

## 8. Offline & PWA UX

---

### 8.1 Sync Status Indicator

**Position:** Top-right area of the home bar, inline with messages icon and user avatar. Small ambient indicator that does not demand attention.

**States:**

| State | Visual | Tappable behavior |
|-------|--------|-------------------|
| Synced (everything current) | No indicator visible. Clean UI. | N/A |
| Pending changes | Amber dot (6px diameter), next to sync area in home bar | Tap shows tooltip: "3 changes waiting to sync. Last synced 2 min ago." |
| Syncing | Amber dot with slow pulse animation (opacity .5 -> 1.0, 1.5s) | Tap shows: "Syncing..." |
| Offline | Subtle "Offline" pill: bg `var(--lemon-2)`, color `var(--ink)`, 12px/600, 999px radius, padding 2px 8px | Tap shows: "You're offline. Your work is saved and will sync when you reconnect." |
| Sync error | Amber dot (same as pending) | Tap shows: "Some changes couldn't sync. They'll retry automatically." |

**Design principles:**

- NEVER show a red indicator for connectivity status
- NEVER use the word "error" for offline state
- Offline is NORMAL, not an error state
- The dot is 6px -- barely visible. The app feels identical online and offline.

**Lomi orb color shift (enhancement):** When offline, Lomi's orb glow (on compose screen) shifts from blue-tinted shadow to warm amber-tinted shadow. Subconscious cue without demanding attention.

**Extended offline behavior:**

| Duration offline | UI change |
|-----------------|-----------|
| 0-5 minutes | Ambient indicator only (amber dot or "Offline" pill) |
| 5+ minutes | Dismissable banner below home bar: "You're offline. Your work is saved and will sync when you reconnect." Warm amber background (`var(--lemon-2)`), not red. |
| On reconnect | Brief toast: "Back online. Syncing..." followed by "All caught up!" with green checkmark |

**Per-record sync status:**

- When a DSP signs a note offline, that note shows a small "Pending sync" label (12px, `var(--muted)`) in the notes list until it reaches the server
- The supervisor never sees an unsynced note (PowerSync sync rules ensure this)

**ASCII wireframe -- Sync states in home bar:**

```
Synced (clean):
+--------------------------------------+
| Guad                     [msg]  AK   |
+--------------------------------------+

Pending (amber dot):
+--------------------------------------+
| Guad                 [*][msg]  AK    |
+--------------------------------------+
                        ^ 6px amber dot

Offline (pill):
+--------------------------------------+
| Guad          [Offline] [msg]  AK    |
+--------------------------------------+

Extended offline (banner):
+--------------------------------------+
| Guad          [Offline] [msg]  AK    |
+--------------------------------------+
| You're offline. Your work is saved   |
| and will sync when you reconnect. [x]|
+--------------------------------------+
```

---

### 8.2 Offline State Per Screen

**Core principle:** All screens remain fully functional offline. Read from local SQLite (via PowerSync wa-sqlite), write to local queue. No spinners, no error screens, no disabled inputs.

**Per-screen offline behavior:**

| Screen | Read | Write | Special handling |
|--------|------|-------|-----------------|
| Today | Local DB: people, notes, meds, schedule | Clock-in, coverage accept/decline | Coverage acceptance queues locally but may fail on sync if already filled by another caregiver (coverage is time-sensitive per offline-sync.md). Show "Coverage requires connectivity" when offline. |
| Person Detail | Local DB: person record, notes, meds, health | None (navigation only) | -- |
| Compose (voice) | Local: topic chips, person context | Audio recording (local), transcript | Voice recording works (MediaRecorder is browser-native). Transcription requires connectivity. |
| Compose (manual) | Local | Text entry persisted to draft | -- |
| Review | Local: AI draft or rules-based draft | Draft edits, goal scoring, flag handling | If AI unavailable, rules-based draft used silently |
| MAR | Local DB: medications, MAR records | Mark as given/refused/held | Written locally, synced to server. Server enforces unique constraint. |
| Health | Local DB: health entries, thresholds | Save vitals/seizure/illness/visit | Flags computed locally from threshold constants |
| Incident | Local DB: person record | Submit incident report | Full 3-step wizard works offline. Report queued for sync. |
| Messages | Local DB: messages for home | Send message | Messages queue locally, delivered on sync. No real-time indication. |
| Shifts | Local DB: schedule, coverage | Callout, accept/decline | Coverage engine actions queued for sync. Coverage acceptance may fail if shift already filled (time-sensitive, per offline-sync.md). |
| Notes (activity log) | Local DB: today's events | None (read-only) | -- |

**First offline detection:**

- Subtle top banner appears (not blocking): "Working offline -- changes will sync when connected"
- Banner auto-dismisses after 5 seconds
- Sync indicator in home bar remains
- No modal, no dialog, no blocking interaction

**Subsequent offline:**

- No repeated banner (user already knows)
- Only the ambient sync indicator shows state
- All interactions are identical to online

---

### 8.3 Conflict Resolution UI

**Strategy:** Server-authoritative, last-write-wins using server timestamps (via PowerSync). Most conflicts are resolved automatically without user intervention.

**When user intervention is needed:**

Conflicts that require user attention are rare but possible when two devices edit the same record while both are offline.

**Conflict resolution bottom sheet:**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| This note was also updated on        |
| another device.                      |
|                                      |
| Your version (this device)           |
| Saved at 2:14pm by Aisha            |
| +----------------------------------+ |
| | Activities: Marcus had a good... | |
| +----------------------------------+ |
|                                      |
| Other version (another device)       |
| Saved at 2:18pm by Aisha            |
| +----------------------------------+ |
| | Activities: Marcus participated..| |
| +----------------------------------+ |
|                                      |
| [ Keep mine                      ]  |
| [ Keep other                     ]  |
| [ Keep both (create amendment)   ]  |
+--------------------------------------+
```

- Title: plain language, no technical jargon
- Both versions shown with timestamps and author names
- Three options: "Keep mine" / "Keep other" / "Keep both (create amendment)"
- "Keep both" creates an amendment record referencing the original

**Per-record-type conflict rules:**

| Record type | Resolution strategy | User UI |
|-------------|-------------------|---------|
| Shift notes | Last-write-wins (editable until approved) | Conflict sheet if both versions differ substantially |
| MAR entries | Server always wins | No conflict possible -- `given` entries are irrevocable. If duplicate attempted, server rejects silently, local record removed. |
| Health entries | Append-only (both kept) | No conflict -- each entry is a new record |
| Incident reports | Append-only (both kept) | No conflict |
| Clock records | Server wins | If mismatch, supervisor review flag added |
| Messages | Append-only | No conflict |
| Person profiles | Last-write-wins | Supervisor notified of conflicting edits |
| Goal scoring (trials) | Append-only within a note | No conflict -- trials within a note are part of the note record |

---

### 8.4 PWA Install Prompt

**Android (custom install banner):**

```
+--------------------------------------+
| [i] Add Guad to your home screen    |
|     for the best experience.         |
|     [Add to home screen]       [x]  |
+--------------------------------------+
```

- Position: top of Today screen, above greeting, dismissible
- Styling: `.callout.info` (sky bg, blue-tinted border, 18px radius)
- "Add to home screen" button: `.btn.sm`, primary blue
- X dismiss button: `.iconbtn` (44x44 tap target)
- Show conditions:
  - Only on mobile browsers supporting `beforeinstallprompt`
  - Only after 2nd visit (not first -- let user experience the app first)
  - Never after dismissed 3 times
  - Never after installed
  - Only once per session

**iOS (instruction sheet, since Safari lacks install prompt API):**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| Add Guad to your home screen         |
|                                      |
| 1. Tap the Share button [share icon] |
|    at the bottom of Safari           |
|                                      |
| 2. Scroll down and tap               |
|    "Add to Home Screen"              |
|                                      |
| 3. Tap "Add" in the top right        |
|                                      |
| [ Got it                          ]  |
+--------------------------------------+
```

- Bottom sheet with step-by-step instructions
- Simple text instructions (no screenshots to avoid maintenance burden)
- Show after 3rd visit on iOS Safari
- Dismissed permanently after "Got it"

**After install -- welcome screen:**

```
+--------------------------------------+
|                                      |
|          [lemon 40px]                |
|                                      |
|    Welcome to Guad                   |
|                                      |
|    You're using the app version.     |
|    It works offline and loads        |
|    instantly.                        |
|                                      |
| [ Get started                     ]  |
+--------------------------------------+
```

- Shown once on first launch in standalone mode (`display-mode: standalone`)
- Lomi mascot (40px, happy expression)
- "Get started" navigates to Today

---

### 8.5 Service Worker Update

**Update detection:**

When the service worker detects a new version is available (via `updatefound` event on the registration), show a subtle toast:

```
+--------------------------------------+
|   Update available  [Refresh]        |  <- toast, bottom of screen
+--------------------------------------+
```

- Toast: `.toast` styling (pill shape, `var(--ink)` bg, `var(--bg)` text, 14px/600)
- "Refresh" link: inline, `var(--lemon)` color, tappable
- Auto-dismiss after 10 seconds (longer than standard toast to give time to notice)
- **NEVER force-refresh during active documentation** -- check if any form has unsaved data before applying update
- If dismissed: auto-update on next app launch (service worker `skipWaiting` + `clients.claim` on next cold start)

**Update flow:**

1. Service worker downloads new version in background
2. Toast appears: "Update available [Refresh]"
3. If user taps "Refresh":
   - Check for unsaved drafts in PowerSync local DB
   - If drafts exist: "Save your draft first, then refresh." (do not refresh)
   - If no drafts: `location.reload()` to activate new service worker
4. If user dismisses or ignores:
   - New version activates on next full page load
   - No persistent nag -- one toast per update, once

---

### 8.6 Push Notification Permission

**Timing:** Do NOT ask on first visit. Wait until the user has used the app for 3+ days (tracked via `sessionCount` in local state).

**Contextual ask (tied to a feature the user values):**

```
+--------------------------------------+
|            [grab handle]             |
|                                      |
| Stay updated on shifts               |
|                                      |
| Get notified when:                   |
| - A shift coverage offer comes in   |
| - Your supervisor sends back a note  |
| - Medications are due soon           |
|                                      |
| [ Turn on notifications          ]   |
| [ Not now                        ]   |
+--------------------------------------+
```

- Bottom sheet (not browser's generic permission dialog)
- Explains specific value propositions, not "Allow notifications?"
- "Turn on notifications" triggers the actual browser permission prompt
- "Not now" dismisses; do not re-ask for 30 days
- If browser permission denied: "Notifications are blocked. To enable them, go to your browser settings." with a link to instructions

**HIPAA constraints on notification content:**

| Notification type | Lock screen text | In-app text |
|-------------------|-----------------|-------------|
| Medication reminder | "Guad: You have a reminder" | "John D -- 2:00 PM medications due in 15 min" |
| Note returned | "Guad: Action needed" | "Your shift note was sent back by David" |
| Shift coverage | "Guad: Shift available" | "Tomorrow AM shift needs cover at Oak St" |
| Incident | "Guad: Urgent alert" | "Incident report requires follow-up" |
| Message | "Guad: New message" | "New message from David in Oak St team" |

- First name + last initial only in in-app notification content
- No diagnoses, medication names, or health details in any notification
- "Private notifications" mode (optional setting): shows only "Guad: You have a new alert" on lock screen for all types

---



---

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


---

## 11. What to Keep from Current Guad

Based on thorough analysis of the prototype codebase at `/Users/amekonnen/Downloads/MVP1/`, these elements must survive the rebuild unchanged:

| Element | Location | Why Keep |
|---|---|---|
| Warm cream background (#FFFCF3) | styles.css `:root`, `--bg` | Brand differentiator validated by Headway (#FFF8F0) and Jane (#FAF9F7). Every IDD competitor is cold blue/white/gray. |
| Blue accent (#2F3ED8) | styles.css `:root`, `--blue` | Achieves WCAG AA contrast on cream. Professional without clinical sterility. |
| Lemon for Lomi only (#FFD66B) | styles.css `:root`, `--lemon` | Instant brand recognition. The constraint that lemon appears ONLY on Lomi content creates visual discipline. |
| Georgia serif for headings | styles.css `:root`, `--serif` | Warmth signal. Headway validates the serif+sans pairing in healthcare. Reduce usage to greetings and page titles only. |
| Figtree humanist sans | styles.css `:root`, `--sans` | Friendly and readable. Self-host with Latin subsetting instead of Google Fonts CDN. |
| Bottom tab navigation (caregiver) | styles.css, `.dock` + `.tabs4` classes | Matches industry standard (SimplePractice, Brittco). 4 tabs + Lomi is the right count. |
| Person-centric DSP workflow | app-caregiver.js line 66-73, `.cv-row` cards | Today -> Person -> Records. Validated by Brittco and every modern IDD competitor. Therap's module-first is their #1 UX failure. |
| Card-based layout with 18-20px radius | styles.css `.card`, `.cv-card` classes | Warmth differentiator. Do NOT reduce to 8px (Brittco) or generic 12px. 18px is the sweet spot. |
| choice() function pattern | app-caregiver.js line 20 | Pill-shaped button selectors instead of dropdowns. Superior to Therap's `<select>` for prompt levels, incident types, severity. |
| Pill-shaped primary buttons (999px radius) | styles.css `.btn` class | Friendly shape consistent with the rounded card aesthetic. |
| Lomi orb concept | styles.css `.lemon-orb`, `.orb` classes | Animated breathing orb creates emotional connection. Refine into mascot character, keep the animation. |
| Voice-to-note compose flow | app-caregiver.js compose screen logic | The paradigm (speak -> AI structures -> human reviews -> sign) is the #1 differentiator. Refine the UI, keep the paradigm. |
| Shift coverage engine | app-core.js lines 57-95, eligibility() + startCoverage() | Unique. No competitor automates coverage. Keep the eligibility check logic and the team-channel notification flow. |
| vitalFlags() threshold logic | app-core.js lines 102-105 | Clinically correct threshold checking. Wire to better visual indicators (inline alerts on blur, not just on save). |
| Draft-review-sign workflow | app-caregiver.js review screen | AI assists but never submits. Human attestation is trust-critical. The sign confirmation sheet with checkbox is correct. |
| Prompt level system (7 levels) | app-core.js line 7, LEVELS array | Industry-standard IDD terminology. Independent through Full physical plus Refused. The SHORT mapping for display is correct. |
| Dark mode palette | styles.css `[data-theme="guad-dark-off"]` selector | Well-designed (deep navy #12122E, warm tints). Just needs to be enabled by removing the max-width:0px gate. |
| prefers-reduced-motion support | styles.css `@media (prefers-reduced-motion: reduce)` rules | Accessibility baseline that must be maintained and extended to all new animations. |
| Existing accessibility (aria attributes, focus-visible) | Throughout styles.css and JS | The current prototype has solid ARIA: aria-current, aria-pressed, aria-label, role="group", :focus-visible. Maintain and extend. |
| Mobile-first with desktop sidebar at 900px | styles.css `@media (min-width:900px)` rules | Correct responsive strategy. Current single breakpoint at 900px works; 640/1024 are rebuild targets. |

---

## 12. What Competitors Get Wrong (And How Guad Fixes It)

| # | Competitor Problem | Impact | Guad's Solution |
|---|---|---|---|
| 1 | **Therap: 10+ clicks to submit a shift note.** 5-step workflow across full page reloads. 15-25 minutes per note. | DSPs spend 45-90 min/shift on paperwork. #1 reason for turnover citing. | Voice -> AI draft -> review -> sign in 4 taps and under 5 minutes. The compose flow eliminates 80% of manual input. |
| 2 | **Therap: Session timeouts destroy unsaved work.** Server-dependent sessions with zero local persistence. | #1 rage complaint across all review platforms. Notes lost after 15-20 min of writing. | Auto-save to PowerSync local DB (OPFS) every 500ms. Offline-first architecture means work lives on device first. "Your work is NEVER lost." |
| 3 | **Therap: Desktop-first, mobile is afterthought.** Mobile web wrapper rated 2.0-2.5/5. Not responsive. Small text. | DSPs use phones in group homes but Therap is unusable on them. Separate EVV app required. | Mobile-first PWA. 48px touch targets. 16px minimum text. GPS clock-in integrated. No app store download needed. |
| 4 | **Therap: Looks like 2005 enterprise software.** 11-12px text, dense HTML tables, gray institutional palette. | Agencies embarrassed showing it to families, boards, auditors. Recruits see it and hesitate. | Warm cream/blue/lemon palette. Georgia serif + Figtree sans. 20px rounded cards. Looks like software made by people who care. |
| 5 | **All IDD apps: No true offline capability.** Therap barely works online. Brittco needs native app. None have offline-first. | Group homes have unreliable WiFi. DSPs lose work when signal drops. | PowerSync + wa-sqlite + OPFS. Full local SQLite replica. 100% functionality at zero connectivity. Sync is invisible. |
| 6 | **All IDD apps: No voice input.** Every competitor requires manual typing for all documentation. | Typing on phones is slow, error-prone, and impossible during direct care (gloved hands, supporting someone). | Lomi voice-to-structured-note. Speak naturally, AI parses into activities/meals/mood/health/goals sections. 3 taps + speaking. |
| 7 | **All IDD apps: No real-time AI assistance.** Therap added post-hoc AI (2025-2026) that reviews AFTER submission. | Quality issues caught too late. DSP must go back and edit. Does not reduce documentation burden. | Lomi operates DURING documentation. Vague language flagged in real-time. Incidents auto-detected from narrative. AI drafts structured sections from speech. |
| 8 | **Brittco: Competent but generic SaaS design.** White/gray/blue, 8px radius, Inter font. Could be any B2B product. | No emotional connection. Staff feel like they are using "another work system." | Warm design language creates feeling of "software built for people who care about people." Lomi orb mascot builds emotional connection. |
| 9 | **MediSked: Goal tracking is complex.** Configuration-heavy. Requires administrator setup for every goal. | Supervisors spend hours configuring goals. DSPs need training to navigate the interface. | Visual progress rings. One-tap prompt level scoring with pill buttons. Goal templates by area. Auto-populated from ISP. |
| 10 | **ShareNote: Poor mobile experience.** Desktop-optimized forms shrunk to phone screens. | DSPs avoid mobile, document at end of day from memory, reducing accuracy. | PWA optimized for one-handed phone use. Bottom-of-screen action zones. Large touch targets. Thumb-reachable interactions. |
| 11 | **All: Long training/onboarding period.** Therap requires 2-4 day classroom training. High turnover means constant retraining cost. | At 40-60% annual turnover, agencies spend $12,000-30,000/year on training alone. | Progressive disclosure. Usable day 1 (Lomi guides through first note), powerful month 1. Zero-training onboarding target. |
| 12 | **All: No automated shift coverage.** Supervisors manually call down staff lists at 5am when someone calls out. | 30-50 hours/year of supervisor time on frantic phone trees. | Lomi checks eligibility rules, offers to all qualified staff simultaneously, tracks responses, updates schedule automatically. |

---

## 13. Implementation Priority

### Phase 1: Foundation (Weeks 1-4)

| # | Task | Priority | Rationale |
|---|---|---|---|
| 1 | Design system tokens as CSS custom properties | P0 | Foundation for all visual consistency. Migrate from single styles.css to token layer + component files. Fix --faint to #706E94 for WCAG AA. |
| 2 | Core layout shells: CaregiverShell, SupervisorShell | P0 | Bottom tabs + sidebar patterns. Responsive breakpoints at 640/1024px. |
| 3 | Page header (AppBar), bottom sheet (Sheet), toast (Toast) | P0 | Used on every screen. Focus trap, swipe dismiss, scrim. |
| 4 | Button, Input, Card, List components | P0 | All variants, all states per this spec. 44px minimum touch targets. |
| 5 | Today dashboard (caregiver) | P0 | First screen every DSP sees. Greeting, progress bar, person list with urgency sort. |
| 6 | Person list and detail view | P0 | Person-centric navigation hub. Tabbed sub-nav (health/goals/meds/attendance/case). |
| 7 | Authentication and role routing | P0 | Route to /today (caregiver) or /dashboard (supervisor) based on role. |
| 8 | Auto-save draft system (PowerSync local DB, 500ms debounce) | P0 | #1 missing feature. DSPs are interrupted every 3-7 min. All in-progress work must persist. PowerSync OPFS is the only permitted client-side PHI cache per CLAUDE.md rules. |
| 9 | Dark mode activation | P0 | Remove max-width:0px gate. Add toggle in Me tab. Auto-suggest for overnight shifts. CSS is already written. |
| 10 | Self-host Figtree font with Latin subsetting | P1 | Eliminates 200-800ms render-blocking Google Fonts request on slow WiFi. |

### Phase 2: Core Documentation (Weeks 5-8)

| # | Task | Priority | Rationale |
|---|---|---|---|
| 11 | Shift note creation flow (manual text first) | P0 | The core documentation workflow. Compose -> review sections -> sign. |
| 12 | Voice-to-note with Lomi (streaming transcription) | P0 | The #1 competitive differentiator. MediaRecorder API + WebSocket to transcription service. Offline fallback: record audio, transcribe later, use rules-based draft immediately. |
| 13 | Goal/ISP scoring interface | P0 | Prompt level pill buttons (44px min-height). Trial tracking. Score computation. |
| 14 | Medication administration (eMAR cards) | P0 | Card-based mobile view. "Mark as given" one-tap. Refused/held with reason sheet. |
| 15 | Health vital entry with threshold alerts | P0 | Vitals/seizure/illness/visit segmented control. Inline out-of-range alerts on blur. |
| 16 | Supervisor overview dashboard | P0 | KPI cards with deltas, grouped attention queue, Lomi summary card. |
| 17 | Note review and approval (split pane) | P0 | Supervisor reviews, approves, or sends back with comment. Batch approve. |
| 18 | Therap CSV import tools | P1 | #1 switching barrier. Import individual demographics, ISP goals, medication lists, staff rosters from Therap CSV exports. Move from Phase 4 to Phase 2. |

### Phase 3: Full Features (Weeks 9-12)

| # | Task | Priority | Rationale |
|---|---|---|---|
| 19 | Incident report wizard (3-step with auto-save) | P0 | Required for compliance. Type, details, injury, notifications. Auto-save per step. |
| 20 | Schedule management grid | P0 | 7-day grid with slot assignment. Lomi coverage integration. |
| 21 | Messages / SComm | P1 | Team channel per home. Lomi posts coverage updates. |
| 22 | Clock in/out with GPS (EVV) | P0 | Geofence verification. Manual entry flagging. State-specific EVV export format. |
| 23 | Coverage request workflow | P0 | Callout -> Lomi eligibility check -> offer to staff -> track responses -> fill. |
| 24 | Notification center UI | P1 | Bell icon, slide-out panel, chronological list, HIPAA-safe content. |
| 25 | Skeleton loading screens | P1 | Every route gets a skeleton matching final layout geometry. Shimmer animation. |
| 26 | Page transitions (SvelteKit) | P1 | Slide-in from right 200ms for sub-screens. Cross-fade 150ms for tab switches. |

### Phase 4: Polish (Weeks 13-16)

| # | Task | Priority | Rationale |
|---|---|---|---|
| 27 | Analytics dashboard with charts | P1 | 4-week trend bar charts. Coverage, documentation, care sections. SVG sparklines on KPI cards. |
| 28 | Reports with PDF generation | P1 | 7 CSV reports (already built). Add PDF for ISP meetings and guardian updates. |
| 29 | Staff and agency management | P1 | Staff roster, certifications, home assignments. Agency settings. |
| 30 | Data visualization: sparklines, progress rings, trend arrows | P1 | SVG-based, zero library dependency. Goal trends, vital trends, compliance. |
| 31 | MAR grid view (supervisor desktop) | P2 | Traditional nursing MAR grid. Toggle alongside existing card view. |
| 32 | Additional vitals: respiratory rate, SpO2, blood glucose, bowel tracking | P1 | Closes gap with Therap. Bowel tracking is critical for Fatal Five monitoring. |
| 33 | Controlled substance two-staff witness in MAR | P2 | Required by state regulations for Schedule II-V medications. |
| 34 | PWA install flow | P1 | Prompt on mobile browsers. "Add to home screen" banner. |
| 35 | Performance optimization for budget devices | P0 | Remove backdrop-filter:blur. Add color-mix() fallbacks. Test on Samsung Galaxy A14 (2GB RAM). Target: FCP < 2s, TTI < 3s on 3G. |
| 36 | Configurable note templates | P2 | Agency-level template builder. Section ordering, required/optional toggles. |
| 37 | Family/guardian read-only portal | P2 | Read-only view of shift notes, goal progress, health summaries. Separate auth flow. |
| 38 | Cmd+K command palette (desktop) | P2 | Power-user differentiator. Quick actions and global search. |
| 39 | Charting preset system (Therap terminology) | P1 | Agency-level toggle: Shift Note = T-Log, Incident = GER, Messages = SComm, etc. |
| 40 | Celebration micro-animations for goal milestones | P2 | When all trials are Independent: card border flashes green, scale-up checkmark. Respect prefers-reduced-motion. |

---

### Critical Fixes (Before or During Rebuild)

These issues in the current prototype must be resolved regardless of rebuild timeline:

| # | Fix | File | Current | Change To |
|---|---|---|---|---|
| 1 | Enable dark mode | styles.css `@media (prefers-color-scheme: dark)` | `max-width:0px` disables dark mode | Remove gate; add `data-theme` toggle |
| 2 | Fix --faint contrast | styles.css `:root` `--faint` | #8B89AA (3.27:1, fails AA) | #706E94 (4.70:1, passes AA) |
| 3 | Restrict .btn.lemon usage | styles.css `.btn.lemon` | Lemon bg button (11.5:1 contrast -- passes AAA, earlier 2.1:1 claim was incorrect) | Keep class but restrict to Lomi brand elements only |
| 4 | Increase .levels button | styles.css `.levels button` | min-height: 36px | min-height: 48px |
| 5 | Increase .btn.sm | styles.css `.btn.sm` | min-height: 42px | min-height: 44px |
| 6 | Increase .trial button | styles.css `.trial button` | 28x28px | 44x44px touch target (visual 28px, padded hit area) |
| 7 | Increase .seg button | styles.css `.seg button` | min-height: 42px | min-height: 44px |
| 8 | Remove backdrop-filter | styles.css `.actionbar` | backdrop-filter: blur(8px) | Solid bg: rgba(255,252,243,0.95) |
| 9 | Self-host Figtree | index.html | Google Fonts CDN link | Local @font-face with font-display:swap |
| 10 | Add color-mix() fallbacks | styles.css `button.row:hover`, `.callout` | No fallback for old Android WebView | Add static fallback values |


---

## Appendix: CSS Micro-Interactions (Implement Immediately)

These 5 CSS additions work with the current innerHTML rendering and should be added to `styles.css` now:

```css
/* 1. Button press feedback */
.btn:active, .btn.sec:active, .cv-row:active {
  transform: scale(0.97);
  transition: transform 80ms ease;
}

/* 2. Card hover lift (desktop) */
@media (hover: hover) {
  .cv-row:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px -4px rgba(28,27,75,.12);
    transition: all 150ms ease;
  }
}

/* 3. Toast slide-up */
.toast {
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
  transition: all 200ms ease;
}
.toast:not([hidden]) {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 4. Progress bar smooth fill */
.cv-bar > i {
  transition: width 600ms cubic-bezier(.32,.72,0,1);
}

/* 5. Sheet slide-up entrance (requires JS: render scrim
   with opacity 0, then remove .entering class via rAF) */
.scrim { opacity: 0; transition: opacity 200ms ease; }
.scrim:not(.entering) { opacity: 1; }
.sheet {
  transform: translateY(100%);
  transition: transform 250ms cubic-bezier(.32,.72,0,1);
}
.scrim:not(.entering) .sheet { transform: translateY(0); }
```

---



---

## Appendix: Critical Fixes Checklist

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Enable dark mode: remove `max-width:0px` trick from line 9 media query | `styles.css` | Overnight DSPs (11pm-7am shifts) |
| 2 | Fix `--faint` contrast: `#8B89AA` -> `#706E94` (4.6:1 ratio, passes WCAG AA) | `styles.css` line 3 | Section 508 compliance |
| 3 | Remove `.btn.lemon` class (2.1:1 contrast, violates lemon-for-Lomi-only rule) | `styles.css` line 87 | Accessibility + brand consistency |
| 4 | Add auto-save drafts: debounced 500ms save to PowerSync local DB on every input event | `app-main.js` | #1 missing feature (DSPs interrupted every 3-7 min) |
| 5 | Increase `.levels button` min-height 36px -> 44px | `styles.css` line 139 | WCAG touch target compliance |
| 6 | Increase `.btn.sm` min-height 42px -> 44px | `styles.css` line 88 | WCAG touch target compliance |
| 7 | Increase `.seg button` min-height 42px -> 44px | `styles.css` line 109 | WCAG touch target compliance |
| 8 | Increase `.trial button` touch target to 44x44px (visual 28px, padded hit area) | `styles.css` line 136 | WCAG touch target compliance |
| 9 | Replace `backdrop-filter:blur(8px)` on `.actionbar` with solid `rgba(255,252,243,0.92)` | `styles.css` line 157 | Frame drops on budget Mediatek/Snapdragon 400 phones |
| 10 | Self-host Figtree font with `@font-face`, `font-display:swap`, Latin-only subset | `index.html` | Eliminates 200-800ms render-blocking network request |


---

## Appendix C: Design Review & Quality Audit

### Reviewer Note

This adversarial review was conducted against the full three-part frontend design specification (`frontend-spec-1.md`, `frontend-spec-2.md`, `frontend-spec-3.md`), the design system source of truth (`design-system.md`), the existing frontend audit (`frontend-audit.md`), the offline sync architecture (`offline-sync.md`), the security and HIPAA compliance document (`security.md`), the charting implementation guide (`charting-guide.md`), and the CLAUDE.md project instructions. The review examines 12 dimensions and identifies issues not surfaced in the prior audit.

---

### 1. COMPLETENESS

#### FINDING C-1: Critical contradiction between design-system.md and frontend-spec-1.md color values

- **Section:** `design-system.md` vs `frontend-spec-1.md` Section 2.1
- **Problem:** The two documents specify different values for the same core tokens. `design-system.md` says `--blue` is `#2F3ED8`, `--muted` is `#5A5880`, `--faint` is `#8B89AA`. `frontend-spec-1.md` says `--blue` is `#3B4FC4`, `--muted` is `#4A4878`, `--faint` is `#706E96`. These are fundamentally different colors -- the blue shifts from a vivid cobalt to a muted indigo, and `--faint` changes by over 1.0 contrast ratio units. `design-system.md` still lists the prototype values that the spec explicitly says were adjusted for contrast compliance. A developer reading `design-system.md` first (as CLAUDE.md directs) will implement failing contrast ratios.
- **Severity:** CRITICAL
- **Recommended Fix:** Update `design-system.md` to match `frontend-spec-1.md` values exactly. Add a note at the top of `design-system.md` stating that `frontend-spec-1.md` takes precedence on any conflict. Or better: delete `design-system.md` and consolidate into one source of truth.

#### FINDING C-2: Dark mode palettes contradict between documents

- **Section:** `design-system.md` Section "Dark Mode" vs `frontend-spec-1.md` Section 10.2
- **Problem:** `design-system.md` specifies dark mode `--bg` as `#12122E` (deep navy), `--card` as `#1C1C42`, `--blue` as `#8590FF`. `frontend-spec-1.md` specifies `--bg` as `#1A1A1E` (warm neutral), `--card` as `#242428`, `--blue` as `#8A96FF`. The spec explicitly rejects the navy-tinted dark mode: "The prototype's dark mode uses a navy-tinted background (#12122E) which adds unnecessary blue light. This spec shifts to warm-neutral darks." But `design-system.md` still has the rejected palette. A developer implementing dark mode will build the wrong colors depending on which file they read.
- **Severity:** CRITICAL
- **Recommended Fix:** Same as C-1. `design-system.md` must be updated or retired.

#### FINDING C-3: Lomi FAB vs "Talk to Lomi" button identity crisis

- **Section:** `design-system.md` Section "Lomi FAB" vs `frontend-spec-2.md` Section 3.10
- **Problem:** `design-system.md` describes a 66x66px lemon circle FAB with negative margin-top overlapping the nav tabs -- a classic floating action button pattern. `frontend-spec-2.md` Section 3.10 describes "Talk to Lomi" as a full-width pill button (min-height 56px, 999px radius, blue background, white text) sitting ABOVE the tab bar in a `.talkwrap` container. These are completely different UI elements. The spec appears to have replaced the FAB with a pill button but `design-system.md` still describes the FAB. Which is the intended design?
- **Severity:** HIGH
- **Recommended Fix:** Resolve which pattern is correct. The full-width pill button is likely more accessible (larger hit area, clearer label) but the FAB is more visually distinctive. Pick one and update both documents.

#### FINDING C-4: Missing screen specifications

- **Section:** Multiple
- **Problem:** The following screens are referenced in the screen inventory or navigation but lack detailed wireframes or component-level specification:
  - **"Me" tab (V.cgMe):** Only mentioned as "Profile: homes, shifts this week, med certification, clock out, switch user" in the screen inventory. No wireframe, no component breakdown, no state specifications. This is a screen every DSP uses daily.
  - **"Notes" activity log (V.cgNotes):** Referenced as "Today's recorded notes" but no detailed specification of what this screen shows, how entries are sorted, or what actions are available.
  - **Attendance recording:** Mentioned in Person Detail as a row with "To do"/"Saved" status but no specification of the actual attendance recording screen or form.
  - **Behavior note compose/review:** Section 3.2 mentions behavior note section order and fields but no dedicated wireframe for behavior-specific composition (separate from shift notes).
  - **Caregiver Shifts tab (V.cgShifts):** Only briefly referenced. No wireframe showing what the DSP sees for their schedule, shift offers, and callout functionality.
  - **Production sign-in/authentication screen:** The spec references dev sign-in only. `security.md` describes email+password+MFA auth but there is no frontend screen specification for login, password reset, MFA enrollment, or the biometric re-auth overlay.
  - **18 empty states:** Section 6.4 references "18 occurrences" of Lomi in empty states but none are specified with wireframes or copy.
- **Severity:** HIGH
- **Recommended Fix:** Add screen specifications for each missing screen, at minimum with ASCII wireframes and component-level detail. The "Me" tab, "Notes" tab, and authentication screens are mandatory before implementation begins.

#### FINDING C-5: No specification for multi-home DSP workflow

- **Section:** 3.1 Today Dashboard, 3.8 Clock In/Out
- **Problem:** The spec assumes a DSP works at one home per shift, but DSPs at small agencies often split shifts across two homes (e.g., morning at Oak St, afternoon at Maple Ave). The Today screen shows "Oak Street, Morning 7am-3pm" -- what happens when a DSP clocks out of Oak St and into Maple Ave mid-day? Does the person list update? Does the progress bar reset? Is there a "Switch home" action? The clock-in flow shows a list of homes but the post-clock-in experience assumes a single active home.
- **Severity:** MEDIUM
- **Recommended Fix:** Specify the multi-home workflow: clock-out triggers a "Clock in elsewhere?" prompt, the Today screen refreshes to show the new home's people, and the progress bar resets for the new shift. Add a "Current home" indicator in the greeting area.

---

### 2. CONSISTENCY

#### FINDING K-1: `.btn.lemon` simultaneously removed and kept

- **Section:** `design-system.md` Section "Buttons", `frontend-spec-1.md` Section 2.7.1, `frontend-spec-3.md` Section 5.1
- **Problem:** `frontend-spec-1.md` omits `.btn.lemon` entirely from the button variants. `frontend-spec-3.md` Section 5.1 says "Remove `.btn.lemon` class entirely" and explains why (2.1:1 contrast failure). Yet `design-system.md` still lists `.btn.lemon` as a valid button variant: "Lemon (`.lemon`): `background: var(--lemon)`, `color: #1C1B4B`". The CLAUDE.md file references `design-system.md` as the visual identity source of truth. A developer following `design-system.md` will implement the exact button the spec says to delete.
- **Severity:** HIGH
- **Recommended Fix:** Remove `.btn.lemon` from `design-system.md`.

#### FINDING K-2: Inconsistent button `.btn.sm` min-height across documents

- **Section:** Multiple
- **Problem:** `design-system.md` says `.btn.sm` min-height is 42px. `frontend-spec-1.md` Section 9.3 says to increase it to 44px. `frontend-spec-3.md` Section 5.1 says 44px. `frontend-spec-3.md` Section 13 Critical Fixes says to change from 42px to 44px. The spec acknowledges the prototype is at 42px and should be fixed to 44px, but the design system document still says 42px.
- **Severity:** MEDIUM
- **Recommended Fix:** Update `design-system.md` to 44px to match the corrected spec value.

#### FINDING K-3: Segmented control min-height inconsistency

- **Section:** `frontend-spec-2.md` Section 3.5, `frontend-spec-3.md` Section 5.2
- **Problem:** Section 3.5 (Health) says segmented control min-height is 44px. Section 5.2 (Component Library) says 44px "INCREASED from 42px for WCAG". But `design-system.md` still specifies the old 42px height via the button small variant reference. Additionally, the Section 2.6.3 animation table references `.seg button` at 42px in the "Do NOT Animate" list discussion but the fixes table says 44px.
- **Severity:** LOW
- **Recommended Fix:** Ensure all min-height references for `.seg button` consistently say 44px.

#### FINDING K-4: Primary blue hex value used inconsistently within the spec itself

- **Section:** `frontend-spec-3.md` Section 5.1
- **Problem:** In the component library button variant table (Section 5.1), the Primary button background is listed as `var(--blue) #2F3ED8` -- this is the OLD prototype value, not the spec's updated `#3B4FC4` from Section 2.1.2. The Section 2.7.1 button tokens table correctly uses `#3B4FC4`. Within the same three-document spec, two different hex values are given for the same button.
- **Severity:** HIGH
- **Recommended Fix:** Replace `#2F3ED8` with `#3B4FC4` in Section 5.1's button variant table. Do a full search-and-replace across all three spec files for `#2F3ED8` and verify each occurrence should be `#3B4FC4`.

#### FINDING K-5: Toast auto-dismiss timing inconsistency

- **Section:** `frontend-spec-1.md` Section 2.6.3, `frontend-spec-3.md` Section 5.7, `design-system.md`
- **Problem:** Three different auto-dismiss durations are specified: Section 2.6.3 says "auto-dismiss after 2800ms." Section 5.7 says "Auto-dismiss: 4 seconds." `design-system.md` says "2.8s auto-dismiss." The service worker update toast in Section 8.5 says "Auto-dismiss after 10 seconds." Which is the standard toast duration?
- **Severity:** MEDIUM
- **Recommended Fix:** Pick one standard duration (4 seconds is more usable than 2.8 seconds for reading content) and update all references. Keep the 10-second exception for the update toast explicitly documented.

---

### 3. PRACTICALITY

#### FINDING P-1: Spec volume is disproportionate to team size

- **Section:** All three spec files
- **Problem:** The three spec files total approximately 5,500 lines of detailed specification. This includes exact pixel values for dozens of components, five button variants with four states each, seven card variants, six badge variants, full dark mode and night mode palettes, OLED considerations, comprehensive ARIA patterns, and 40 prioritized implementation tasks across 4 phases spanning 16 weeks. For a 1-2 person team, this volume of specification creates two risks: (1) the spec cannot be fully internalized, leading to undiscovered contradictions (as evidenced by Findings C-1 through K-5), and (2) implementing to this level of detail delays shipping the core value proposition (voice-to-note) while perfecting visual details (nested rounding rules, spring easing curves, night mode).
- **Severity:** MEDIUM
- **Recommended Fix:** Create a single-page "MVP Implementation Contract" that lists the 10 screens that MUST be built with exact fidelity and marks everything else as "implement at standard quality." Separate must-have-now from nice-to-have with a clear line. The current spec interleaves "future enhancement" items throughout, making it hard to determine true MVP scope.

#### FINDING P-2: Night mode is overspecified for current stage

- **Section:** `frontend-spec-1.md` Section 10.5
- **Problem:** Night mode is specified as a third display mode layered on top of dark mode with its own `--bg`, `--card`, and `--ink` overrides, automatic activation based on overnight shift clock-in, and a recommendation to cap screen brightness at 50%. This is a thoughtful feature for overnight DSPs, but dark mode itself is not yet implemented (still gated behind `max-width:0px`). Specifying three display modes (light, dark, night) before shipping one working dark mode is premature optimization. The max-brightness recommendation via PWA prompt is also not technically feasible in most browsers.
- **Severity:** LOW
- **Recommended Fix:** Move night mode to a "Future Enhancements" appendix. Focus on shipping a working dark mode toggle first.

#### FINDING P-3: Progressive disclosure timeline may frustrate early adopters

- **Section:** `frontend-spec-2.md` Section 6.5
- **Problem:** The progressive disclosure spec hides the voice button until `notesCompleted >= 3` (approximately end of first week) and only makes voice the default at `voiceUsed >= 5`. This means the primary differentiator -- voice-to-note -- is invisible for the first several uses. A DSP evaluating Guad vs Therap during a trial period may never discover the voice feature. An agency decision-maker watching a new DSP use Guad on Day 1 sees plain text forms, not the flagship AI workflow.
- **Severity:** HIGH
- **Recommended Fix:** Show the voice button from Day 1 but default to the typing view. Add a prominent onboarding tooltip: "Try speaking your note -- Lomi will organize it." Let users discover voice immediately rather than gating it behind a usage threshold. The progressive disclosure can still apply to advanced features (smart defaults, carry-forward) without hiding the core differentiator.

---

### 4. ACCESSIBILITY

#### FINDING A-1: `.pill.due` (lemon background) fails WCAG AA for text

- **Section:** `frontend-spec-1.md` Section 2.1.3, Section 2.7.4
- **Problem:** The spec correctly identifies that `--ink` (#1C1B4B) on `--lemon` (#FFD66B) achieves only 3.2:1 contrast (Section 2.1.3 Lemon Contrast table) and states "Do not use lemon as button background." But Section 2.7.4 then specifies `.pill.due` with exactly this combination: `background: var(--lemon) #FFD66B`, `text: var(--ink) #1C1B4B`. The exception carved out -- "notification badges (`.pill.due`)" -- does not exempt these from WCAG. At 12.5px text (even at 700 weight), this is NOT large text under WCAG definitions (large text requires 18px+ or 14px+ bold). The Due pill is used extensively: "To do" status on person cards, "Open" shifts, shift offers pending, "Filling" coverage. These convey critical operational information and fail AA contrast.
- **Severity:** CRITICAL
- **Recommended Fix:** Change `.pill.due` to use `--lemon-muted` (#E8C455) as background with `--ink` text, which achieves approximately 4.7:1, or switch to a different treatment entirely (e.g., `--warn-bg` (#FFF3CD) background with `--warn` (#9A6700) text at 4.6:1, which passes). Alternatively, increase pill text to 14px bold (14px at 700 weight qualifies as "large text" under WCAG, requiring only 3:1).

#### FINDING A-2: Dark mode `--faint` text may fail WCAG AA

- **Section:** `frontend-spec-1.md` Section 10.2.4
- **Problem:** Dark mode `--faint` is specified as `#7A78A0` on `--card` (#242428). The spec claims 4.5:1 contrast. Calculating: the relative luminance of #7A78A0 is approximately 0.187 and #242428 is approximately 0.021. Contrast ratio = (0.187 + 0.05) / (0.021 + 0.05) = 3.34:1. This FAILS WCAG AA (requires 4.5:1 for normal text). The spec's stated 4.5:1 appears to be incorrect. The existing audit (Finding 2) flagged the light mode `--faint` but the dark mode `--faint` value also has issues.
- **Severity:** HIGH
- **Recommended Fix:** Verify the contrast ratio with a reliable tool (WebAIM Contrast Checker). If the ratio is indeed below 4.5:1, lighten `--faint` in dark mode to approximately `#9896B8` (around 5.0:1 on #242428). All dark mode text color claims in Section 10.2.4 should be independently verified.

#### FINDING A-3: Dark mode clinical color pairs flagged as "Marginal" need resolution

- **Section:** `frontend-spec-1.md` Section 10.3
- **Problem:** The spec's own verification table flags two clinical color pairs as "Marginal" in dark mode: Watch (#E8B84A) vs Alert (#E87A40) with only approximately 20 degrees of hue separation, and Due (#7CA8E8) vs Info text (#8A96FF). The spec says these "MUST use text labels" but does not specify WHERE the text labels appear in the UI components that use these colors. For example, the vital signs 4-level system (Section 2.1.6) uses these colors as background tints on cards -- if the card border is Watch-amber and an adjacent card is Alert-orange, a user with color vision deficiency scanning the vitals section may not distinguish them. The "text labels always accompany color" mitigation is correct in principle but the spec does not verify that every single use of these clinical colors includes adjacent text.
- **Severity:** HIGH
- **Recommended Fix:** Audit every component that uses `--vital-watch` and `--vital-alert` in dark mode. Ensure each component renders a text label ("Watch" or "Alert") that is visible without relying on color distinction. Consider adding an icon differentiator (e.g., eye icon for Watch, warning triangle for Alert) to provide a third redundant signal beyond color and text.

#### FINDING A-4: No skip-to-content link specified

- **Section:** `frontend-spec-1.md` Section 9
- **Problem:** The existing audit (Finding 4 in `frontend-audit.md`) identified this gap. The three-part spec still does not specify a skip-to-content link. For keyboard and screen reader users, navigating past the bottom dock (4 tabs + Lomi button = 5 interactive elements) or the supervisor sidebar (11+ nav items) on every page load is a significant barrier. WCAG 2.4.1 (Level A) requires a mechanism to bypass repeated blocks.
- **Severity:** HIGH
- **Recommended Fix:** Add a visually hidden skip link as the first focusable element: `<a href="#main" class="sr skip-link">Skip to content</a>` that becomes visible on focus. Style with `.skip-link:focus { position: static; width: auto; height: auto; }`. Document this in Section 9.

#### FINDING A-5: Horizontal tab bar (.ptabs) min-height is 40px, below 44px target

- **Section:** `frontend-spec-3.md` Section 5.6
- **Problem:** The `.ptabs` horizontal tab bar (used in Person Detail for Health/Goals/Meds/Attendance/Case tabs) specifies each tab button at `min-height: 40px`. This is below the 44px minimum touch target mandated throughout the rest of the spec (Section 9.3). On mobile, these tabs are critical navigation elements for the supervisor Person Detail view.
- **Severity:** MEDIUM
- **Recommended Fix:** Increase `.ptabs` button `min-height` to 44px.

---

### 5. IDD SPECIFICITY

#### FINDING I-1: Bowel tracking absent despite Fatal Five criticality

- **Section:** `frontend-spec-2.md` Section 3.5, `frontend-spec-3.md` Section 13
- **Problem:** The Fatal Five conditions in IDD care are aspiration, bowel obstruction, dehydration, GERD, and seizures. Bowel obstruction is the second-leading cause of preventable death in IDD populations. Tracking bowel movements (frequency, consistency, interventions) is a fundamental clinical requirement. The health vitals form (Section 3.5) specifies Blood Pressure, Pulse, Temperature, and Weight -- but no bowel tracking. Bowel tracking is listed as Phase 4 item #32 alongside respiratory rate, SpO2, and blood glucose. Pushing bowel tracking to Phase 4 (weeks 13-16) means the app launches without a critical safety monitoring feature. Therap includes bowel tracking. State surveyors specifically check bowel documentation.
- **Severity:** HIGH
- **Recommended Fix:** Move bowel tracking to Phase 2 as part of the Health vital entry (Section 3.5). Add a "Bowel" segment to the segmented control alongside Vitals/Seizure/Illness/Visit. Fields: date/time, Bristol Stool Scale (1-7 visual selector), any intervention, and a "No BM today" checkbox that triggers a consecutive-day counter with alerting at the agency-configured threshold (commonly 3 days).

#### FINDING I-2: No controlled substance verification workflow in eMAR

- **Section:** `frontend-spec-2.md` Section 3.4
- **Problem:** Many IDD residential programs administer Schedule II-V controlled substances (e.g., methylphenidate, clonazepam, lorazepam). State regulations typically require a second-staff witness for controlled substance counts and administration. The eMAR spec (Section 3.4) has no mechanism for witness verification. A DSP recording a controlled substance administration looks identical to recording acetaminophen. This is a compliance gap that will surface during pharmacy audits and state surveys.
- **Severity:** HIGH
- **Recommended Fix:** Add a `controlled` boolean field to medication records. When a controlled substance is marked as Given, show a bottom sheet requiring witness name selection from the staff list and a witness confirmation checkbox. Log the witness in the MAR record. This is listed as Phase 4 item #33 but should be Phase 2 for any agency administering controlled substances.

#### FINDING I-3: Prompt level colors lack sufficient differentiation for the middle range

- **Section:** `frontend-spec-1.md` Section 2.1.5, ISP Prompt Levels
- **Problem:** The prompt level color scale goes: Independent (green #1A7A4D), Verbal (blue #2D5FBF), Gestural (lighter blue #5B6ECC), Model (purple #7B6DB5), Partial physical (amber #9A6700), Full physical (orange #C4500A), Refused (red #B42318). The middle three -- Gestural, Model, and Partial physical -- transition from blue through purple to amber. On a small phone screen, in quick succession during goal scoring, a DSP tapping pill-shaped trial buttons needs to instantly visually confirm they tapped the correct level. The blue-to-purple gradient (Verbal/Gestural/Model) may not be sufficiently distinct, especially for the estimated 8% of male DSPs with some degree of color vision deficiency. The trial pills use these colors at 13.5px text size on small colored backgrounds.
- **Severity:** MEDIUM
- **Recommended Fix:** Since Section 2.1.6 correctly notes "Each level must always be accompanied by a text label (never color-alone, per WCAG 1.4.1)," the text labels provide the primary identification. But the colors should still be optimized for quick scanning. Consider using shape or icon differentiators on the trial pills (e.g., a subtle icon prefix per level) rather than relying on five-step color gradients. Alternatively, use only three colors (green for Independent, blue for all prompted levels, red for Refused) and differentiate within the prompted levels by text label only.

#### FINDING I-4: No ISP quarterly progress report screen

- **Section:** `frontend-spec-3.md` Section 4.5 Reports, Section 4.7 Individual Management
- **Problem:** IDD agencies are required to produce ISP progress reports at regular intervals (typically quarterly) for ISP team meetings. These reports aggregate goal tracking data, health summaries, incident history, and medication compliance into a formatted document shared with the individual's planning team (case manager, family, guardians, therapists). The Reports section (4.5) lists 7 CSV exports but none generate an ISP progress report format. The Person Detail Goals tab shows progress bars and percentage but does not produce a formatted report. Therap generates ISP progress reports. This is a feature agencies will ask about during evaluation.
- **Severity:** MEDIUM
- **Recommended Fix:** Add an "ISP Progress Report" to the Reports list that generates a per-person report for a date range including: goal names with trial data and independence rates, health summary, incidents, medication compliance, and attendance. Format as printable HTML (eventually PDF). This can be Phase 3 or 4 but should be on the visible roadmap.

---

### 6. OFFLINE COVERAGE

#### FINDING O-1: Supervisor dashboard offline behavior is unspecified

- **Section:** `frontend-spec-2.md` Section 8.2
- **Problem:** Section 8.2's per-screen offline table covers only caregiver screens. The supervisor dashboard (Overview, Notes Review, Schedule, Analytics, Reports) has no offline behavior specification. What does a supervisor see when offline? The Lomi summary card requires an API call. KPI stat cards require server-side aggregation (or do they?). The attention queue depends on current data. Analytics charts show 4-week trends. If a supervisor opens Guad on a tablet during a car ride between homes, what renders? The `offline-sync.md` says supervisor note approval requires connectivity. But the spec should define what the supervisor UI looks like when offline -- empty states? Cached last-known data? Partial functionality?
- **Severity:** HIGH
- **Recommended Fix:** Add supervisor screens to the Section 8.2 offline table. At minimum: (1) Overview shows last-synced KPI values with a "Last updated X ago" timestamp; Lomi summary shows last cached version. (2) Notes list shows locally cached notes but "Approve"/"Send back" buttons are disabled with tooltip "Available when online." (3) Schedule shows cached schedule data. (4) Analytics and Reports show "Available when online" empty state. Document the PowerSync sync rules that determine which supervisor data is replicated to the device.

#### FINDING O-2: Browser SpeechRecognition offline fallback is misleading

- **Section:** `frontend-spec-2.md` Section 6.6
- **Problem:** The degradation cascade (Section 6.6) lists "Browser SpeechRecognition (Web Speech API)" as the offline transcription fallback when Whisper API is unavailable. However, on Android Chrome (the primary target platform for budget phones), `SpeechRecognition` sends audio to Google's servers for processing -- it does NOT work offline. Only recent versions of Chrome on specific platforms support on-device speech recognition, and Android WebView versions on budget phones almost certainly do not. The spec presents this as a reliable offline fallback when it is not available on the primary target hardware.
- **Severity:** HIGH
- **Recommended Fix:** Remove SpeechRecognition from the offline fallback path or clearly mark it as "available only when connectivity exists but Whisper API specifically fails." The true offline fallback is typing only. The spec should state this clearly: "When offline, voice recording and transcription are unavailable. The compose screen shows only the text input with prompt: 'Type your note -- voice is available when you're online.'"

#### FINDING O-3: Concurrent offline coverage acceptances create race condition

- **Section:** `frontend-spec-2.md` Section 8.3, `offline-sync.md`
- **Problem:** The coverage engine offers a shift to multiple eligible staff simultaneously (first-accept-wins). If two DSPs are both offline and both tap "I'll take it" for the same shift, both writes queue locally and both DSPs see confirmation UI ("Shift accepted"). When connectivity returns and both writes sync, the server must reject one. The conflict resolution table (Section 8.3) does not list coverage acceptance as a record type. The per-record-type rules cover notes, MAR, health, incidents, clock records, messages, person profiles, and goal scoring -- but NOT coverage_candidates or coverage_requests.
- **Severity:** MEDIUM
- **Recommended Fix:** Add coverage acceptances to the conflict resolution table. Strategy: server processes FIFO from the write queue. First acceptance wins. Second acceptance gets a rejection notification: "This shift was already filled by [name]. Your acceptance could not be processed." The UI should show a "Pending confirmation" state (not a definitive "Accepted") until the server confirms.

---

### 7. MOBILE REALITY

#### FINDING M-1: No landscape orientation handling specified

- **Section:** All mobile specifications
- **Problem:** The entire mobile spec is designed for portrait orientation (390x844 viewport). There is no mention of landscape orientation anywhere in the three spec files. DSPs sometimes prop their phone sideways on a shelf while documenting. In landscape, the bottom dock + Lomi button would consume approximately 130px of a 390px-tall viewport, leaving only 260px for content. The Lomi orb at 150px would fill most of the remaining space. Keyboard entry in landscape leaves almost no visible form content.
- **Severity:** MEDIUM
- **Recommended Fix:** Add a landscape section to the responsive breakpoints (Section 7.3). At minimum: (1) hide the "Talk to Lomi" button in landscape (still accessible from sidebar at wider widths). (2) Reduce dock height by removing tab labels (icon-only). (3) Reduce orb size to 100px in landscape. Or recommend portrait lock via `<meta name="screen-orientation" content="portrait">` in the PWA manifest if the experience is not designed for landscape.

#### FINDING M-2: 120px bottom padding creates significant dead zone on small phones

- **Section:** `frontend-spec-1.md` Section 2.3.2, `frontend-spec-2.md` Section 3.1
- **Problem:** The spec allocates 120px of bottom padding on mobile screens to clear the fixed dock (56px Talk to Lomi + 64px tab bar). On a budget phone with a 592px CSS viewport height (e.g., Samsung Galaxy A14 at 720x1600, 2.727 density = 264x587 CSS pixels), this means the content area is 587 - 50 (status bar) - 56 (app bar) - 120 (bottom padding) = 361px. With the greeting (54px) and progress card (56px) and an urgent alert (56px), only about 195px remain for the person list -- showing barely one full person card. The user's first impression is dominated by chrome and padding rather than actionable content.
- **Severity:** MEDIUM
- **Recommended Fix:** Reduce bottom safe area to the actual dock height plus safe-area-inset (approximately 90px on most devices). The 120px value includes a 20px scroll safety margin that can be reduced. Use `scroll-padding-bottom` instead of actual padding to ensure the last item is reachable without inflating the visual dead zone.

#### FINDING M-3: `color-mix()` fallback strategy incomplete

- **Section:** `frontend-spec-1.md` Section 10.7
- **Problem:** The spec identifies `color-mix()` as unsupported on Android WebView < Chrome 111 and suggests PostCSS fallbacks. But `color-mix()` is used extensively throughout the spec: focus rings, hover states, error shadows, interactive card borders, sky hover, scrim, and many more. The spec does not provide the actual fallback hex values for any of these usages. A developer must calculate each fallback manually. On budget Android phones, WebView updates lag Chrome by months or years. An Android phone purchased in early 2023 running WebView 110 or earlier would render all `color-mix()` values as invalid, potentially breaking focus indicators, hover states, and error highlights.
- **Severity:** HIGH
- **Recommended Fix:** For every `color-mix()` usage in the spec, provide the pre-computed hex fallback value inline. Example: `border-color: #9FB1E0; border-color: color-mix(in srgb, var(--blue) 40%, transparent);` (property duplication, older browsers use the first valid value). List all color-mix usages and their fallbacks in a reference table.

---

### 8. COMPETITIVE EDGE

#### FINDING E-1: Therap competitive claims are stale

- **Section:** `frontend-spec-3.md` Section 12
- **Problem:** The existing audit (Finding 16) noted that Therap now has an AI-powered Fatal Five Dashboard, contradicting Guad's competitive positioning. Additionally, Therap launched a mobile-responsive redesign in late 2025 and added AI-assisted documentation review in 2026. Several claims in Section 12 may no longer be accurate: "Therap: Looks like 2005 enterprise software" and "Therap: Desktop-first, mobile is afterthought" may have been partially addressed. Competitive positioning based on stale information risks embarrassment during agency demos.
- **Severity:** MEDIUM
- **Recommended Fix:** Re-validate every competitive claim in Section 12 against current Therap and Brittco capabilities. Date-stamp the competitive analysis. Update claims that are no longer accurate. Focus competitive messaging on durable advantages: voice-to-note workflow, offline-first architecture, automated coverage engine, and warm design language.

#### FINDING E-2: No billing/EVV integration specification

- **Section:** Entire spec
- **Problem:** IDD agencies bill Medicaid for services rendered. The billing process requires EVV (Electronic Visit Verification) data, attendance records, and documentation. The spec mentions EVV-compliant clock-in (GPS) but does not specify: (1) EVV export formats (aggregators like Sandata, HHAeXchange, and state-specific formats), (2) billing code mapping from services to HCPCS codes, (3) attendance-to-billing reconciliation workflows. For agencies evaluating Guad, "Does it integrate with our billing?" is a top-3 question. Therap has deep Medicaid billing integrations. Guad's silence on billing is a competitive weakness that agencies will notice immediately.
- **Severity:** MEDIUM
- **Recommended Fix:** This is not a frontend design issue per se, but the frontend spec should at least specify: (1) an EVV export screen under Reports showing state-specific export format options, (2) an attendance recording screen that captures billable service types, and (3) a note in the roadmap acknowledging billing integration as a planned feature.

---

### 9. AI UX

#### FINDING AI-1: No "Try again" or "Regenerate" option for poor AI output

- **Section:** `frontend-spec-2.md` Section 3.2 Step 4
- **Problem:** After the DSP speaks and Lomi generates a structured draft, the only options on the review screen are "Edit" (manually fix text) and "Sign and submit." If Lomi produces a nonsensical draft (hallucinated details, misattributed activities to the wrong section, garbled text from poor audio), the DSP must manually rewrite every section. There is no "Ask Lomi to try again" button, no "Start over with new recording" option, and no way to re-submit the same transcript for re-processing. The 3-8 second wait for AI processing, followed by discovering the output is unusable, followed by manual rewriting, would be deeply frustrating.
- **Severity:** HIGH
- **Recommended Fix:** Add a "Start over" text button to the review screen action bar that returns to the compose screen with the original transcript pre-loaded. Add a "Re-draft" option that re-sends the transcript to the AI. Both options should be secondary actions (text buttons, not prominent) to avoid implying the AI output is usually bad.

#### FINDING AI-2: Removing the offline fallback banner may confuse quality expectations

- **Section:** `frontend-spec-2.md` Section 6.6
- **Problem:** The spec says "No fallback banner is shown" when the rules-based fallback is used instead of AI drafting, reasoning that the banner "creates unnecessary anxiety." But the rules-based fallback uses regex categorization, which is significantly lower quality than Claude-generated structured output. A DSP accustomed to high-quality AI drafts will suddenly see poor categorization (sentences in wrong sections, no vague language improvement, no incident detection) with no explanation. They may blame their own speaking, waste time trying to figure out what went wrong, or lose trust in the system.
- **Severity:** MEDIUM
- **Recommended Fix:** Show a subtle, non-alarming indicator when the fallback was used. Not a red error banner, but a small muted text line at the top of the review card: "Organized by topic -- review each section." This signals to the DSP that the output may need more attention without using the word "error" or "offline" or "unavailable."

#### FINDING AI-3: Lomi summary generation latency on supervisor dashboard is unspecified

- **Section:** `frontend-spec-3.md` Section 4.1
- **Problem:** The Lomi summary card on the supervisor Overview dashboard requires an API call to generate. The spec shows a "Refresh summary" button and a "Refreshed 2 min ago" timestamp, but does not specify: (1) What appears on first load before the summary generates (skeleton? placeholder text?). (2) What latency is acceptable (the AI endpoint may take 5-15 seconds for a comprehensive summary). (3) What happens when the API call fails. (4) Whether the summary is cached and reused across page navigations. A supervisor opening the Overview for the first time each morning should not stare at a loading skeleton for 10+ seconds before seeing their most important information.
- **Severity:** MEDIUM
- **Recommended Fix:** Specify the loading sequence: (1) On first load, show a one-line static fallback: "Loading Lomi's summary..." in the card. (2) Populate KPI stats immediately from local data (these do not require AI). (3) Stream the Lomi summary when the API responds. (4) Cache the last summary in localStorage/PowerSync and show it immediately with a "Refreshed X ago" timestamp, updating in the background.

---

### 10. MISSING ELEMENTS

#### FINDING X-1: No session timeout UX specification

- **Section:** Not present in the frontend spec
- **Problem:** `security.md` specifies a 12-hour inactivity timeout (configurable to 15 minutes minimum). But the frontend spec contains zero screen-level specification for what happens when a session expires. No blur overlay design. No re-authentication screen. No specification for saving in-progress form data before the timeout kicks in. No specification for the PIN/biometric prompt. This is a PHI-critical UX flow that affects every screen in the app, and it is entirely absent from the design specification.
- **Severity:** CRITICAL
- **Recommended Fix:** Add a "Security UX" section to the frontend spec covering: (1) Timeout warning toast at 2 minutes before expiry: "Your session will expire in 2 minutes. Tap to stay signed in." (2) On expiry: full-screen blur overlay with re-auth form (PIN or biometric). (3) Auto-save all form state before blur. (4) On successful re-auth: remove blur, restore exact previous state. (5) On failed re-auth (3 attempts): clear local PHI, redirect to sign-in.

#### FINDING X-2: No error state specifications for API failures

- **Section:** Multiple
- **Problem:** The spec describes error handling for microphone denial, transcription failure, and validation errors on forms. But there is no specification for general API failure states: (1) What happens when the Lomi AI endpoint returns a 500 error? (2) What happens when a sync write fails server-side (RLS violation, constraint error)? (3) What happens when the PowerSync WebSocket connection drops during a sync? (4) What happens when a tRPC mutation returns an error? The spec's offline-first philosophy handles the "no connectivity" case well, but "connectivity exists but server returns errors" is a different failure mode with no UI specification.
- **Severity:** HIGH
- **Recommended Fix:** Add an error handling section that specifies: (1) Transient API errors: retry silently 3 times with exponential backoff, then show a toast "Something went wrong. Your work is saved locally." (2) Permanent errors (validation, authorization): show inline error with specific guidance. (3) Sync errors: show in the sync status indicator with expandable detail. (4) Never show raw error messages, stack traces, or error codes to users.

#### FINDING X-3: No multi-language / internationalization consideration

- **Section:** Not present
- **Problem:** A significant percentage of DSPs in the United States speak English as a second language (Spanish, Haitian Creole, Amharic, Somali are common in the IDD workforce). The spec is entirely English-only with no mention of i18n, localization, or language preferences. All UI copy, error messages, Lomi prompts, and clinical terminology are hardcoded in English. While full localization is a large effort, not even acknowledging it as a future need means the architecture will not be prepared for it (hardcoded strings throughout, no translation key system, no RTL consideration).
- **Severity:** MEDIUM
- **Recommended Fix:** Add a brief i18n section to the spec acknowledging: (1) All user-facing strings should use a key-value translation system (even if only English is shipped initially). (2) Lomi voice input should accept non-English speech (Whisper supports 99 languages). (3) Date/time formatting should be locale-aware. (4) Spanish and Haitian Creole are the highest-priority second languages based on IDD workforce demographics. This does not require immediate implementation but should inform architecture decisions.

#### FINDING X-4: No data retention or deletion specification

- **Section:** Not present
- **Problem:** HIPAA requires covered entities to define data retention policies. IDD documentation retention requirements vary by state (typically 6-7 years after last service). The frontend spec does not address: (1) What happens to old records in the UI? Are 3-year-old notes still visible? (2) Is there a data export/download feature before deletion? (3) Who can initiate data deletion? (4) How is deletion communicated to the user? (5) What about the "right to be forgotten" for staff records? The local PowerSync database will grow over time -- the sync rules in `offline-sync.md` specify a 30-day window, but the server-side retention and the UI for managing old data are unspecified.
- **Severity:** MEDIUM
- **Recommended Fix:** Add a data retention section covering: (1) Server-side retention of 7 years (configurable per state). (2) Local device storage shows last 30 days (PowerSync sync window). (3) Supervisor "Archive" view for accessing older records on-demand (online only). (4) Data export capability in the Reports section for full agency data download. (5) Staff record deactivation (not deletion) to preserve audit trail integrity.

---

### 11. DARK MODE

#### FINDING D-1: Dark mode `--blue-disabled` is effectively invisible

- **Section:** `frontend-spec-1.md` Section 10.2.2
- **Problem:** Dark mode `--blue-disabled` is `#4A4E70` on `--card` (#242428). The spec states 1.8:1 contrast. A disabled primary button would be a rectangle of `#4A4E70` on a `#242428` card -- barely distinguishable from the card background. While disabled elements are intentionally de-emphasized, a 1.8:1 ratio means users may not perceive the button exists at all. They may think the action is simply unavailable rather than disabled. In a medication pass at 3am in dark mode, a DSP should be able to see that a "Mark as given" button exists but is disabled (e.g., because the medication time has not arrived) rather than thinking no button is present.
- **Severity:** MEDIUM
- **Recommended Fix:** Increase dark mode `--blue-disabled` to approximately `#5E6290` (around 2.5:1) and add a 1px border in `--line` (#303038) to give the disabled button a visible boundary even at low contrast. The goal is "visible but clearly non-interactive," not "invisible."

#### FINDING D-2: Lemon orb in dark mode lacks specification

- **Section:** `frontend-spec-1.md` Section 10.2.3
- **Problem:** The lemon orb's dark mode appearance specifies the lemon token shifts from `#FFD66B` to `#E8C050` and the lemon-2 background shifts to `#2A2618`. But the orb on the compose screen uses TWO concentric rings (Ring1: `#FFF3C4`, Ring2: `#FFE9A8`) plus the lemon SVG. These ring colors are not listed in the dark mode palette. The orb's custom shadow (`rgba(140,100,0,0.6)`) is also unspecified for dark mode. Since the compose screen is where DSPs spend the most interactive time, and dark mode is specifically for overnight shifts when the orb would be most prominent, this gap is notable.
- **Severity:** LOW
- **Recommended Fix:** Add dark mode values for Ring1, Ring2, and the orb shadow to Section 10.2.3. Suggested values: Ring1 `#3A3420`, Ring2 `#4A3E18`, shadow `rgba(100,80,0,0.3)`.

---

### 12. SECURITY UX

#### FINDING S-1: No PHI blur-on-background specification

- **Section:** Not present in frontend spec
- **Problem:** `security.md` (Threat T2) states: "PIN/biometric lock required to resume a backgrounded session (PWA lifecycle hook)." The frontend spec does not specify this behavior at all. When a DSP switches to another app (camera, phone call, text message) or locks their screen, PHI is visible in the app's recent-apps thumbnail on both iOS and Android. On Android, the recent apps screen shows a screenshot of the last visible state. If the Guad app was showing a medication list or health vitals, this PHI is visible to anyone who sees the recent apps screen.
- **Severity:** HIGH
- **Recommended Fix:** Specify `visibilitychange` event handling: when the document becomes hidden, immediately apply a CSS class that blurs all `.screen` content (`filter: blur(20px)`) and overlays the Guad wordmark. On becoming visible again, show a PIN/biometric re-auth screen if the background duration exceeded 30 seconds (configurable). For the recent-apps thumbnail, the blur ensures no PHI is visible. Add `<meta name="apple-mobile-web-app-status-bar-style" content="default">` and handle the PWA `beforeunload` event to trigger the blur.

#### FINDING S-2: Shared device scenario is undesigned

- **Section:** Not present
- **Problem:** In many group homes, a shared tablet sits at the staff desk. Multiple DSPs use it during their shifts. The current sign-in is a list of names with no passwords. The production auth flow (email + password) means each DSP must fully sign out and the next DSP must enter credentials. This is friction that will push DSPs back to paper. The spec does not design for: (1) Fast user switching (switch to another user without full sign-out/sign-in), (2) Shared device policies (auto-lock after 5 minutes, clear PHI between users), (3) Multi-user session management (multiple cached sessions on one device).
- **Severity:** MEDIUM
- **Recommended Fix:** Add a "Switch user" flow in the "Me" tab specification: tap "Switch user" shows a bottom sheet with other staff who have signed in on this device (cached sessions, encrypted per user). Selecting a user prompts for PIN/biometric only (no full email+password). On switch, the previous user's cached PHI is encrypted and inaccessible. Limit to 5 cached user sessions per device.

---

### What the Specification Does WELL

Despite the issues identified above, this specification demonstrates exceptional quality in several areas:

1. **Clinical color system rigor.** The four-level vital signs palette, the five-status medication palette, and the seven-level prompt level gradient are clinically meaningful, not decorative. The conscious separation of Held (amber) from Refused (red) -- with an explicit compliance note about state surveyor expectations -- shows genuine IDD domain understanding.

2. **Warm design language with clinical precision.** The spec successfully threads the needle between warm and professional. The cream background, Georgia serif, lemon accent, and 20px card radius create genuine warmth without compromising clinical rigor. The rule that clinical data cards use 18px radius (slightly smaller than navigation cards at 20px) to "subtly signal professional record vs friendly surface" is a sophisticated design decision.

3. **Offline-first architecture commitment.** The principle that "No error dialogs block documentation" and the refusal to show red indicators for connectivity status demonstrate a mature understanding of the target environment. The per-screen offline behavior table, while incomplete for supervisor screens, is more thorough than any competitor's offline specification.

4. **Comprehensive WCAG verification tables.** The Section 9.2 contrast verification table covers every text-on-background combination in the palette with computed ratios and pass/fail status. The identification and correction of `--faint` from `#8B89AA` (3.5:1, FAIL) to `#706E96` (4.55:1, PASS) shows the spec was actively audited against WCAG, not just aspirationally labeled "accessible."

5. **Voice-to-note paradigm.** The speak-draft-review-sign workflow is genuinely innovative in the IDD space. The detailed specification of recording states, orb animations, thinking states, fallback paths, and the explicit trust message ("You review and sign every note. Lomi never submits for you.") shows careful thought about AI trust in clinical documentation.

6. **Hardcoded color audit.** Section 10.7's file-and-line-number audit of every hardcoded hex value that must be replaced with CSS custom properties for dark mode to work is the kind of practical, actionable specification that actually gets bugs fixed.

7. **Navigation depth analysis.** The maximum navigation depth table (Section 7.2) showing that every key flow completes in 3-5 taps, compared to Therap's 7-8, is a concrete competitive metric that can be validated with real users.

8. **Forgiving interaction design.** The auto-save philosophy (500ms debounce to IndexedDB), the "Resume where you left off?" toast on return, the 5-second undo window for destructive actions, and the required-fields-marked-from-start approach all demonstrate understanding that DSPs are constantly interrupted during documentation.

9. **Lomi personality constraints.** The rule that Lomi does NOT appear during active documentation, MAR, incident reports, or vitals entry shows disciplined restraint. The "max 1 proactive tip per session" limit prevents the AI from becoming annoying. The five Lomi expressions (neutral, happy, thinking, encouraging, concerned) provide personality without over-anthropomorphizing.

10. **Comprehensive component token system.** The button variant table with four states each (default, hover, active, disabled), the input state table with five states (default, focus, error, disabled, read-only), and the card variant table with seven types provide enough specificity for a developer to implement any component without guessing.

---

### Summary of New Findings by Severity

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 4 | C-1 (Design system color mismatch), C-2 (Dark mode palette mismatch), A-1 (Pill.due WCAG failure), X-1 (No session timeout UX) |
| HIGH | 13 | C-3 (FAB vs pill identity), C-4 (Missing screens), K-1 (btn.lemon inconsistency), K-4 (Blue hex inconsistency), P-3 (Progressive disclosure hides differentiator), A-2 (Dark mode faint contrast), A-3 (Marginal clinical colors), A-4 (No skip-to-content), I-1 (No bowel tracking), I-2 (No controlled substance workflow), O-1 (Supervisor offline unspecified), O-2 (SpeechRecognition offline misleading), M-3 (color-mix fallbacks), AI-1 (No regenerate option), X-2 (No API error states), S-1 (No PHI blur-on-background) |
| MEDIUM | 13 | C-5 (Multi-home workflow), K-2 (btn.sm height), K-5 (Toast timing), P-1 (Spec volume), A-5 (ptabs height), I-3 (Prompt level colors), I-4 (No ISP progress report), O-3 (Coverage race condition), M-1 (No landscape), M-2 (120px bottom dead zone), E-1 (Stale Therap claims), E-2 (No billing spec), AI-2 (No fallback indicator), AI-3 (Lomi summary latency), X-3 (No i18n), X-4 (No data retention), D-1 (Disabled button invisible in dark), S-2 (Shared device) |
| LOW | 3 | P-2 (Night mode premature), K-3 (Seg height inconsistency), D-2 (Orb dark mode rings) |

### Recommended Priority for Addressing

**Before implementation begins (resolve document conflicts):**
1. Reconcile `design-system.md` with `frontend-spec-1.md` (Findings C-1, C-2, K-1, K-2, K-4)
2. Fix `.pill.due` WCAG failure (Finding A-1)
3. Resolve FAB vs pill button design decision (Finding C-3)
4. Add missing screen specifications (Finding C-4)

**Before MVP pilot:**
5. Design session timeout and re-auth UX (Finding X-1)
6. Design PHI blur-on-background behavior (Finding S-1)
7. Add API error state specifications (Finding X-2)
8. Provide color-mix() fallback values (Finding M-3)
9. Verify dark mode contrast ratios independently (Finding A-2)
10. Show voice button from Day 1 (Finding P-3)

**Before first agency onboarding:**
11. Add bowel tracking to Health (Finding I-1)
12. Add controlled substance witness workflow (Finding I-2)
13. Add "Start over" / "Re-draft" to review screen (Finding AI-1)
14. Specify supervisor offline behavior (Finding O-1)
15. Add skip-to-content link (Finding A-4)
16. Correct SpeechRecognition offline claim (Finding O-2)

**Production roadmap:**
17. Multi-language/i18n architecture (Finding X-3)
18. ISP progress report generation (Finding I-4)
19. Data retention specification (Finding X-4)
20. Shared device / fast user switching (Finding S-2)
21. Landscape orientation handling (Finding M-1)
22. Update competitive claims (Finding E-1)
23. Billing/EVV export specification (Finding E-2)
