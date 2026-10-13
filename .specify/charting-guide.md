# Guad Charting Implementation Guide

> How to build IDD charting that feels familiar to Therap users, matches what competitors do well, and beats all of them with AI.

---

## The Core Insight

Every IDD charting platform follows the same mental model DSPs already know:

**Select person → Document what happened → Score goals → Submit → Supervisor reviews**

Guad already has this flow. The work isn't rebuilding from scratch — it's filling gaps, matching terminology, and adding a data import path so agencies don't start from zero.

---

## Part 1: What Therap's UI Actually Looks Like (So Guad Matches the Mental Model)

### Therap's T-Log Form (Their Shift Note)

```
┌─────────────────────────────────────────────┐
│ Individual: [Auto-populated]                 │
│ Program:    [Auto-populated]                 │
│ Entered By: [Auto-populated]                 │
├─────────────────────────────────────────────┤
│ *Type: (checkboxes, inline)                  │
│  ☐ Health  ☐ Notes  ☐ Follow-up             │
│  ☐ Behavior ☐ Contacts  ☐ General           │
├─────────────────────────────────────────────┤
│ Notification Level: [Low | Medium | High]    │
├─────────────────────────────────────────────┤
│ *Summary: [Single-line text]                 │
│  e.g. "PM Shift 4-12 Midnight"              │
├─────────────────────────────────────────────┤
│ Description: [Large textarea, ~10,000 chars] │
│  (Free-text narrative — optional but used    │
│   by everyone)                               │
├─────────────────────────────────────────────┤
│ Time In: [hh:mm]   Time Out: [hh:mm]        │
├─────────────────────────────────────────────┤
│ Attachments: [Add File] [Add Image] [Video]  │
├─────────────────────────────────────────────┤
│           [Cancel]  [Back]  [Submit]         │
└─────────────────────────────────────────────┘
```

Only 2 fields required: Type and Summary. Description is where 95% of content goes.

### Therap's ISP Data (Their Goal Tracking)

```
┌─────────────────────────────────────────────┐
│ Task 1: [Goal description]                   │
│   Score: [Dropdown: Independent | Verbal     │
│          Prompt | Gestural | Physical |      │
│          Hand-over-Hand | Not Attempted]     │
│                                              │
│ Task 2: [Goal description]                   │
│   Score: [Dropdown]                          │
│                                              │
│ Comments: [Textarea]                         │
│              [Cancel]  [Save]                │
└─────────────────────────────────────────────┘
```

Standard dropdowns per task. Graphs generated separately (static line charts, not interactive).

### Therap's Health Vitals

```
┌─────────────────────────────────────────────┐
│ Blood Pressure: [sys] / [dia] mmHg          │
│   Position: [Sitting | Standing | Supine]    │
│ Heart Rate: [___] BPM                        │
│ Temperature: [___] °F                        │
│   Method: [Oral | Tympanic | Axillary]       │
│ Weight: [___] lb  → BMI: [auto-calc]        │
│ Blood Glucose: [___] mg/dL                   │
│ SpO2: [___] %                                │
│ Pain: [0-10 scale]                           │
│ Notes: [Textarea]                            │
└─────────────────────────────────────────────┘
```

Out-of-range values flagged with red/yellow. Recent entries shown in a table below.

### Therap's eMAR

Grid layout: medications as rows × dates as columns. Each cell shows ✓ (Given), R (Refused), H (Held), or ○ (Due). Click a cell to record. This traditional MAR grid is universal in nursing — every DSP with med-cert training recognizes it.

### Therap's GER (Incident Report)

Multi-step wizard, similar to Guad's 3-step incident flow. Same structure: What happened → Injury/impact → Severity/notifications.

---

## Part 2: What Competitors Do (Proven Patterns to Adopt)

> **Note:** Code references in this document (e.g., `app-core.js`, `vitalFlags()`, `choice()`) describe the vanilla JS prototype. Implement equivalent patterns using Svelte 5 components per `frontend-spec-2.md` and `charting-ux.md`.

### Industry-Standard UI Patterns (6 competitors analyzed)

