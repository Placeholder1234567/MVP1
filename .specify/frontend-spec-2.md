# Guad Frontend Design Specification -- Part 2

## Caregiver Experience, AI/Lomi UX, and Offline/PWA UX

> This document is the second of a three-part frontend specification. Part 1 (frontend-spec-1.md) covers sections 1-2 (Design Philosophy, Design System) plus sections 9-10 (Accessibility, Dark Mode). This part covers sections 3 (Caregiver Experience), 6 (AI/Lomi UX), and 8 (Offline & PWA UX). Part 3 (frontend-spec-3.md) covers sections 4-5 (Supervisor Dashboard, Component Library) and section 7 (Navigation & IA). A developer should be able to build all caregiver screens from this document alone.
>
> **Viewport reference:** All mobile wireframes target a 390x844 viewport (iPhone 14 / Galaxy S23). The "above the fold" budget is ~400px from the top of the safe area. All dimensions are in CSS pixels (dp).
>
> **Charting preset note:** Where labels differ between `therap` and `default` presets, the `default` label is shown first with the `therap` variant in parentheses. E.g., "Shift note (T-Log)."

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
4. DSP taps "Pause" -> recording stops, transcript arrives in textarea (via `/api/transcribe`, Speech-to-Text)
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
| Medication cards | One `.cv-card` per scheduled **dose slot**, sorted by time (earliest first). A twice-daily medication shows two cards (e.g. 8:00am and 8:00pm), each recorded separately. Gap 18px between cards. |
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

- Status pill: `.pill.ok` for Given, `.pill.bad` for Refused, `.pill.warn` (amber) for Held. Held is a clinical decision and must look different from a refusal (frontend-spec-1.md §2.1.5).
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

**As built (badges):** for caregivers, Notes shows a red dot while one of their notes was sent back today (from the notes on the device), and Shifts while a coverage offer waits for them (`coverage.offers`, checked every minute online, since offers are not synced). The dot is decorative; the link's accessible name becomes "Notes, needs attention" or "Shifts, needs attention".

**Tab styling:**

- Inactive: color `var(--faint)` (#8B89AA -> darken to #706E96 for WCAG AA, 4.70:1), 12px/600
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
- Transcript textarea receives text after recording stops (batch, via Speech-to-Text)
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

- The constitution (principle 5) requires AI output to be visibly labeled, so the label is always shown, quietly:
  - Caregiver review screen: app bar title "Review Lomi's draft" plus a small lemon "Drafted with Lomi" chip under the title. No per-section badges.
  - Supervisor note detail and note list: the same "Drafted with Lomi" chip next to the status pill, driven by `notes.lomi_drafted`.
  - Audit trail: "Drafted with Lomi, reviewed and signed" vs "Written and signed".
- The label marks the note as AI-assisted, not the caregiver as less responsible. They still attest that the content is accurate, so the note is theirs once signed.

**Ghost text pattern (future enhancement):**

AI-filled sections appear at opacity 0.85 (slightly faded). When the DSP taps into any field, text transitions to opacity 1.0 (150ms ease), signaling "you own this now." No italic, no sparkle icons -- subtle opacity shift only.

**Original transcript reference (Rebuild target -- not in MVP):**

> **Note:** The MVP code (V.review in app-caregiver.js) does not render a collapsible transcript element. This is a planned enhancement for the SvelteKit rebuild.

- Collapsible "What I said" disclosure at the top of the review form
- Collapsed by default after AI processing completes
- Contains the raw transcript text in 14px `var(--muted)`, monospace feel
- 95% of users will never expand it
- **As built:** `LomiReview.svelte` opens with a collapsed "What I said" disclosure holding the words the draft was made from (typed text and transcribed recordings, as sent to Lomi), 14px muted monospace.

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

**As built (last readings):** each number field on the vitals form shows the person's last saved reading under it, "Last: 185 lb · Oct 3" (`lastReadings()` in `domain/vital-trend.ts`, from the vitals on the device), linked to the field with `aria-describedby` rather than a placeholder that disappears on typing. Blood pressure shows the last top and bottom readings this way, and under them "Baseline BP: 118/76 · Oct 2 (last normal reading)": the most recent reading with both numbers within the alert limits (`baselineBloodPressure()`), described by both fields. Fields are never pre-filled, so nothing is entered for the caregiver.

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

**As built:** the compose screen shows "Try covering:" with these topics under Lomi's prompt (`topicSuggestions()` in `domain/lomi.ts`, ported from the MVP's `.cv-try` tags). Shift notes follow the note's shift; behavior notes show "Before", "What happened", "Your response", "How it ended" as in the MVP. They are reminders only and insert nothing.

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

