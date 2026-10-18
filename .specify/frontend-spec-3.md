# Guad Frontend Design Specification -- Part 3

Supervisor Experience, Component Library, Navigation & IA, What to Keep, Competitor Fixes, Implementation Priority

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

**No batch approval.** Each note must be opened and read before it can be approved (the review is what state auditors check). To keep review fast, the note detail has "Approve and next" and keyboard shortcuts (`A` approve, `S` send back, `J`/`K` next/previous) instead.

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

  Notes rows open the note detail (no inline approve: the note must be read first)
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
| David  | | Shift note from Aisha K        [pill: Review]     |
| Admin  | | Shift note from Marcus J       [pill: Review]     |
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

**Approve and next:** after approving or sending back, the detail pane moves to the next note waiting for review. There is no "approve all": approving notes nobody read defeats the review step.

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

**As built:** `/dashboard/mar` ("MAR grid" in the supervisor menu, `mar` feature), rules in `src/lib/domain/mar-grid.ts`. One row per medication and dose time, plus one row for each as-needed medication with the number given each day; one person and one week (Sunday to Saturday) at a time, up to four weeks back (the 30 days of MAR kept on the device), so it works offline. A corrected dose shows the latest correction, marked with *, as is a dose recorded twice offline. Days outside a medication's start and stop are "not scheduled" (—), doses later today are "not due yet" (dashed circle), and the compliance bar counts given doses out of those due. It is read-only: doses are recorded in Care records, so the cards remain the way to record.
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

**As built:** `VitalTrend.svelte` on the supervisor person page (`/dashboard/people/[id]`, "Vital trends", `health` feature), rules in `src/lib/domain/vital-trend.ts`. One chart per measurement with readings, from the vitals saved on the device (about 30 days). The normal band and red out-of-range points use the same limits as the health form (VITAL_LIMITS), so only temperature, pulse and blood pressure have them; SpO2, respiratory rate, glucose and weight are charted without a band and say "no alert limits set". Points have a native tooltip; the chart's accessible label lists every value and date.
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

Defined in frontend-spec-2.md §8.1 (canonical): no indicator when synced, 6px amber dot when changes are pending or syncing, a small "Offline" pill when offline, never red for connectivity.

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

**As built (SvelteKit routes under `src/routes/(app)`):** the screens above exist, but some live at other paths or as steps of one page:

| Spec route | Built as |
|---|---|
| `/signin` | `/login` (the local sign-in page lists the demo accounts) |
| `/setup` (first-run wizard) | `npm run agency:provision` (operator tool) plus `/dashboard/setup` |
| `/clock` | `ClockPanel` on `/today` and `/shifts` |
| `/shifts/coverage` | Coverage offers and activity on `/shifts` (`CoverageOffers`, `CoverageActivity`) |
| `/people/:id/note/review`, `/note/done`, `/behavior/review` | Steps inside `/people/:id/note` and `/people/:id/behavior` (one `NoteEditor`, so drafts survive the step change) |
| `/people/:id/mar` | `/people/:id/medications` |
| `/people/:id/health/summary` | `/people/:id/summary` |
| `/people/:id/incident/done` | Confirmation inside `/people/:id/incident` |
| `/dashboard/schedule` | Week grid on `/shifts` (supervisors edit slots there) |
| `/dashboard/incidents`, `/dashboard/health` | The grouped attention queue on `/dashboard` (`ClinicalAttention`: review incidents, acknowledge health entries) |
| `/dashboard/messages` | `/messages` (current home from the app bar) |
| `/dashboard/settings` | `/dashboard/setup` |

Built routes not in the map: `/notes/:id`, `/notifications`, `/notifications/:id`, `/me/notifications`, `/people/:id/attendance`, `/dashboard/{mar,goals,imports,intake,timesheets,audit,api-keys}` and the public `/offline` page.

### 7.2 Navigation Patterns

| Pattern | Caregiver | Supervisor |
|---|---|---|
| Primary nav | Bottom tabs (Today / Notes / Shifts / Me) | Left sidebar (grouped sections) |
| Secondary nav | Contextual sheets + page pushes | Split panes + horizontal tabs |
| Lomi access | "Talk to Lomi" button above tabs / in sidebar | Lomi summary card on overview |
| Quick actions | Sheet overlays for med pass, goal scoring | "Approve and next" in the note detail (notes are read before approval) |
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
| Dark mode mechanism | styles.css `[data-theme="guad-dark-off"]` selector + custom properties | Keep the token-swap approach and enable it. **Which palette** (current navy vs the warm-neutral proposal in frontend-spec-1.md §10.2) is an open design decision; until it's made, the shipped navy palette stays. |
| prefers-reduced-motion support | styles.css `@media (prefers-reduced-motion: reduce)` rules | Accessibility baseline that must be maintained and extended to all new animations. |
| Existing accessibility (aria attributes, focus-visible) | Throughout styles.css and JS | The current prototype has solid ARIA: aria-current, aria-pressed, aria-label, role="group", :focus-visible. Maintain and extend. |
| Mobile-first with desktop sidebar at 900px | styles.css `@media (min-width:900px)` rules | Correct responsive strategy. Current single breakpoint at 900px works; 640/1024 are rebuild targets. |

