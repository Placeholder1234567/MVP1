# Guad Frontend Design Specification

> Extracted from the production codebase (`styles.css`, `src/app-caregiver.js`, `src/app-office.js`, `src/app-core.js`, `src/app-main.js`) as the living design reference for Guad's MVP1 prototype.

---

## 1. Design Philosophy

Guad is an AI-powered IDD (intellectual/developmental disabilities) documentation, scheduling, and shift coverage PWA. The design targets two user archetypes:

- **DSPs (Direct Support Professionals):** Work shifts at group homes and day programs. Use cheap Android phones on slow group-home WiFi. Need to document shifts, track goals, administer medications, and report incidents quickly.
- **Office staff (Supervisors/Admins):** Manage multiple homes, review documentation, handle scheduling, and monitor compliance. Use desktops or tablets.

The visual identity is warm, human, and professional -- intentionally NOT enterprise healthcare or generic AI software. The AI assistant "Lomi" is presented as a helpful colleague, not a clinical tool.

---

## 2. Color System

### Light Mode (Default)
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#FFFCF3` | Page background (warm cream) |
| `--card` | `#FFFFFF` | Card surfaces |
| `--ink` | `#1C1B4B` | Primary text (deep navy) |
| `--muted` | `#5A5880` | Secondary text |
| `--faint` | `#8B89AA` | Tertiary text, icons |
| `--line` | `#ECEDF6` | Card borders, dividers |
| `--line2` | `#DADDF3` | Input borders, stronger dividers |
| `--blue` | `#2F3ED8` | Primary accent, interactive elements |
| `--blue-d` | `#2230B8` | Hover state for primary blue |
| `--sky` | `#EEF0FF` | Blue tint backgrounds |
| `--lemon` | `#FFD66B` | Lomi accent, warning badges |
| `--lemon-2` | `#FFF4CC` | Lemon tint backgrounds |
| `--lemon-line` | `#F2D27A` | Lemon borders |
| `--ok` | `#1F7A4D` | Success text |
| `--ok-bg` | `#E6F4EC` | Success background |
| `--bad` | `#B42318` | Error/danger text |
| `--bad-bg` | `#FDECEA` | Error/danger background |

### Dark Mode (defined but disabled via `max-width:0px` media query)
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#12122E` | Dark page background |
| `--card` | `#1C1C42` | Dark card surfaces |
| `--ink` | `#F2F1FF` | Light text on dark |
| `--muted` | `#B7B6DA` | Secondary text on dark |
| `--faint` | `#8C8BB4` | Tertiary text on dark |
| `--line` | `#2B2B5A` | Borders on dark |
| `--line2` | `#3A3A70` | Stronger borders on dark |
| `--blue` | `#8590FF` | Primary accent on dark |
| `--blue-d` | `#A2AAFF` | Hover accent on dark |
| `--sky` | `#24255A` | Blue tint on dark |
| `--ok` | `#7FD8A8` | Success on dark |
| `--ok-bg` | `#1B3A2C` | Success background on dark |
| `--bad` | `#FF9C94` | Error on dark |
| `--bad-bg` | `#3D1F25` | Error background on dark |

Dark mode is defined as `data-theme="guad-dark-off"` and via a prefers-color-scheme media query that is intentionally disabled (`max-width:0px`). There is no user-facing toggle.

### Shadows
- Cards: `0 1px 2px rgba(28,27,75,.05), 0 8px 24px -16px rgba(28,27,75,.25)`
- Dark mode: `none`

---

## 3. Typography

| Role | Font | Weight | Size | Notes |
|------|------|--------|------|-------|
| Body | Figtree (Google Fonts), fallback: Segoe UI, system-ui, -apple-system, sans-serif | 400 | 16px | Line-height 1.5, antialiased |
| Headings (serif) | Georgia, Times New Roman, serif | 400 | Varies | Letter-spacing -0.02em |
| Wordmark | Georgia serif | 400 | 24-30px | Used for "Guad" branding |
| Section headings | Figtree | 600 | 15px | `.section-h h2` |
| Appbar title | Figtree | 600 | 17px | |
| Buttons | Figtree | 600 | 14-16px | |
| Labels | Figtree | 600 | 13px | Color: `--muted` |
| Small text | Figtree | 400 | 13-14px | `.s13`, `.s14` |
| Pill badges | Figtree | 700 | 12.5px | |
| KPI numbers | Figtree | 600 | 30px | Letter-spacing -0.01em |

Georgia serif is used for greeting headings ("Good morning, Name"), the wordmark, page titles in the supervisor dashboard, and the Lomi compose screen title. Figtree is used for everything else.

---

## 4. Layout Architecture

### Mobile (< 900px)
- Max-width: 420px, centered
- Bottom navigation dock with 4 tabs: Today, Notes, Shifts, Me
- Central Lomi FAB ("Talk to Lomi") button above tabs
- Screens scroll vertically with `padding: 4px 16px 120px` (extra bottom padding for dock)
- At 700px+: app gets a border, rounded corners (32px), and a phone-frame shadow

### Desktop (>= 900px for caregiver, >= 900px for supervisor)
- **Caregiver desktop:** 2-column grid: 248px sidebar + fluid main area (max 920px, auto-centered)
  - Sidebar contains: wordmark, "Talk to Lomi" button, navigation (Today/Notes/Shifts/Messages/Me), user info
  - Bottom dock is hidden; sidebar navigation replaces it
  - Action bars become sticky-bottom within the main content area
- **Supervisor desktop:** 2-column grid: 220px sidebar + fluid main (max 1200px)
  - Sidebar contains: wordmark, home selector dropdown, 11 navigation items (Overview/Schedule/Notes/Incidents/Medications/Health/People/Messages/Analytics/Reports/Setup), user info
  - Main content uses various sub-layouts per section (split view for notes, grid for schedule, etc.)

### Responsive Breakpoints
| Breakpoint | Behavior |
|-----------|----------|
| < 560px | Demo bar note hidden, smaller tab buttons |
| < 700px | Mobile dock fixed at bottom |
| >= 700px | Dock/nav becomes sticky, app gets phone frame |
| < 900px | Supervisor sidebar collapses to horizontal scrollable tabs; stats become 2-column |
| >= 900px | Full sidebar layouts for both caregiver and supervisor |