**As built:** a "Getting started" card on Today for caregivers (`GettingStarted.svelte`, rules in `src/lib/domain/onboarding.ts`) lists the four steps with the next one highlighted. Each step ticks itself off from the synced records (a clock record, a note by them, a signed note), so nothing has to be clicked through. The card goes once all are done, or when "Hide these tips" saves `onboardingDone` in `user_settings.disclosure` (`auth.setDisclosure`), which follows the person to other devices. Me has a Help section with short answers and the Guad/Therap terms side by side, and "Show getting-started tips again". The usage-threshold reveals in the table above are not built; voice and Lomi stay available from the start, as in the MVP.

---

### 6.6 Offline AI Degradation

**Design principle:** No degradation path should ever prevent a DSP from completing and signing a note.

**Degradation cascade:**

| Condition | Voice recording | Transcription | AI structuring | Goal scoring | Signing |
|-----------|----------------|--------------|----------------|-------------|---------|
| Full connectivity | MediaRecorder | Speech-to-Text API | Lomi API (Claude) | Local | Local + sync |
| Offline | Records locally, transcribed on reconnect | Not available | Rules-based if text entered | Local | Local + sync |
| API error | MediaRecorder works | Transcription fails -> fallback to typing | Rules-based fallback | Local | Local + sync |

**Offline voice behavior:**

- Mic recording still works offline (MediaRecorder is browser-native)
- Transcription fails (Speech-to-Text unreachable)
- **Do not use the browser's `SpeechRecognition` / `webkitSpeechRecognition` API.** In Chrome it streams audio to Google's servers (not covered by a BAA, so a PHI leak), and it doesn't work offline anyway.
- Offline: keep the recording on the device (encrypted local DB) and transcribe it when back online, and show the text input prominently: "Type your note, or keep your recording and Lomi will transcribe it when you're back online." (matches offline-sync.md: "DSP types manually")
- The "Speak" button is hidden (not disabled with error) when voice is completely unavailable
- **As built:** offline, each recorded part is saved in the local-only `pending_recordings` table (encrypted with the rest of the device database) and the caregiver sees "You're offline. Your recording is saved on this device, and Lomi will transcribe it when you're back online. You can type in the meantime." The composer counts saved recordings while offline; once online it transcribes them in order, adds the text to "Your observations" (never drafting or signing), and deletes them. A connection that drops mid-upload keeps the part too. Whether voice is available is remembered on the device (`device_flags`), so the mic shows offline. Signing out with an untranscribed recording asks first, since it deletes it.

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
5. Audio sent to `POST /api/transcribe` (Speech-to-Text, ~2s)
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
| Voice brain dump (Mode 1) | Full pipeline | Voice unavailable (no transcription). Caregiver types, rules-based classification runs. |
| Per-box voice (Mode 2) | Speech-to-Text + Haiku rewrite | Mic button disabled (crossed-out icon, not hidden). Text input works. No AI rewrite -- text stays as typed. |
| Per-box text (Mode 2) | Haiku rewrite | No AI rewrite. Text stays as typed. |
| Chat voice (Mode 3) | Speech-to-Text + Haiku route + rewrite | Mic disabled. Text chat available without AI routing -- caregiver must edit boxes directly. |
| Chat text (Mode 3) | Haiku route + rewrite | Chat disabled. Direct box editing only. |
| Direct edit (Mode 4) | No AI | Works normally. |