| Pattern | Who Does It | Adopt? |
|---------|------------|--------|
| Left sidebar (desktop) + bottom tabs (mobile) | Brittco, MediSked, ShareNote | **Guad already does this** |
| Single scrollable form (not multi-page wizard) | 5 of 6 competitors | **Guad already does this** |
| Inline goal tracking within shift note | Brittco, iCare, Setworks | **Guad already does this** |
| Auto-save / draft persistence | Brittco, ShareNote, Remarkable | **Guad already does this (PowerSync OPFS)** |
| Tap-to-score goal cards with prompt levels | Brittco, MediSked | **Guad already does this** |
| Health vitals in 2-column grid | All 6 | **Guad already does this** |
| Recent history below entry forms | 4 of 6 | **Guad does this for health** |
| Template-driven note sections | All 6 | **GAP — Guad hardcodes sections (charting preset system now spec'd in charting-ux.md)** |
| Visual progress rings/bars for goals | MediSked, Brittco | **GAP in prototype (now spec'd in frontend-spec-2.md)** |
| Out-of-range vital sign color flagging | 4 of 6 | **GAP in prototype (now spec'd in charting-ux.md and frontend-spec-2.md)** |
| Configurable note types per agency | All 6 | **GAP — Guad has fixed categories** |
| CSV import for migration | Most | **GAP — Guad has no import** |

### What Sets Guad Apart

> **Unverified claim.** Based on research from training data up to May 2025 (see the methodology note in competitive-research.md), not a live market check. competitive-research.md itself lists Remarkable Health as offering voice-to-text documentation, and general home-care scheduling tools already auto-offer open shifts. Verify with current sources before using "nobody else does this" in sales or investor material.

| Feature | Guad | Closest Competitor |
|---------|------|-------------------|
| Voice-to-note with AI transcription | Yes (Whisper + Claude) | Nobody |
| Real-time AI note drafting | Yes (Lomi) | Nobody |
| Conversational AI assistant | Yes (Lomi chat) | Nobody |
| AI behavior note generation | Yes | Nobody |
| AI shift summaries | Yes | Nobody |
| Automated shift coverage engine | Yes | Nobody |
| Auto-save preventing lost work | Yes (PowerSync OPFS) | Brittco (partial) |

---

## Part 3: The Terminology Map (So Therap Users Don't "Relearn")

This is critical. A DSP coming from Therap should see familiar words.

| Therap Term | Guad Equivalent | What to Do |
|-------------|----------------|------------|
| T-Log | Shift Note | **Keep "Shift Note" but add "Daily Log" as subtitle** |
| Type (Health/Notes/Behavior/General) | Note categories | **Add a Type selector matching Therap's categories** |
| Summary | Summary | **Add a Summary field at top of note** |
| Description | Note body (activities/meals/mood/health) | **Already structured; add free-text option too** |
| Notification Level (Low/Med/High) | — | **Add this field** |
| ISP Data | Goal Tracking | **Keep — add "ISP Goals" as section header** |
| ISP Program | Goal | **Use "Goal" but show "ISP Goal" for formal context** |
| Prompt Levels | Levels (Independent/Verbal/etc.) | **Already matches exactly** |
| GER | Incident Report | **Keep — universally understood** |
| eMAR | Medications | **Keep — add "MAR" label on grid view** |
| SComm | Messages | **Keep** |
| Fatal Five | — | **Add health alert dashboard with this name** |
| Individual | Person / Client | **Use "Person" — more modern, person-centered** |
| BData | Behavior Data | **Add as formal section name** |
| EVV | Clock-In | **Keep — add "Visit Verification" subtitle** |

---

## Part 4: What to Build (Prioritized)

### Priority 1 — Therap Familiarity Fields (Small Changes)

These are quick additions to existing forms that make Therap users feel at home:

**1a. Add Type selector to shift notes**
Currently Guad goes straight to voice/text input. Add a chip row at top:
```
Type: [Health] [Notes] [Follow-up] [Behavior] [Contacts] [General]
```
Store as `note.types: ["Health", "Notes"]` array. Mirrors Therap's checkbox row exactly.

**1b. Add Summary field**
One-line text input above the note body: "Brief summary — e.g., PM Shift 4-12 Midnight"
Store as `note.summary`. Therap requires this; it becomes the note's title in lists.

**1c. Add Notification Level**
Choice group below Summary: `[Low] [Medium] [High]`
Store as `note.priority`. Controls sort order on supervisor dashboard.

**1d. Add Time In / Time Out**
Two time pickers. Auto-fill from clock-in/out if available.
Store as `note.timeIn`, `note.timeOut`.

**1e. Add "Write it myself" free-text mode**
Some DSPs (especially Therap veterans) want a single big textarea, not structured sections.
Add toggle: "Structured" (current) vs "Free-text" (single Description textarea like Therap).

### Priority 2 — Visual Goal Progress

**2a. Progress visualization on goal cards**
After a goal has trial data, show a progress ring or horizontal bar:
- Green fill for percentage of "Independent" trials
- Show score text: "4 of 6 independent (67%)"
- Trend arrow: ↑ improving, → steady, ↓ declining (compare last 2 weeks)

**2b. Historical trend mini-chart**
Small sparkline under each goal showing last 2 weeks of scores.
Use simple inline SVG — no charting library needed for sparklines.

**2c. ISP progress summary card**
On the person detail screen, add a card:
```
ISP Goals — 3 of 5 on track
[Goal 1] ████████░░ 80% Independent  ↑
[Goal 2] ██████░░░░ 60% Independent  →
[Goal 3] ██░░░░░░░░ 20% Independent  ↓  ⚠ Below target
```

### Priority 3 — Vital Sign Alerts

**3a. Threshold configuration**
In the client health setup (office view), let supervisors set thresholds:
- BP systolic: alert if >= 140 or < 90
- BP diastolic: alert if >= 90 or < 60
- Pulse: alert if > 100 or < 50
- Temp: alert if >= 100.4°F or < 95°F

(These defaults match the domain constants in AGENTS.md and `vitalFlags()`. The point of this section is that a nurse can set **per-person** thresholds; the defaults themselves stay the same everywhere.)
- Weight: alert if change >= 5 lb from baseline
- Blood glucose: alert if >= 250 or < 70

Store in `client.health.thresholds: { syHi: 140, syLo: 90, ... }`

**3b. Color flagging on entry**
When a DSP enters vitals, immediately color the field:
- Green border: within range
- Yellow border + warning icon: borderline
- Red border + alert icon: out of range
Guad already has `vitalFlags()` in app-core — wire it to visual indicators.

**3c. Fatal Five Dashboard (office view)**
Add a supervisor screen scanning recent notes for keywords:
- Aspiration: choking, coughing during meals, difficulty swallowing
- Bowel: constipation, no BM in 3+ days, bloating
- Dehydration: low fluid intake, dark urine, dry mouth
- GERD: heartburn, vomiting, acid reflux
- Seizures: seizure entries in health tracking
- Sepsis: fever + infection indicators

Display as a card per person with risk flags. This directly mirrors Therap's AI-powered Fatal Five Dashboard but can start rule-based.

### Priority 4 — Data Import

**4a. CSV Import Wizard**
Build a guided import flow for agency setup:
```
Step 1: Choose what to import
  [People] [Staff] [Medications] [Goals]

Step 2: Upload file
  [Drop CSV or Excel file here]

Step 3: Map columns
  Your File          →  Guad Field
  "Last Name"        →  Name (last)
  "First Name"       →  Name (first)
  "Date of Birth"    →  DOB
  "Allergies"        →  Allergies
  ...

Step 4: Preview & validate
  ✓ 24 people ready to import
  ⚠ 2 missing DOB — will import without
  ✗ 1 duplicate name — review

Step 5: Import
  [Import 24 people]
```

**4b. Downloadable CSV templates**
Provide blank templates with headers matching common Therap export formats:
- `individuals_template.csv`: Last Name, First Name, DOB, Guardian, Phone, Allergies, Conditions, Diet, Doctor
- `medications_template.csv`: Individual, Med Name, Dose, Route, Frequency, Time, PRN, Prescriber
- `goals_template.csv`: Individual, Goal Text, Measurement Method, Target, Current Baseline
- `staff_template.csv`: Name, Role, Email, Med Certified, Home Assignments

**4c. Therap column presets**
Since Therap's CSV exports have known (if inconsistent) field names, include preset mappings so admins can select "I exported from Therap" and columns auto-map.

### Priority 5 — Reporting & Export

**5a. Note history with filters**
Searchable list of all notes for an individual with filters:
- Date range
- Type (Health/Behavior/General)
- Author
- Status (submitted/approved/returned)

**5b. PDF export for ISP meetings**
Generate a printable PDF:
- Individual demographics
- Active goals with progress charts
- Recent vitals summary
- Recent incident summary
- Medication list
This replaces what Therap generates for ISP review meetings.

**5c. CSV export for reporting**
Let supervisors export:
- All notes for a date range (CSV)
- Goal progress data (CSV)
- Incident summary (CSV)
- Attendance records (CSV)

---

## Part 5: Data Migration Strategy

### For Nticare (Greenfield — No Existing EHR)

Nticare launched Sept 2025, likely using paper or basic spreadsheets. No migration needed.

**Setup flow:**
1. Admin creates agency + homes (5 minutes with setup wizard)
2. Admin adds staff roster (name, role, home, med-cert — 1 min per person)
3. Admin adds individuals (name, DOB, guardian, allergies, conditions, meds, goals — 2-3 min per person)
4. Staff training (1-2 hours using Therap terminology mapping)
5. Go live same day

**Pitch:** "Be operational in an afternoon, not 3 months."

### For Agencies Switching from Therap

**The 80/20 migration approach (industry standard):**

| What | How | Priority |
|------|-----|----------|
| Individual demographics | CSV import from Therap IDF export | Day 1 |
| Current medication lists | CSV import from Therap MAR export | Day 1 |
| Active ISP goals | CSV import or manual entry (usually <10 per person) | Week 1 |
| Staff roster | CSV import or quick manual entry | Day 1 |
| Health alerts (allergies, seizure protocols) | Part of demographics import | Day 1 |
| Historical T-Logs/notes | Keep in Therap (read-only access) | Don't migrate |
| Historical incidents (GERs) | Keep in Therap | Don't migrate |
| Historical MAR records | Keep in Therap | Don't migrate |
| Historical vitals | Keep in Therap | Don't migrate |
| Scheduling | Start fresh in Guad | Day 1 |

**The transition timeline:**
- Week 1: Import demographics + meds + goals. Staff training.
- Weeks 2-3: Parallel operation (new docs in Guad, historical lookup in Therap)
- Week 4+: Full cutover. Therap maintained read-only for audit.
- 6-12 months: Therap access kept for regulatory compliance (state retention rules require 5-7 years of records)

**Regulatory note:** No federal mandate requires Therap to provide machine-readable exports. Agencies must use Therap's CSV reports, which are described as "poorly formatted." Guad's import wizard should be forgiving about messy CSVs.

---

## Part 6: What NOT to Build (Therap Has It, Guad Doesn't Need It)

| Therap Feature | Skip It Because |
|----------------|----------------|
| BData advanced ABA analytics | BCBAs use CentralReach/Catalyst for clinic ABA. Guad targets residential/day programs. |
| State-specific GER reporting | Requires individual state contracts. Build when you have state-level customers. |
| Billing/claims (837P/837I) | Complex, requires clearinghouse partnerships. Use third-party billing integration. |
| Waiver slot management | State-level feature. Not needed for provider-level product. |
| Multi-agency data sharing | Enterprise feature. Build when multi-agency customers request it. |
| FHIR/HL7 interfaces | Therap doesn't even have this. Not expected in IDD market yet. |

---

## Part 7: Design Principles (From Competitor Analysis)

### Match the Modern Standard (Brittco/MediSked), Not the Legacy (Therap)

1. **Cards, not tables** — Guad already uses cards. Keep it.
2. **Chips/buttons, not dropdowns** — Guad's `choice()` function is better than Therap's `<select>`. Keep it.
3. **Bottom tabs on mobile** — Guad already has this. Keep it.
4. **Auto-save everything** — Guad's PowerSync OPFS persistence does this. Lean into it hard in marketing.
5. **Single scrollable form** — Guad does this for notes. Keep it.
6. **Large touch targets** — Guad's buttons and cards are mobile-sized. Keep it.
7. **Generous whitespace** — Guad's design system already has this. Keep it.

### But Use Therap's Vocabulary

The UI should look like Brittco but use Therap's words. DSPs switching from Therap should see:
- "Shift Note" (not "Progress Note" or "Service Documentation")
- "Type: Health / Notes / Behavior" (Therap's categories)
- "Notification Level" (not "Priority" — Therap's exact term)
- "Summary" (not "Title" or "Subject")
- "ISP Goals" (not "Treatment Plan Objectives")
- "Independent / Verbal Prompt / Physical Prompt" (not "Level 1/2/3")
- "Given / Refused / Held" for medications (exact Therap terms)

### Then Win with What Only Guad Has

After matching familiarity, the demo moment is:
1. "Tell Lomi about the shift" → speak naturally → AI structures it
2. "What took 15 minutes in Therap takes 2 minutes here"
3. "Your work is never lost — even if you lose connection"
4. "Lomi catches when a note should be an incident report — before you submit, not after"

---

## Summary: Implementation Order

| Phase | What | Effort | Impact |
|-------|------|--------|--------|
| **1** | Add Type/Summary/Notification Level/Time In-Out to shift notes | Small | High — instant Therap familiarity |
| **2** | Goal progress visualization (rings, sparklines, trend arrows) | Medium | High — visual differentiation |
| **3** | Vital sign threshold alerts with color flagging | Small | Medium — safety feature, matches Therap |
| **4** | CSV import wizard + Therap column presets | Medium | High — enables migration |
| **5** | Reporting & PDF/CSV export | Medium | Medium — required for ISP meetings |
| **6** | Fatal Five dashboard (rule-based, then AI) | Medium | High — matches Therap's AI, differentiator |
| **7** | ~~Configurable note templates per agency~~ | Post-v1 | Out of scope for v1 (prd.md non-goal 7). Revisit after launch. |
| **8** | Free-text mode toggle for shift notes | Small | Low-Med — accommodates Therap muscle memory |