---

## 5. Component Library

### Cards
- Background: `--card` (#FFFFFF)
- Border: 1px solid `--line`
- Border-radius: 20px
- Shadow: `--shadow`
- Padding: 16px 18px (`.pad`)

### Buttons
| Variant | Appearance | Min-height | Border-radius |
|---------|-----------|------------|---------------|
| Primary (`.btn`) | Blue bg, white text | 52px | 999px (pill) |
| Secondary (`.btn.sec`) | White bg, border, dark text | 52px | 999px |
| Lemon (`.btn.lemon`) | Lemon bg, dark text | 52px | 999px |
| Small (`.btn.sm`) | Same as above | 42px | 999px |
| Text (`.textbtn`) | No bg, blue text | 44px | - |
| Icon (`.iconbtn`) | 44x44 circle, transparent bg | 44px | 999px |

### Pills / Badges
- Border-radius: 999px
- Padding: 4px 10px
- Font: 12.5px, weight 700
- Variants: `.due` (lemon), `.ok` (green bg), `.bad` (red bg), `.info` (sky bg), `.mute` (transparent, border)

### Mini Badges
- 12px, weight 600, padding 2px 8px
- Same color variants as pills

### Inputs
- Border: 1px solid `--line2`
- Background: `--card`
- Border-radius: 14px
- Padding: 12px 14px
- Font-size: 16px
- Min-height: 50px
- Focus: blue border, 3px blue glow

### Segmented Controls
- Container: `--sky` background, 14px border-radius, 4px padding
- Active button: `--card` background, `--blue` text, 11px border-radius, subtle shadow

### Choice Groups (chip selectors)
- Buttons: 1px solid `--line2`, `--card` bg, 999px border-radius, padding 8px 14px
- Active: `--ink` background, `--bg` text color (inverted)

### Callouts
- Border-radius: 18px
- Padding: 14px 16px
- Variants: `.warn` (lemon tint + border), `.info` (sky + blue border), `.bad` (red tint + border)

### Lists
- Rows: flex, gap 14px, padding 14px 16px, top border 1px `--line`
- First row in card: no top border
- Row hover: semi-transparent sky background
- When inside `.card`: first/last child get rounded corners

### Bottom Sheets
- Scrim: fixed overlay, `rgba(18,18,46,.45)`
- Sheet: `--card` bg, top rounded 26px, padding 10px 20px
- Max-height: 85vh, overflow auto
- Grab handle: 40x5px, `--line2` color, centered
- At >= 700px: sheet centers vertically with full rounded corners

### Toasts
- Fixed position, bottom center (110px up, or 200px when caregiver dock is showing)
- `--ink` background, `--bg` text
- Pill shape (999px radius)
- 2.8s auto-dismiss
- z-index: 40

### Avatars
- Default: 44x44, `--sky` bg, `--blue` text, 999px radius
- Small: 34x34
- Square variant: 14px border-radius

### Progress Bars
- Track: 6px height, `--sky` bg, 999px radius
- Fill: `--blue`, animated width transition (0.4s ease)

---

## 6. Screen Inventory

### Onboarding & Auth
1. **Setup Wizard** (`V.setup`) -- Create agency, first home with GPS coordinates
2. **Sign-in** (`V.signin`) -- Developer sign-in, select user from staff list

### Caregiver Screens
3. **Today** (`V.cgToday`) -- Greeting, clock-in card (if not clocked in), today's progress bar, client list with status badges, shift offers
4. **Clock-in** (inline in Today) -- GPS location detection, home ranking by distance, manual clock-in option
5. **Person Detail** (`V.person`) -- Client overview: shift note status, medications due, attendance, health, behavior notes, incidents
6. **Compose** (`V.compose`) -- Voice/text input to Lomi, animated orb, transcript area, topic suggestions
7. **Review** (`V.review`) -- Lomi-drafted or manual note with structured sections, inline goal tracking with prompt levels, vague wording flags, incident detection
8. **Done** (`V.done`) -- Confirmation screen after note signing
9. **MAR** (`V.mar`) -- Medication list: scheduled doses (give/refuse/hold), PRN medications, effect recording
10. **Health** (`V.health`) -- Tabbed entry: Vitals, Seizure, Illness, Visit
11. **Incident Report** (`V.incident`) -- 3-step wizard: What happened -> Injury -> Notifications
12. **Health Summary** (`V.summary`) -- Client health profile, current medications, latest vitals
13. **Notes** (`V.cgNotes`) -- Today's recorded notes, meds, health entries, incidents, attendance
14. **Shifts** (`V.cgShifts`) -- Clock-in status, shift offers, 7-day schedule, callout option, coverage status
15. **Me** (`V.cgMe`) -- Profile: homes, shifts this week, med certification, clock out, switch user
16. **Messages** (`V.msgs`) -- Home team channel, Lomi coverage updates, message composer

### Supervisor/Admin Screens
17. **Overview** (`O.overview`) -- Greeting, Lomi summary card, 4 KPI stats, attention items list
18. **Schedule** (`O.schedule`) -- Weekly grid (7 days x 3 shifts), coverage activity timeline, slot assignment sheet
19. **Notes Review** (`O.list "notes"`) -- Split view: note list + selected note detail, approve/send back
20. **Incidents** (`O.list "incidents"`) -- Split view: incident list + detail, notification checklist, follow-up
21. **Medications** (`O.meds`) -- Table view: all people x medications, today's MAR status
22. **Health** (`O.health`) -- Health entries list with flags, follow-up acknowledgment
23. **People** (`O.people`) -- Client list, person detail tabs (Overview/Goals/Medications/Attendance/Case notes)
24. **Messages** (`O.msgs`) -- Home team channel (same as caregiver but in desktop layout)
25. **Analytics** (`O.analytics`) -- 4-week trend charts: Coverage (callouts, fill rate, fill time), Documentation (notes signed, Lomi usage, charting time, send-backs), Care (doses, incidents, goal progress)
26. **Reports** (`O.reports`) -- CSV export: notes, incidents, MAR, goals, attendance, coverage, clock-ins
27. **Setup** (`O.setup`) -- Homes management (name, address, GPS, radius), Staff management (name, role, med-cert, home assignments)

---

## 7. Lomi AI Integration

### Visual Identity
- **Orb:** 210x210px with two concentric radial gradient rings (lemon tones), centered lemon SVG (104px)
- **FAB:** 66x66px circle, `--lemon` background, 4px `--bg` border, drop shadow
- **Breathing animation:** 2.4s ease-in-out scale pulse (1.0 -> 1.05) when active
- **Audio waveform:** 10 bars with staggered `scaleY` animation

### Compose Flow
1. User taps "Talk to Lomi" from dock or sidebar
2. Chooses client from bottom sheet
3. Compose screen: topic suggestions ("Meals", "Mood", "Goals", "Anything unusual"), orb, transcript area
4. User speaks (MediaRecorder -> /api/transcribe -> Whisper) or types
5. Taps "Done, write my note" -> Lomi orb animates thinking -> Review screen
6. If API unavailable: rules-based fallback with `fallback: true` flag

### Note Review
- Structured sections with editable textareas
- Vague wording flags (lemon callout with "Fix it" / "Keep as is" buttons)
- Incident detection callout (blue, with "File report" / "Not an incident" buttons)
- Goal tracking: expandable per-goal with prompt level buttons
- Attestation checkbox required before signing

### Supervisor Summary
- Lomi card on Overview dashboard
- Summarizes: open incidents, health alerts, refused/held meds, open shifts, missing notes, notes to review
- Generated via `/api/lomi` with `task: "summary"`

---

## 8. Accessibility

### Current Implementation
- `focus-visible` outline: 3px solid `--blue`, 2px offset
- Screen-reader-only class (`.sr`): position absolute, clipped
- `aria-pressed` on toggle buttons (choice groups, tabs)
- `aria-current="page"` on active navigation items
- `aria-label` on icon buttons (Back, Team messages, etc.)
- `role="status"` on toast element
- `role="group"` on segmented controls and choice groups
- `role="alert"` on error messages
- `role="img"` with `aria-label` on analytics charts
- `prefers-reduced-motion`: animations disabled (orb breathing, loading dots, wave bars, progress bar transitions)
- `prefers-color-scheme`: dark mode defined (but disabled)
- Safe-area insets: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)` for notched devices
- `viewport-fit=cover` for edge-to-edge display
- `-webkit-text-size-adjust: 100%` to prevent iOS text scaling
- Minimum touch targets: 44px for icon buttons, 42-52px for regular buttons, 48px for nav tabs

### Known Gaps
- No skip-to-content link
- No landmark regions (`<main>`, `<nav>`, `<header>` are used inconsistently -- some screens use `<header class="appbar">` but many use `<div>`)
- Charts are `role="img"` with text-based `aria-label` but have no tabular alternative
- Color contrast has not been formally audited
- No `aria-live` regions for dynamic content updates (Lomi thinking, coverage status changes)
- No keyboard navigation testing documented
- Tab order follows DOM order (no `tabindex` management)

---

## 9. Offline & Data Layer

### Current Architecture
- **Data store:** `localStorage` via `src/store.js`
- **Persistence:** Full app state serialized to `guad-data-v1` key
- **Save frequency:** After every render (`C.save()` called at end of `render()`)
- **Auto-save:** Note text captured on every `input` event
- **No service worker:** App requires network for initial load
- **No PWA manifest:** No `manifest.json`, no install prompt
- **No sync:** Data exists only in current browser

### What Works Offline (after initial load)
- Full UI rendering (all JS is loaded up front)
- Data entry and navigation
- Draft persistence in localStorage

### What Requires Network
- Initial page load (HTML, CSS, JS, Google Fonts)
- Lomi AI drafting (`/api/lomi`)
- Voice transcription (`/api/transcribe`)
- If network fails mid-use: localStorage saves survive, but Lomi falls back to rules

---

## 10. Technology Stack

| Layer | Technology |
|-------|-----------|
| Markup | Plain HTML5 |
| Styling | Single CSS file, CSS custom properties, no preprocessor |
| JavaScript | Vanilla JS (ES5 with async/await), IIFE modules, no bundler |
| Fonts | Google Fonts (Figtree), system serif (Georgia) |
| Icons | Inline SVG paths (no icon library) |
| API | Vercel Serverless Functions (`/api/lomi`, `/api/transcribe`) |
| AI | Anthropic Claude (Lomi drafting/summary), OpenAI Whisper (transcription) |
| Deployment | Vercel |
| Data | localStorage (browser-only, development) |

No build step. No framework. No npm dependencies at runtime. Package.json exists but has no scripts.

---

## 11. Navigation Patterns

### Caregiver Mobile
```
[Today] [Notes] [Shifts] [Me]
         [Talk to Lomi]          <- centered FAB above tabs