---

## 12. What Competitors Get Wrong (And How Guad Fixes It)

> **Unverified claim.** Based on research from training data up to May 2025 (see the methodology note in competitive-research.md), not a live market check. competitive-research.md itself lists Remarkable Health as offering voice-to-text documentation, and general home-care scheduling tools already auto-offer open shifts. Verify with current sources before using "nobody else does this" in sales or investor material.

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
| 1 | Design system tokens as CSS custom properties | P0 | Foundation for all visual consistency. Migrate from single styles.css to token layer + component files. Fix --faint to #706E96 for WCAG AA. |
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
| 12 | Voice-to-note with Lomi (batch transcription) | P0 | The #1 competitive differentiator. MediaRecorder records, the audio is uploaded once when the DSP stops, then Speech-to-Text and the draft pipeline run (ai-voice-analysis.md chose batch over real-time streaming). Offline fallback: record audio, transcribe later, use rules-based draft immediately. |
| 13 | Goal/ISP scoring interface | P0 | Prompt level pill buttons (44px min-height). Trial tracking. Score computation. |
| 14 | Medication administration (eMAR cards) | P0 | Card-based mobile view. "Mark as given" one-tap. Refused/held with reason sheet. |
| 15 | Health vital entry with threshold alerts | P0 | Vitals/seizure/illness/visit segmented control. Inline out-of-range alerts on blur. |
| 16 | Supervisor overview dashboard | P0 | KPI cards with deltas, grouped attention queue, Lomi summary card. |
| 17 | Note review and approval (split pane) | P0 | Supervisor reviews, approves, or sends back with comment. "Approve and next" plus keyboard shortcuts; no batch approve. |
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
| 36 | ~~Configurable note templates~~ | Post-v1 | Out of scope for v1 (prd.md non-goal 7: no custom form builder). Revisit after launch. |
| 37 | ~~Family/guardian read-only portal~~ | Post-v1 | Out of scope for v1 (prd.md non-goal 5: no family portal). Revisit after launch. |
| 38 | Cmd+K command palette (desktop) | P2 | Power-user differentiator. Quick actions and global search. |
| 39 | Charting preset system (Therap terminology) | P1 | Agency-level toggle: Shift Note = T-Log, Incident = GER, Messages = SComm, etc. |
| 40 | Celebration micro-animations for goal milestones | P2 | When all trials are Independent: card border flashes green, scale-up checkmark. Respect prefers-reduced-motion. As built: two or more trials this shift, all Independent (`goalMilestone()` in domain/charting.ts); the card turns green with a spring checkmark and the status text "Independent on every trial this shift". Today shows "All notes done for this shift" with a Lomi bounce once every person's note is signed. Reduced motion keeps the colour and text without movement. |

---

### Critical Fixes (Before or During Rebuild)

These issues in the current prototype must be resolved regardless of rebuild timeline:

| # | Fix | File | Current | Change To |
|---|---|---|---|---|
| 1 | Enable dark mode | styles.css `@media (prefers-color-scheme: dark)` | `max-width:0px` disables dark mode | Remove gate; add `data-theme` toggle |
| 2 | Fix --faint contrast | styles.css `:root` `--faint` | #8B89AA (3.27:1, fails AA) | #706E96 (4.70:1, passes AA) |
| 3 | Restrict .btn.lemon usage | styles.css `.btn.lemon` | Lemon bg button (11.5:1 contrast -- passes AAA, earlier 2.1:1 claim was incorrect) | Keep class but restrict to Lomi brand elements only |
| 4 | Increase .levels button | styles.css `.levels button` | min-height: 36px | min-height: 44px |
| 5 | Increase .btn.sm | styles.css `.btn.sm` | min-height: 42px | min-height: 44px |
| 6 | Increase .trial button | styles.css `.trial button` | 28x28px | 44x44px touch target (visual 28px, padded hit area) |
| 7 | Increase .seg button | styles.css `.seg button` | min-height: 42px | min-height: 44px |
| 8 | Remove backdrop-filter | styles.css `.actionbar` | backdrop-filter: blur(8px) | Solid bg: rgba(255,252,243,0.95) |
| 9 | Self-host Figtree | index.html | Google Fonts CDN link | Local @font-face with font-display:swap |
| 10 | Add color-mix() fallbacks | styles.css `button.row:hover`, `.callout` | No fallback for old Android WebView | Add static fallback values |