The UI communicates mode availability clearly. Disabled mic buttons show a crossed-out icon, not a hidden element. The text "Lomi is offline -- you can type directly" appears in the chat panel when the network is down.

---

## 8. Offline & PWA UX

---

### 8.1 Sync Status Indicator

> **This is the canonical sync indicator spec.** offline-sync.md §9, charting-ux.md and frontend-spec-3.md §5.7 reference it.

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

**Strategy:** Server-authoritative, last-write-wins (offline-sync.md §5). There is no "keep mine / keep other" chooser: PowerSync applies the server state, and a custom merge UI would contradict the sync model and invite errors in clinical records.

**What the user sees instead:**

| Situation | UI |
|---|---|
| A draft the DSP was editing was changed on another device | Toast: "This note was updated on another device." The DSP's overwritten text is kept in memory for the session, behind a "Restore my version" link on the note. Restoring it is an ordinary edit, so it syncs and is audited like any other. |
| Note was returned or approved by a supervisor while the DSP edited offline | Toast: "Your supervisor already [returned / approved] this note." Returned notes open with the supervisor's comment; approved notes are read-only. |
| Same medication dose recorded on two devices | Toast: "[Name] also recorded this dose. Your supervisor has been alerted." (kept as a conflict record) |
| Write permanently rejected | Red banner: "[n] change(s) could not be saved. Tap to review." (offline-sync.md §6) |

**Per-record-type rules:**

| Record type | Resolution | User UI |
|-------------|-----------|---------|
| Shift notes | Last-write-wins while draft/returned | Toast + "Restore my version" |
| MAR entries | Duplicate dose slot kept as conflict record + supervisor alert | Toast |
| Health entries, incidents, messages | Append-only (both kept) | None |
| Attendance | Service lists merged | None |
| Clock records | Server wins; verification computed server-side | Supervisor review flag if mismatch |
| Person profiles | Last-write-wins | Supervisor notified of conflicting edits |

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

## Appendix: Critical Fixes Checklist

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Enable dark mode: remove `max-width:0px` trick from line 9 media query | `styles.css` | Overnight DSPs (11pm-7am shifts) |
| 2 | Fix `--faint` contrast: `#8B89AA` -> `#706E96` (4.70:1, passes WCAG AA) | `styles.css` line 3 | Section 508 compliance |
| 3 | Restrict `.btn.lemon` to Lomi elements (its contrast is 11.53:1 and passes AAA; the restriction is for brand consistency, not accessibility) | `styles.css` line 87 | Brand consistency |
| 4 | Add auto-save drafts: debounced 500ms save to PowerSync local DB on every input event | `app-main.js` | #1 missing feature (DSPs interrupted every 3-7 min) |
| 5 | Increase `.levels button` min-height 36px -> 44px | `styles.css` line 139 | WCAG touch target compliance |
| 6 | Increase `.btn.sm` min-height 42px -> 44px | `styles.css` line 88 | WCAG touch target compliance |
| 7 | Increase `.seg button` min-height 42px -> 44px | `styles.css` line 109 | WCAG touch target compliance |
| 8 | Increase `.trial button` touch target to 44x44px (visual 28px, padded hit area) | `styles.css` line 136 | WCAG touch target compliance |
| 9 | Replace `backdrop-filter:blur(8px)` on `.actionbar` with solid `rgba(255,252,243,0.92)` | `styles.css` line 157 | Frame drops on budget Mediatek/Snapdragon 400 phones |
| 10 | Self-host Figtree font with `@font-face`, `font-display:swap`, Latin-only subset | `index.html` | Eliminates 200-800ms render-blocking network request |