```
- Bottom dock: fixed, `--card` background, border-top
- FAB: 66px lemon circle, negative margin-top (-28px) to overlap tabs
- Active tab: `--blue` text
- Notification dots: 9px red circles on tab icons

### Caregiver Desktop
- Left sidebar (248px) replaces bottom dock
- "Talk to Lomi" is a full-width button at top of nav
- Navigation items: icon + text, 44px min-height, 12px border-radius hover state
- Active item: card background, blue text, border, shadow
- User info pinned to bottom with border-top

### Supervisor Desktop
- Left sidebar (220px), sticky full-height
- Home selector dropdown at top
- 11 navigation items with badge counts
- Counts: red background for issues, sky/blue for informational
- User info pinned to bottom

---

## 12. State Management

All UI state is managed through three objects in `app-main.js`:

```javascript
ui = { setup, pos, locating, locErr, sheet }  // global UI state
cg = { tab, screen, ...screen-specific props }  // caregiver state
sv = { tab, homeId, sel, person, ...}            // supervisor state
```

Rendering is a full innerHTML replacement on every state change:
1. `render()` computes the full HTML string via view functions
2. `root.innerHTML = html` replaces the entire DOM
3. `C.save()` persists to localStorage
4. Event delegation via single `document.addEventListener("click", ...)` handler

This is intentionally simple for the prototype. The production architecture will use SvelteKit 3 + Svelte 5 runes (PWA) with PowerSync + Postgres on Google Cloud (infrastructure.md).

---

## Appendix: Design Review & Quality Audit

### Methodology

This review evaluates the Guad MVP1 prototype against 12 dimensions of professional quality, drawing on analysis of every source file in the codebase (`index.html`, `styles.css`, 8 JS files), three competitive research documents totaling 1,600+ lines, the IDD charting implementation guide, and established standards (WCAG 2.1, Material Design 3, Apple HIG, IDD industry best practices from Therap, Brittco, MediSked, and CentralReach).

Findings are organized by the 12 audit dimensions requested, followed by acknowledgments of what the spec does well.

> **Note:** This audit was conducted against the vanilla JS prototype (MVP1). The production frontend specifications (frontend-spec-1.md, frontend-spec-2.md, frontend-spec-3.md, security.md) address many of these findings. Status annotations on individual findings indicate where production specs now cover the gap.

---

### Audit Findings

---

#### FINDING 1: Dark mode is defined but intentionally disabled
- **STATUS:** Addressed in frontend-spec-1.md Section 10 (full dark mode specification with toggle, time-based suggestion, and CSS mechanism).
- **Section:** 2 (Color System)
- **Problem:** Dark mode CSS is fully written but gated behind `@media (prefers-color-scheme: dark) and (max-width:0px)`, which is a media query that never matches. The separate `data-theme="guad-dark-off"` selector exists but has no toggle in the UI. DSPs working overnight shifts (11pm-7am -- the "on" shift defined in `SHIFTS`) are staring at a bright cream background in dark rooms. This is both a usability failure and a competitive gap: Therap lacks dark mode entirely, and Guad lists it as a differentiator in the competitive positioning but does not actually deliver it.
- **Severity:** HIGH
- **Recommended Fix:** Add a dark mode toggle in the Me/Settings screen. Wire it to set `document.documentElement.setAttribute('data-theme', 'guad-dark')` and persist the preference in localStorage. Rename `guad-dark-off` to `guad-dark`. Remove the `max-width:0px` hack. Then run WCAG contrast checks on every dark-mode color combination (see Finding 4).

---

#### FINDING 2: WCAG contrast failures in the light palette
- **STATUS:** Addressed in frontend-spec-1.md Section 9 (accessible contrast ratios specified, --faint changed to #706E96 for AA compliance).
- **Section:** 2 (Color System), 8 (Accessibility)
- **Problem:** Several color combinations fail WCAG 2.1 AA minimum contrast ratio of 4.5:1 for normal text (3:1 for large text):
  - `--faint` (#8B89AA) on `--bg` (#FFFCF3): approximately 3.2:1 -- FAILS AA. This color is used for tertiary text, tab labels, chevron icons, and input placeholders across the entire app.
  - `--muted` (#5A5880) on `--bg` (#FFFCF3): approximately 4.8:1 -- PASSES AA but only barely. Used extensively for labels, secondary text, and descriptive content.
  - `--lemon` (#FFD66B) as background with `#1C1B4B` text: approximately 6.1:1 -- passes for normal text but the lemon is used as a background for small pill badges (12.5px, 700 weight) where the effective contrast is reduced by the small text size.
  - `--ok` (#1F7A4D) on `--ok-bg` (#E6F4EC): approximately 4.7:1 -- passes AA but fails AAA.
  - In dark mode (if enabled): `--faint` (#8C8BB4) on `--bg` (#12122E): approximately 4.1:1 -- FAILS AA.
- **Severity:** CRITICAL
- **Recommended Fix:**
  - Change `--faint` from `#8B89AA` to `#706E8F` (approximately 4.6:1 on cream) or rethink the three-tier text hierarchy to use only two tones that both pass.
  - Dark mode `--faint`: change `#8C8BB4` to `#A3A2C4` for 5.2:1 on `#12122E`.
  - Audit every text-on-background combination using a tool like WebAIM's contrast checker. Document pass/fail for each pair.

---

#### FINDING 3: No service worker, no PWA manifest, no offline-first architecture
- **STATUS:** Addressed in frontend-spec-2.md Section 8 (full Offline & PWA UX specification with service worker, manifest, PowerSync sync, and cache strategies).
- **Section:** 9 (Offline & Data Layer)
- **Problem:** The app is described as targeting "offline-first" and "web-only PWA" but currently has zero PWA infrastructure. There is no `manifest.json` (so no install prompt, no standalone mode, no icon on home screen). There is no service worker (so the app cannot load at all without network). Google Fonts are loaded from CDN with no fallback caching. If a DSP opens Guad at a group home with no WiFi, they see nothing. This directly contradicts the #1 competitive claim against Therap ("Your work is NEVER lost") and the stated constraint that "must work fully offline."
- **Severity:** CRITICAL
- **Recommended Fix:**
  - Add `manifest.json` with app name, icons (multiple sizes), `display: standalone`, `theme_color: #FFFCF3`, `background_color: #FFFCF3`.
  - Add a service worker that caches: `index.html`, `styles.css`, all `src/*.js` files, the Figtree font files (download and self-host instead of using Google Fonts CDN).
  - Implement a cache-first strategy for static assets, network-first for API calls with queued retry.
  - Add the Figtree font files to the project directory and reference them locally, not from `fonts.googleapis.com`.
  - This is the single most important technical gap to close before any real deployment.

---

#### FINDING 4: Full DOM replacement on every render destroys focus, scroll position, and form state
- **Section:** 12 (State Management)
- **Problem:** Every user interaction triggers `root.innerHTML = html` which replaces the entire DOM. This has multiple consequences:
  - Focus is lost after any click. Users tabbing through a form lose their position.
  - Scroll position is manually managed (`global.scrollTo(0,0)`) on screen changes but mid-screen interactions (adding a goal trial, dismissing a flag) cause the viewport to stay put while the DOM shifts -- the user may lose their place.
  - Textarea content is only preserved if the code explicitly reads it before re-rendering (`readReview()`, `readInc()`). If a developer misses a read call in a new interaction handler, user-typed text is silently destroyed.
  - Screen readers re-announce the entire page on every interaction.
  - There are no transition animations between screens.
  - Performance: innerHTML parsing of the entire app HTML on every interaction. For the current codebase size this is acceptable, but it will not scale.
- **Severity:** HIGH (for accessibility and UX quality; acceptable for prototype)
- **Recommended Fix:** This is a known architectural limitation of the prototype. The production rebuild (SvelteKit 3 + Svelte 5 runes + PowerSync) will solve it. For the current prototype: (1) after render, restore focus to the element that triggered the interaction using `requestAnimationFrame`; (2) save and restore scroll position for in-screen updates; (3) add `aria-live="polite"` to a status region that announces Lomi's state changes instead of re-announcing the full page.

---

#### FINDING 5: eMAR grid view is missing -- only list view exists
- **Section:** 6 (Screen Inventory, screen 9)
- **Problem:** The competitive research and charting guide both emphasize that Therap's eMAR uses a traditional grid layout (medications as rows, dates as columns, cells showing Given/Refused/Held). The charting guide calls this "universal in nursing -- every DSP with med-cert training recognizes it." Guad's MAR screen (`V.mar`) renders medications as a vertical card list with individual action buttons. There is no grid/table view that lets a supervisor see the full day's medication pass at a glance across all individuals. The supervisor medications screen (`O.meds`) does use a table, but only for today and without the traditional MAR grid format. For a DSP doing a med pass for a home with 6 residents and 4 medications each, Guad requires scrolling through 24 individual cards instead of scanning a single grid.
- **Severity:** HIGH
- **Recommended Fix:** Add a grid/table view option to the MAR screen (both caregiver and supervisor) that mirrors the traditional eMAR layout. Rows = medications, columns = times or dates. Each cell shows a status icon. Tap a cell to record. Keep the current card view as an alternative for phone screens. The grid should be the default on tablet/desktop.

---

#### FINDING 6: No error recovery for localStorage quota exceeded or corruption
- **Section:** 9 (Offline & Data Layer)
- **Problem:** `store.js` wraps `localStorage.setItem` in a try/catch that silently swallows errors. If localStorage is full (typical 5MB limit on mobile browsers, can be as low as 2.5MB on some Android WebViews), data is silently lost. If the JSON is malformed on load, the app silently resets to empty state -- destroying all agency data, staff, clients, notes, and incidents. There is no user notification, no recovery prompt, no data export before reset, and no warning when storage is approaching capacity. On a $100 Android phone with limited storage, this is a realistic failure scenario.
- **Severity:** CRITICAL
- **Recommended Fix:** (1) On save failure, show a persistent error banner: "Your data may not have been saved. Export your records now." (2) Before resetting to empty state on load failure, attempt to recover what was stored and offer to download a backup. (3) Add a storage capacity indicator in Settings. (4) Implement data compression (e.g., LZString) to reduce localStorage usage. (5) For production: this entire storage layer will be replaced by PowerSync/Postgres, but the error handling patterns should carry over.

---

#### FINDING 7: Session timeout and re-authentication UX is completely absent
- **STATUS:** Addressed in security.md (Identity Platform auth, session management, PHI visibility rules, and re-auth flows specified).
- **Section:** 12 (Security UX)
- **Problem:** There is no session timeout. There is no re-authentication flow. There is no screen lock. The "sign-in" screen is a list of all staff names with no passwords -- anyone who opens the browser sees all users and can impersonate anyone. While the README clearly states this is a "development sign-in" placeholder, the design spec should document the production re-auth flow because it affects every screen's UX. Key scenarios not designed:
  - What happens when a session expires mid-medication-pass? (Data loss risk)
  - What happens when a phone is left unlocked in a group home? (PHI exposure)
  - How does biometric re-auth work on screens showing PHI?
  - Is there a privacy screen / blur when the app goes to background?
- **Severity:** CRITICAL (for production readiness)
- **Recommended Fix:** Design and document the following flows: (1) After 15 minutes of inactivity, show a blur overlay with biometric/PIN re-auth. Save all in-progress form data before blurring. (2) When the app goes to background (`visibilitychange` event), immediately blur PHI content. (3) On session expiry, queue any pending saves and re-sync after re-auth. (4) Add a production-ready auth section to this spec covering: login (email + password + optional biometric), session duration, re-auth triggers, PHI visibility rules, and the relationship between auth state and offline access.

---

#### FINDING 8: Incident report lacks required fields for many state reporting systems
- **Section:** 6 (Screen Inventory, screen 11), 5 (IDD Specificity)
- **Problem:** The incident report (`V.incident`) collects: type, severity, time, where, what happened before, what happened, injury status, injury description, witnesses, staff action, medical follow-up, and notification checklist. Missing fields that most state IDD incident reporting requires:
  - Individual's current condition / status at time of report
  - Whether the individual was alone or with staff when the incident occurred
  - Whether restraint or restrictive intervention was used
  - Witnesses' full names and roles (current field is a single text input)
  - Whether the incident was self-injurious behavior
  - Body map / injury location diagram
  - Whether medication was a factor
  - Whether environmental factors were involved
  - Corrective action plan (separate from immediate staff action)
  - Required follow-up timeline per state rules
  - The `notifRules()` function returns hardcoded generic rules with a TODO comment -- it does not implement any actual state reporting requirements
- **Severity:** HIGH
- **Recommended Fix:** (1) Add the missing fields as optional sections in a 4th step of the incident wizard (expandable for states that require them). (2) Make `notifRules()` configurable per agency during setup. (3) Add a body map SVG for injury location. (4) Add a restraint/restrictive intervention sub-form that triggers when the incident type is "Physical intervention" or similar. (5) Document which state reporting requirements are met and which are not.

---

#### FINDING 9: Goal tracking lacks visual progress indicators and trend data
- **Section:** 6 (Screen Inventory), 5 (IDD Specificity)
- **Problem:** The charting implementation guide specifically identifies "Visual Goal Progress" as Priority 2, including progress rings, sparklines, trend arrows, and ISP progress summary cards. The current implementation shows:
  - In the caregiver note review: raw trial pills (e.g., "1. Ind 2. Verbal 3. Ind") with a text score ("2 of 3 independent")
  - In the supervisor person detail: a progress bar showing "X% independent across Y attempts" per goal
  - No sparklines, no trend arrows, no comparison to previous weeks, no target line, no ISP progress summary card
  - No visual distinction between a goal at 80% trending up vs 80% trending down
  - The `goalProgress()` function aggregates all-time data with no time windowing -- a goal that was 90% independent 6 months ago but 30% this month shows as some average percentage with no trend indication
- **Severity:** MEDIUM
- **Recommended Fix:** (1) Add a 2-week sparkline SVG under each goal in the person detail (inline SVG, no library needed). (2) Add trend arrows (up/steady/down) comparing last 2 weeks. (3) Add a summary card on the person overview showing all goals at a glance. (4) Window `goalProgress()` to show recent performance (last 30 days) with an option to see all-time. (5) Add target lines to the progress bar when `go.target` is set.

---

#### FINDING 10: No search functionality anywhere in the app
- **Section:** 10 (Missing Pieces)
- **Problem:** There is no search feature in any view. A supervisor managing 3 homes with 6 people each and 15 staff members has no way to find a specific note, person, incident, or staff member except by scrolling through lists. As agencies scale, this becomes untenable. Therap has search (though it is criticized as slow). Every modern competitor has search.
- **Severity:** MEDIUM
- **Recommended Fix:** Add a global search function accessible from the supervisor sidebar (and eventually the caregiver dock). Search across: person names, staff names, note content, incident descriptions, medication names. For the prototype, a simple client-side filter over `S.clients`, `S.staff`, `S.notes`, and `S.incidents` is sufficient. Display results grouped by type.

---

#### FINDING 11: No help system, onboarding flow, or contextual guidance
- **Section:** 10 (Missing Pieces)
- **Problem:** There is no help button, no FAQ, no tooltip system, no onboarding tour, and no contextual guidance anywhere in the app. The setup wizard creates an agency but then drops users into the supervisor dashboard with a brief "Finish setting up" card. For DSPs -- who have 40-60% annual turnover and may have limited tech literacy -- the app relies entirely on external training. Therap is criticized for its training burden (4-8 hours). Guad aims to be "intuitive" but provides no in-app learning aids. The IDD terminology mapping (T-Log = Shift Note, ISP Data = Goal Tracking, etc.) from the charting guide is not surfaced anywhere in the UI.
- **Severity:** MEDIUM
- **Recommended Fix:** (1) Add a first-use onboarding flow (3-4 screens explaining key concepts: "Here's where you write shift notes", "Lomi helps you draft", "Tap prompt levels for goals"). (2) Add contextual help text below section headers for new users (dismissable). (3) Add a help/FAQ link in the Me/Settings screen. (4) Consider showing Therap-equivalent terminology in parentheses during the first week of use: "Shift Note (T-Log)" to ease transition.

---

#### FINDING 12: Print views and PDF export are not implemented
- **Section:** 10 (Missing Pieces)
- **Problem:** The charting guide lists "PDF export for ISP meetings" as Priority 5. ISP review meetings (typically quarterly or annual) require printed or PDF reports showing goal progress, health summaries, incident history, and medication lists. The current app has CSV export only (via `O.reportRows()` and `C.csv()`). There is no print stylesheet. If a supervisor prints the page, they get the sidebar, navigation, and interactive elements mixed with content. Therap generates PDF reports for ISP meetings (basic but functional). Not having this capability is a blocker for agencies that need to share documentation with families, physicians, and state reviewers.
- **Severity:** MEDIUM
- **Recommended Fix:** (1) Add a `@media print` stylesheet that hides navigation, shows content in a clean single-column layout, and forces light-mode colors. (2) Add a "Print report" button on the person detail page that generates a formatted view of: demographics, active goals with progress, recent vitals, recent incidents, current medications. (3) For PDF generation, use the browser's print-to-PDF or add a server-side PDF generator (Puppeteer, wkhtmltopdf) as a later enhancement.

---

#### FINDING 13: No notification center or alert history
- **Section:** 10 (Missing Pieces)
- **Problem:** The supervisor's "Needs your attention" list on the Overview is the closest thing to a notification center, but it only shows current open items. There is no history of past notifications, no "mark all as read" functionality, no push notification support, and no way to configure notification preferences. Health alerts, medication refusals, incident reports, and coverage events all surface in the attention list but disappear once acknowledged. If a supervisor wants to review what happened overnight, they must check each section individually (Notes, Incidents, Health, Medications). Toasts auto-dismiss after 2.8 seconds with no way to retrieve them.
- **Severity:** LOW
- **Recommended Fix:** (1) Add a notification history view accessible from the sidebar (or a bell icon). (2) Log all attention items to an `events` array (the infrastructure already exists -- `S.events` captures many actions). (3) Add push notification support via Web Push API in the service worker (when implemented). (4) Allow supervisors to configure which event types trigger push notifications.

---

#### FINDING 14: No version history or edit tracking for clinical documentation
- **Section:** 10 (Missing Pieces)
- **Problem:** Notes have a `history` array that tracks status changes (created, approved, sent back, amended). But the actual content of the note at each state is not preserved. If a supervisor sends a note back and the DSP amends it, the original text is overwritten -- the supervisor cannot see what changed. For clinical documentation that may be subject to Medicaid audit, this is a compliance risk. The "audit trail" shows who did what and when, but not what the document said at each point.
- **Severity:** MEDIUM
- **Recommended Fix:** (1) When a note is amended, push a snapshot of the previous `s` (sections) object into the history entry. (2) In the note detail view, add a "View history" toggle that shows each version with diffs highlighted. (3) Make the events/history append-only and immutable (already the intent per the README). (4) For production: implement this at the database level with immutable versioned records.

---

#### FINDING 15: Performance risks for $100 Android phones with 2GB RAM
- **Section:** 7 (Mobile Reality)
- **Problem:** Several patterns in the current codebase pose performance risks on low-end devices:
  - Full innerHTML replacement on every interaction means the browser parses and renders the entire app HTML on every click. For the current app size (~200KB of generated HTML), this takes 50-150ms on mid-range devices but could exceed 300ms on low-end Android.
  - No image optimization or lazy loading (though the app currently has no images beyond SVG icons).
  - Google Fonts loaded from CDN without `font-display: swap` beyond the default Google Fonts behavior -- on slow connections, text may be invisible until the font loads.
  - The `styles.css` file uses `color-mix()` function which is not supported on Android WebView < 111 (released March 2023). Older Android phones may not have updated WebView.
  - `field-sizing: content` (used in `.note-sec textarea` and `.cv-text`) is supported only in Chrome 123+ (March 2024) and not in Firefox or Safari < 18. On unsupported browsers, textareas will not auto-size.
  - `backdrop-filter: blur(8px)` on `.actionbar` causes rendering performance issues on low-end devices with hardware-accelerated compositing disabled.
  - The app loads 8 separate JS files synchronously (no `defer`, no `async`), blocking the initial render.
- **Severity:** HIGH
- **Recommended Fix:** (1) Add `font-display: swap` to the Google Fonts URL (or better, self-host the font). (2) Replace `color-mix()` with pre-computed hex values for critical paths or add fallback values. (3) Replace `field-sizing: content` with a JavaScript auto-resize that works cross-browser (already partially done via manual height setting in some places). (4) Add `defer` to script tags. (5) Test on a real low-end Android device (e.g., Samsung Galaxy A03, Motorola Moto E) with Chrome DevTools throttling. (6) Consider removing `backdrop-filter` on the action bar for mobile viewports.

---

#### FINDING 16: Fatal Five monitoring is not implemented
- **Section:** 5 (IDD Specificity)
- **Problem:** The charting implementation guide lists "Fatal Five Dashboard" as Priority 6 and calls it a "differentiator." However, Therap already has an AI-powered Fatal Five Dashboard (scanning documentation for aspiration, bowel obstruction, dehydration, GERD, seizures, and sepsis) as of 2025-2026. Any competitive positioning that claims Fatal Five monitoring as a feature Therap lacks is outdated and must be corrected. The `vitalFlags()` function in `app-core.js` only checks numerical vital sign thresholds. There is no scanning of note text for Fatal Five keywords, no health risk dashboard, and no aggregation of health indicators across shifts.
- **Severity:** MEDIUM
- **Recommended Fix:** (1) Implement a rule-based Fatal Five scan that checks recent notes, health entries, and MAR records for keywords associated with each condition (the charting guide provides the keyword lists). (2) Add a "Health Risks" card to the supervisor overview that shows flagged individuals. (3) Position this as "Lomi's health watch" -- the AI assistant monitoring documentation for early warning signs. (4) Update competitive positioning to acknowledge that Therap now has this feature and differentiate on Guad's approach (real-time during documentation vs. after-the-fact review).

---

#### FINDING 17: Scheduling UI lacks drag-and-drop, copy-week, and template features
- **Section:** 6 (Screen Inventory, screen 18)
- **Problem:** The schedule is a CSS grid of buttons. To fill a week for one home with 3 shifts/day, a supervisor must click each of the 21 cells individually, select a staff member from a dropdown, and save. There is no way to copy last week's schedule, no templates, no drag-and-drop, no auto-scheduling suggestions. For a multi-home agency, this is 42-63+ clicks per week. Every competitor at least offers copy-week functionality. Guad's competitive advantage is supposed to be Lomi automating shift coverage, but the initial schedule creation is entirely manual.
- **Severity:** MEDIUM
- **Recommended Fix:** (1) Add a "Copy last week" button to the schedule view. (2) Add a "Fill empty shifts" button that uses the same eligibility algorithm as `startCoverage()` to suggest assignments for open slots. (3) For production: add drag-and-drop staff assignment on the grid. (4) Add schedule templates that can be saved and reapplied.

---

#### FINDING 18: No data validation on health entries
- **Section:** 5 (IDD Specificity)
- **Problem:** Health vital sign inputs accept any value. A DSP could enter a blood pressure of 999/999 or a temperature of 500F. The `vitalFlags()` function only checks against thresholds after entry -- it does not prevent clearly impossible values. There are no realistic value ranges enforced on the inputs (e.g., systolic BP 60-250, diastolic 40-150, temperature 80-115F, pulse 30-220, weight 30-600 lbs). The `type="number"` attribute allows any number. For clinical documentation that may inform medical decisions, unrestricted input is a patient safety concern.
- **Severity:** HIGH
- **Recommended Fix:** (1) Add `min` and `max` attributes to health input fields with clinically reasonable ranges. (2) Add client-side validation that warns (not blocks) when values are outside the expected range but allows override. (3) Add a "confirm unusual value" step for readings that are physiologically improbable. (4) Per the production checklist: thresholds should be configurable per person by a nurse.

---

#### FINDING 19: Message system lacks threading, read receipts, and file sharing
- **Section:** 6 (Screen Inventory, screen 16)
- **Problem:** The messaging system (`V.msgs`) is a simple flat chronological list of messages per home. There is no threading, no read receipts (beyond an unread count), no message search, no file/photo sharing, no message editing or deletion, and no way to @mention a specific staff member. Therap's SComm is also basic (no threading), but it has acknowledgment tracking and individual record linking. For shift handoff communication -- a critical safety function in IDD care -- the current messaging system is too simple.
- **Severity:** LOW
- **Recommended Fix:** (1) Add read receipts (who has seen each message). (2) Add the ability to link a message to a specific individual's record. (3) Add photo sharing for health observations. (4) For production: add threading for incident follow-up discussions. These can be phased -- the current simplicity is acceptable for MVP but should be on the roadmap.

---

#### FINDING 20: Supervisor split view does not work on tablets (768-899px)
- **Section:** 4 (Layout Architecture)
- **Problem:** The supervisor dashboard uses a split-view layout (list + detail panel side by side) for Notes and Incidents. This layout is defined in `.split { grid-template-columns: minmax(0,1fr) minmax(0,1.1fr) }` which has no responsive breakpoint. At widths below 900px, the `.dash` grid collapses to single-column, but the `.split` inside the main content area does NOT collapse. On a tablet in portrait mode (768px), the split view renders two cramped columns inside the already-narrow main area. The list panel becomes too narrow to read note content, and the detail panel is squeezed.
- **Severity:** MEDIUM
- **Recommended Fix:** Add a responsive rule: `@media (max-width:900px) { .split { grid-template-columns: 1fr } }` (this is already done -- checking code: yes, it IS in the CSS at line 215). However, the split panels then stack vertically with no way to navigate between them -- the user sees a long scrolling page with the list AND detail. Better: implement a push/pop navigation pattern where selecting an item from the list pushes the detail view and hides the list, with a back button to return.

---

### What the Design Does WELL

The following decisions are strong and should be preserved through the production rebuild:

1. **Warm, human visual identity.** The cream background (#FFFCF3), Georgia serif for greetings, lemon accent, and generous rounded corners (20px cards, pill buttons) create a distinctly warm feel that is miles ahead of Therap's clinical coldness and generic enterprise software aesthetics. This is the right tone for DSPs who do emotionally demanding caregiving work.

2. **Lomi's personality through design.** The lemon orb, breathing animation, "Talk to Lomi" FAB, and conversational compose flow make the AI assistant feel like a helpful colleague rather than a robotic tool. The design correctly avoids the AI-chatbot pattern (no chat bubbles in the compose flow) and instead uses a "speak -> draft -> review -> sign" workflow that keeps the human in control. The explicit "You review and sign every note. Lomi never submits for you." message is excellent for trust.

3. **IDD prompt-level terminology.** The goal tracking uses the exact standard prompt hierarchy (Independent / Verbal / Gestural / Model / Partial Physical / Full Physical / Refused) that DSPs learn in training. The tap-to-add-trial interaction with removable pills is faster and more intuitive than Therap's dropdown-per-task approach. The "Not attempted" option with required reason is the right clinical workflow.

4. **Touch target sizes.** All interactive elements meet the 44px minimum: icon buttons (44x44), primary buttons (52px height), small buttons (42px), nav tabs (48px+ height), choice chips (42px), checkboxes (22px but within tappable rows). This is critical for DSPs using phones in group homes.

5. **Auto-save and no-data-loss philosophy.** The continuous localStorage persistence means a DSP's work survives page refreshes, browser crashes, and accidental navigation. This directly addresses Therap's #1 user complaint (session timeouts destroying 15-20 minutes of work). The design decision to save on every render is aggressive but correct for the target user.

6. **Medication workflow design.** The Given/Refused/Held pattern exactly matches IDD industry standard terminology. The required reason for Refused/Held, PRN administration with reason and effect follow-up, and the separation of scheduled vs. as-needed medications all reflect deep understanding of how medication passes actually work in group homes.

7. **Coverage engine UX.** The Lomi shift coverage flow (callout -> eligibility check -> mass offer -> first-accept-wins -> team notification) is genuinely novel. No competitor has automated shift coverage. The timeline visualization in the coverage card shows every step transparently, which builds trust in the AI's decision-making.

8. **Inline incident detection.** Lomi scanning note text for incident-related keywords and prompting "You mentioned: [summary]. File an incident report?" is a powerful compliance feature. This catches incidents that DSPs might not realize need formal reporting. The design correctly makes this a suggestion, not an automatic action.

9. **Vague wording flags.** The detection of phrases like "was fine", "acted out", "had a bad attitude" in clinical documentation, with specific guidance to describe observable behavior instead, is both clinically correct (person-centered language is an IDD industry requirement) and practically useful for improving documentation quality.

10. **Supervisor attention list.** The aggregation of open incidents, health alerts, medication issues, coverage gaps, unverified clock-ins, and pending note reviews into a single prioritized "Needs your attention" list is excellent supervisor UX. It saves the supervisor from checking 6 different screens to find what matters. The badge counts on sidebar navigation reinforce this at a glance.

11. **Event-driven analytics.** Building analytics from an append-only event log (`S.events`) rather than computed snapshots is architecturally correct. The 4-week trend charts for coverage, documentation, and care metrics are well-chosen for the supervisor persona. The "Minutes to chart" metric directly supports the competitive claim of reducing documentation time.

12. **CSS architecture simplicity.** A single CSS file with CSS custom properties, no preprocessor, no utility-class framework, and clear naming conventions makes the design system readable and portable. The responsive design is handled with just 3 media queries. The decision to use `color-scheme: light` and proper dark-mode CSS custom properties (even though dark mode is disabled) shows forward planning.

13. **Competitive terminology mapping.** Using Therap's vocabulary ("Shift Note" not "Progress Note", prompt level names, Given/Refused/Held) while delivering modern UX (cards not tables, chips not dropdowns, bottom tabs not menu bars) is the correct strategy. DSPs switching from Therap should feel immediately oriented while recognizing the quality improvement.

14. **Safe-area and notch handling.** Proper use of `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` throughout the CSS, including in the root element, navigation, action bars, sheets, and toasts, shows attention to real-world phone hardware. Combined with `viewport-fit=cover`, this ensures the app works correctly on iPhones with notches and Android phones with gesture navigation bars.

---

### Summary of Findings by Severity

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 4 | #2 (WCAG contrast), #3 (No PWA/offline), #6 (localStorage failures), #7 (No auth/session) |
| HIGH | 5 | #1 (Dark mode disabled), #4 (DOM replacement), #5 (eMAR grid missing), #15 (Low-end phone perf), #18 (No health validation) |
| MEDIUM | 8 | #8 (Incident report gaps), #9 (Goal progress viz), #10 (No search), #11 (No help system), #12 (No print/PDF), #14 (No version history), #16 (Fatal Five missing), #17 (Schedule UX) |
| LOW | 3 | #13 (No notification center), #19 (Message limitations), #20 (Tablet split view) |

### Recommended Priority for Addressing

**Before any real-world pilot (Critical blockers):**
1. Add service worker + PWA manifest (Finding #3)
2. Fix WCAG contrast failures (Finding #2)
3. Add localStorage error handling (Finding #6)
4. Design authentication flow (Finding #7)

**Before competitive demo:**
5. Enable dark mode with toggle (Finding #1)
6. Add eMAR grid view (Finding #5)
7. Add health input validation (Finding #18)
8. Fix low-end device performance issues (Finding #15)

**Before first agency onboarding:**
9. Add goal progress visualization (Finding #9)
10. Add search (Finding #10)
11. Add print stylesheet (Finding #12)
12. Expand incident report fields (Finding #8)

**Production roadmap:**
13. Focus management and accessibility (Finding #4)
14. Fatal Five dashboard (Finding #16)
15. Schedule UX improvements (Finding #17)
16. Help system / onboarding (Finding #11)
17. Version history (Finding #14)
18. Notification center (Finding #13)
19. Message threading (Finding #19)
20. Tablet layout refinement (Finding #20)
