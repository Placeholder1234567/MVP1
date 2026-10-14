# Charting UX Specification

> Guad ("friend" in Amharic) -- IDD residential care charting platform.
> Lomi ("lemon" in Amharic) -- AI assistant that drafts notes, covers shifts, keeps the office connected.

---

## 1. Design Philosophy

### Therap-familiar but modern
Staff moving from TherapServices.net should recognize the workflow: pick a person, write a T-Log, record ISP data, sign, submit to supervisor. But nothing about the experience should feel like a Java/JSP application from 2008. Guad is fast, clean, and built for a phone held in one hand mid-shift.

### Mobile-first
Caregivers chart on their phones. Every screen is designed for a 375px viewport first and scales up. Touch targets are 44x44px minimum. Navigation is a bottom dock with four tabs. Sub-screens slide in from the right and dismiss with a back button or swipe.

### Voice-first note creation
The primary charting path is: speak naturally, let Lomi transcribe and draft, review the structured output, sign. Target: reduce charting from 15-20 minutes to under 5 minutes. The fallback (type it yourself) is always one tap away.

### Offline-everything
Every screen renders from local data (PowerSync wa-sqlite + OPFS). Writes persist locally and sync on reconnect. No spinners, no "you're offline" dead ends. A subtle sync indicator in the app bar shows sync state, as defined in frontend-spec-2.md §8.1: nothing when synced, a small amber dot when changes are pending, an "Offline" pill when offline.

### Feels new, not foreign
The goal is not to clone Therap. The goal is to keep the mental model (person-centered charting, T-Log structure, ISP Data Collection, GER workflow) while making every interaction faster, cleaner, and more pleasant. Staff should feel like they upgraded, not like they switched.

---

## 2. Charting Preset System

The `charting_preset` field on the agency record (`"therap"` or `"default"`) drives a labels/config object consumed by all UI components. The preset never changes schema, API, validation, or business logic.

### Label Map

| UI Element | `therap` Preset | `default` Preset |
|---|---|---|
| Shift note | T-Log | Shift Note |
| Behavior note | GER (General Event Report) | Behavior Note |
| Goal tracking section | ISP Data Collection | Goal Tracking |
| Goal tracking header (on person detail) | ISP Data | Goals |
| Section ordering in note compose | General Info, Activities, ISP Data, Health, Meals, Mood (see Section Ordering below for full list) | Activities, Meals, Mood, Health, Goals (see Section Ordering below for full list) |
| Form field grouping | Tabbed layout (mentally maps to Therap's tabs) | Single-scroll card-based |
| Medication record | eMAR | Medications |
| Incident report | GER (Incident) | Incident Report |
| Supervisor review action | Approve T-Log / Return T-Log | Approve Note / Send Back |

### Implementation

A single `presetLabels` object is imported from `#lib/config/charting-preset.ts`. Every component reads labels from this object via a Svelte context or store. No component hardcodes "Shift Note" or "T-Log" as a string literal.

```typescript
// #lib/config/charting-preset.ts
export type ChartingPreset = 'therap' | 'default';

export function getLabels(preset: ChartingPreset) {
  const isTherap = preset === 'therap';
  return {
    shiftNote:       isTherap ? 'T-Log'                    : 'Shift Note',
    behaviorNote:    isTherap ? 'GER'                      : 'Behavior Note',
    goalTracking:    isTherap ? 'ISP Data Collection'      : 'Goal Tracking',
    goalTrackingNav: isTherap ? 'ISP Data'                 : 'Goals',
    mar:             isTherap ? 'eMAR'                     : 'Medications',
    incident:        isTherap ? 'GER (Incident)'           : 'Incident Report',
    approveNote:     isTherap ? 'Approve T-Log'            : 'Approve Note',
    returnNote:      isTherap ? 'Return T-Log'             : 'Send Back',
  };
}
```

### Section ordering

When `charting_preset === 'therap'`, the note compose and review screens present sections in Therap order:

1. General Information (date, shift, home, author -- read-only header)
2. Activities
3. ISP Data Collection (goals)
4. Health and Safety
5. Meals
6. Mood / Behavioral Observations

When `charting_preset === 'default'`, the order is:

1. Activities
2. Meals
3. Mood
4. Health and Safety
5. Goal Tracking

Both orders render the same underlying `content` JSONB field on the `notes` table. The preset determines only display order and labels.

---

## 3. Voice-to-Note Flow

This is the core charting experience. Every design decision optimizes for this path.

### Step-by-step UX

1. **Select person.** Caregiver taps a person row on the Today screen, then taps "Shift Note" (or "T-Log") on the Person Detail screen. If the note already exists and was returned by the supervisor, the compose screen opens in edit mode with the supervisor's comment displayed as a banner.

2. **Compose screen appears.** Centered on screen: the Lomi orb (a lemon SVG with two concentric pulsing ring animations). Below the orb: the text "Tell Lomi about the shift" (or "Tell Lomi what happened" for behavior notes). Below that: "Tap Speak, or type below."

3. **Topic suggestions.** A row of pill-shaped chips above the orb reminds the caregiver what to cover:
   - Shift note: `Meals` `Mood` `Goals` `Anything unusual`
   - Behavior note: `Before` `What happened` `Your response` `How it ended`

4. **Tap Speak.** The browser requests microphone access (first time only). MediaRecorder starts. The orb rings begin pulsing. A waveform animation (10 vertical bars with staggered CSS keyframe animations) appears below the orb. The button label changes to "Pause."

5. **Speak naturally.** The caregiver talks as they would to a coworker at shift change: "Marcus had a good lunch, he ate all his chicken and rice. He was in a great mood all afternoon. We worked on his toothbrushing goal twice, he needed a verbal prompt both times. No health issues." When the caregiver taps Pause or Done, the recording is uploaded once to the transcription service (production: Google Speech-to-Text) and the text appears in the "Transcript" textarea below the waveform. Transcription is batch, not streaming (ai-voice-analysis.md). Offline, the recording is kept on the device and transcribed on reconnect.

6. **Tap Done or Pause.** Recording stops. The transcript is editable -- the caregiver can fix names or add details. Below the textarea: a link "Write it myself instead" (skips AI, goes directly to a blank review form).

7. **Tap "Done, write my note."** The compose screen transitions to a thinking state: the orb rings pulse slowly, the text reads "Lomi is writing your note," and a three-dot loading animation plays below. The transcript and Lomi prompt (from `prompts.js`) are sent to the AI drafting service (production: Claude on Vertex AI). Target latency: under 8 seconds end-to-end.

8. **Review screen appears.** Lomi's structured draft fills pre-labeled sections. Each section is an editable textarea. Goals appear as interactive pickers. Flags and incident detection appear as callout cards. The screen scrolls vertically -- no tabs, no hidden content.

9. **Review and edit.** The caregiver reads each section, edits as needed, records goal attempts, addresses flags, and handles incident detection prompts.

10. **Sign.** Tap "Sign and submit." A bottom sheet appears with the attestation: "I confirm this note is accurate and based on what I saw during my shift." A checkbox must be checked before the "Sign as [Name]" button activates. On confirmation, the note transitions to `submitted` status and the caregiver sees a success screen.

### Offline behavior

- If offline when the caregiver taps "Done, write my note," the transcript is stored locally and the AI draft is deferred. The caregiver sees: "You're offline. Lomi will write your note when you reconnect, or you can write it yourself now." Two buttons: "Wait for Lomi" (returns to Today, note saved as pending) and "Write it myself" (opens blank review form).
- If the AI call fails (timeout, error), the system falls back to a simple rule-based draft (split transcript into sections by keyword matching) and shows a banner: "Lomi wasn't available, so this draft was sorted by simple rules. Check each section carefully."

### "Write it myself" path

Skips the orb, recording, and AI entirely. Opens the review form with empty sections. The caregiver types directly into each section. Goal pickers and incident detection still function. This path exists because some caregivers prefer typing, some situations require precision, and AI should never be the only path.

---

## 4. Screen Specifications

For each screen: purpose, layout, key interactions, offline behavior, Therap-preset differences.

---

### 4.1 Today (Caregiver Home Screen)

**Purpose:** The caregiver's landing page after clock-in. Shows who needs notes today, shift coverage offers, and overall progress.

**Layout (mobile, top to bottom):**
- **Home bar.** Left: "Guad" wordmark (brand color). Right: team messages icon (chat bubble, with unread dot) and user avatar.
- **Greeting block.** "Good morning, [first name]" in serif font. Below: home name and shift time in muted text (e.g., "Oak Street -- Shift 7am to 3pm"). If no shift is scheduled: "No shift scheduled for you today."
- **Progress card.** White card with: "Today's notes" label, "X of Y done" counter, and a horizontal progress bar (filled portion in brand blue).
- **Coverage offer (if any).** A warm-toned callout card with the Lomi lemon icon: "Can you pick up a shift? Oak Street, tomorrow, morning (7am-3pm)." Two actions: "I'll take it" (primary button) and "Not this time" (text link). At most one offer shown on Today; more on the Shifts tab.
- **People list.** Each row is a tappable card-like button:
  - Left: avatar circle with initials (2-letter, uppercase).
  - Center: person's name (bold), subtitle line showing note status and med count.
  - Right: status indicator.
    - **To do:** gray outlined chip "To do."
    - **Done:** filled blue circle with white checkmark.
    - **Fix:** red-tinted chip "Fix" (note was returned by supervisor).
  - People are sorted: incomplete notes first, then completed.

**Layout (desktop, >=900px):**
- Left sidebar replaces bottom dock (see Responsive Behavior section).
- Today content occupies the main area, max-width 640px, centered.

**Key interactions:**
- Tap a person row -> navigates to Person Detail.
- Tap messages icon -> navigates to team Messages for the current home.
- Tap coverage offer "I'll take it" -> confirms via Lomi, schedule updated, offer card disappears.
- Tap coverage offer "Not this time" -> offer dismissed, next candidate notified.

**Pre-clock-in state:**
If the caregiver has not clocked in:
- Greeting shows, but instead of the people list: "Clock in to see today's people and tasks."
- A clock-in card appears with GPS location detection:
  - "Where are you working?" with a location icon.
  - If location found and within a home's geofence: "You're at Oak Street." with a "Clock in at Oak Street" button.
  - If location found but outside all geofences: list of assigned homes with distances and "Clock in" buttons, plus a note: "You don't appear to be at any of your homes. If you clock in anyway, your supervisor will see it was outside the check-in area."
  - If location not yet requested: "Find my location" button.
  - If location denied: "Location access was denied. You can still choose your home." with manual home selection.

**Offline behavior:** Renders entirely from local data. Clock-in is persisted locally. Accepting a coverage offer requires connectivity (the first person to accept gets the shift, so it can't be queued); offline, the button reads "Needs internet".

**Therap-preset differences:** None. The Today screen uses no charting terminology.

---

### 4.2 Person Detail

**Purpose:** Hub for everything about one person today. Quick access to shift note, medications, attendance, health entries, behavior notes, and incident reports.

**Layout (mobile, top to bottom):**
- **App bar.** Back button, person's name (bold), home name (muted subtitle).
- **Info card (optional).** If the person has an `info` field (what staff should know), it appears as a muted text card below the app bar.
- **Today section.** Section header "Today." Three rows in a card list:
  1. **Shift note** (or T-Log). Icon: document. Subtitle varies:
     - Not started: "Includes 3 goals" (if goals exist) or "Today's note." Status chip: "To do" (due style).
     - Returned: "Sent back by your supervisor." Status chip: "Fix" (bad style).
     - Completed: "Signed at 2:14pm." Status chip: "Done" (ok style).
  2. **Medications** (or eMAR). Icon: pill. Subtitle: "3 scheduled doses" or "No scheduled doses." Status chip: "2 due" or "Done."
  3. **Attendance.** Icon: calendar. Subtitle: services recorded or "Which services did [first name] get today?" Status chip: "Saved" or "To do."

- **Record section.** Section header "Record." Rows in a card list:
  1. **Health.** Icon: heart. Subtitle: "Vitals, seizures, illness, visits." Chevron.
  2. **Behavior note** (or GER). Icon: waveform. Only shown if the person has behaviors in their support plan. Subtitle: "Plan: [behavior list]." Chevron.
  3. **Report an incident** (or GER Incident). Icon: triangle alert. Subtitle: "Falls, injuries, medication errors and more." Chevron.

- **About section.** Section header "About [first name]." One row:
  1. **Health summary.** Icon: file. Subtitle: "Allergies, conditions, doctor, guardian." Chevron.

**Key interactions:**
- Tap Shift note row -> if no note exists, opens Compose screen. If note exists and was returned, opens Review screen in edit mode. If note is completed, opens a read-only view.
- Tap Medications row -> opens MAR screen.
- Tap Attendance row -> opens bottom sheet with service checkboxes.
- Tap Health row -> opens Health Entry screen.
- Tap Behavior note row -> opens Compose screen for behavior type.
- Tap Incident row -> opens Incident Report wizard.
- Tap Health summary row -> opens read-only health summary with allergies, conditions, diet, doctor, guardian, DOB, current medications, and latest vitals.

**Offline behavior:** All data renders from local store. All actions persist locally.

**Therap-preset differences:**
- "Shift Note" row label becomes "T-Log."
- "Behavior Note" becomes "GER."
- "Medications" becomes "eMAR."
- "Report an incident" becomes "Report a GER."

---

### 4.3 Note Compose (Voice/Type)

**Purpose:** The voice recording and transcription screen. This is where the caregiver speaks their shift observations and Lomi turns speech into a structured note draft.

**Layout (mobile, top to bottom):**
- **App bar.** Back button. Title: person's name. Subtitle: "Shift Note -- Oak Street" (or "T-Log -- Oak Street" in therap preset).
- **Topic suggestion chips.** Horizontal row of gray pill-shaped chips:
  - Shift note: `Meals` `Mood` `Goals` `Anything unusual`
  - Behavior note: `Before` `What happened` `Your response` `How it ended`
  - Muted label above: "Try covering:"
- **Lomi orb.** Centered. Orb container is 210px with two concentric ring layers (ring1: outer `#FFF3C4`, ring2: inner `#FFE9A8` inset 26px). The lemon SVG icon (104px) sits centered inside the orb. When not recording, ring1 has a subtle breathe animation (scale 1.0 to 1.05, 2.4s); ring2 is static. When recording, the orb has a "live" class activating the breathe animation on ring1.
- **Status text.** Centered serif text at `--text-2xl` (24px).
  - Idle: "Tell Lomi about the shift" (or "Tell Lomi what happened" for behavior)
  - Recording: "Lomi is listening"
  - Below, muted 15px: Idle: "Tap Speak, or type below" / Recording: "Speak naturally"
- **Waveform (recording only).** 10 vertical bars with CSS keyframe animations creating a voice-waveform effect. Hidden when not recording.
- **Transcript card.** Full-width card with:
  - Label: "Live transcript"
  - Textarea: placeholder "Talk the way you would to a coworker at shift change..." Editable at all times. Text streams in during recording.
- **Skip link.** "Write it myself instead" -- text button that bypasses AI and opens Review with empty fields.
- **Action bar (sticky bottom).** Two buttons side by side:
  - "Speak" / "Pause" (secondary style). Disabled if browser lacks MediaRecorder.
  - "Done, write my note" (primary style). Sends transcript to AI.

**Thinking state:**
When the AI is processing, the entire compose screen is replaced by:
- Lomi orb with slow-pulsing rings.
- Serif text: "Lomi is writing your note."
- Three-dot loading animation.
- No controls visible -- the caregiver waits (typically 3-8 seconds).

**Key interactions:**
- Tap Speak -> requests mic permission (first time), starts MediaRecorder (32 kbps, auto-stops at 5 minutes). Button label becomes "Pause."
- Tap Pause -> stops recording, uploads the clip for transcription, and appends the text to the transcript. Button reverts to "Speak" for additional recording segments.
- Edit transcript -> direct text editing in the textarea.
- Tap "Done, write my note" -> sends to AI, shows thinking state, transitions to Review.
- Tap "Write it myself instead" -> skips to Review with empty sections.
- Back button -> confirms abandonment if transcript has content ("Leave without saving? Your recording will be lost.").

**Offline behavior:**
- Microphone recording works offline (MediaRecorder is browser-native).
- Transcription requires connectivity (Speech-to-Text API). If offline, the textarea shows: "You're offline. Type your notes and Lomi will draft when you reconnect." The Speak button is disabled with tooltip "Needs internet for voice."
- The "Done, write my note" button changes to "Save and draft later" when offline.

**Therap-preset differences:**
- App bar subtitle uses "T-Log" instead of "Shift Note."
- Topic suggestion chips for shift notes follow Therap ordering: `Activities` `ISP Data` `Health` `Meals`
- Behavior note chips use "GER" in the app bar subtitle.

---

### 4.4 Note Review

**Purpose:** Displays Lomi's structured draft (or a blank form for manual entry). The caregiver reviews, edits, records goal attempts, addresses flags, and signs.

**Layout (mobile, top to bottom):**
- **App bar.** Back button. Title: "Review Lomi's draft" (if AI-drafted) or "Write your note" (if manual) or "Fix your note" (if editing a returned note). Subtitle: person's name, note type, today's date.
- **Supervisor comment banner (returned notes only).** Red-tinted callout: "Supervisor: [comment text]."
- **Fallback banner (if AI unavailable).** Warm-tinted callout: "Lomi wasn't available, so this draft was sorted by simple rules. Check each section carefully."
- **Note card.** White card containing vertically stacked sections. Each section:
  - **Label** (e.g., "Activities," "Meals," "Mood," "Health and safety"). Uses preset labels.
  - **Mic button** (top-right of each section). Tapping starts per-box voice recording for that section only. See ai-pipeline.md Mode 2 (Per-Box Editing). States: idle (gray mic), recording (red pulsing mic, section border turns lemon `#FFE066`, timer shows), processing (spinner, "Updating..."), updated (section flashes lemon briefly, new text appears with diff highlight that fades after 2s), error (red mic, "Couldn't update -- try again or type"), offline (crossed-out mic, not tappable).
  - **Textarea** with the drafted text. Auto-grows with content. Placeholder: "Nothing to note." If the section contains flagged language, the textarea border is highlighted in amber. On blur after text edits or on explicit rewrite tap, Lomi rewrites the section text into clinical language (ai-pipeline.md Mode 2 -- Per-Box Editing). An "Undo" link appears for 10 seconds after any AI rewrite.

  **Shift note sections (default order):** Activities, Meals, Mood, Health and safety, Goals.
  **Shift note sections (therap order):** Activities, ISP Data Collection, Health and safety, Meals, Mood. (General Information is rendered as the app bar header -- person name, note type, date -- not as a note section.)
  **Behavior note sections:** Behavior type (choice group from person's behavior plan + "Other"), What happened right before, What [name] did, How staff responded, How it ended, How long it lasted.

- **Goal picker (shift notes only).** For each active goal on the person's plan:
  - **Collapsed state (data recorded).** One line: checkmark icon, goal text, recorded levels (e.g., "verbal, verbal, independent"), score percentage. "Edit" text button.
  - **Collapsed state (not attempted).** One line: goal text ": not attempted." Reason input field. "Record attempts instead" text button.
  - **Expanded state.** Goal text (bold). Trial display showing numbered attempts with level abbreviations (e.g., "1. Verbal" "2. Independent") and remove buttons. Prompt level buttons in a wrap-flow grid:
    - `Independent` `Verbal` `Gestural` `Model` `Partial physical` `Full physical` `Refused`
    - Tapping a button adds a trial. "Independent" trials get a green tint. "Refused" trials get a red tint.
  - "Done" text button (collapses picker). "Not attempted" text button (switches to not-attempted mode with reason field).

- **Vague language flags.** For each flag returned by the AI (e.g., `{phrase: "was fine", tip: "Describe what you saw."}`):
  - Warm-tinted callout card with an info icon.
  - Text: the tip, or default: `"[phrase]" is vague. Describe what you saw.`
  - Two actions: "Fix it" (scrolls to and focuses the textarea containing the phrase, highlights the phrase) and "Keep as is" (dismisses the flag).

- **Incident detection alert.** If the AI detected a potential incident:
  - Blue-tinted callout: "You mentioned: [summary]. File an incident report? Your supervisor will be notified."
  - Two actions: "File report" (opens Incident Report wizard, pre-populated with context) and "Not an incident" (dismisses).

- **Proactive Lomi questions.** If a section is empty, activities is under 20 characters, or a goal has no recorded trials, Lomi surfaces a targeted question in two places: (1) as a muted callout inside the section box (e.g., "How did [name] do on this goal?"), and (2) in the chat panel below. These prompt the caregiver without blocking submission. Lomi shows at most 3 proactive questions at a time; additional questions appear as earlier ones are addressed.

- **Lomi chat panel.** Below the flags/incident section. A text input with a mic button, styled as a conversation thread. The caregiver can type or speak natural-language corrections (e.g., "Actually he only ate half his lunch" or "Move the pacing note to Health"). Lomi routes the content to the correct section and rewrites accordingly (ai-pipeline.md Mode 3 -- Chat). Proactive questions from Lomi also appear here. See ai-pipeline.md for the full chat interaction model.

- **Action bar (sticky bottom).**
  - Muted text: "You review and sign every note. Lomi never submits for you."
  - Two buttons: "Edit" (secondary, scrolls to first section) and "Sign and submit" (primary, full-width).
  - For returned notes: "Sign and resubmit."

**Sign confirmation (bottom sheet):**
- Title: "Sign this note?"
- Explanation: "Once signed, it goes to your supervisor. Later changes are saved as amendments."
- Checkbox: "I confirm this note is accurate and based on what I saw during my shift."
- Button: "Sign as [full name]" (always enabled; if the box isn't checked, an inline error says "Check the box to confirm the note is accurate." This click-to-validate pattern matches the MVP and frontend-spec-2.md and is easier for screen-reader users than a disabled button).
- Cancel: "Keep editing."

**Key interactions:**
- Edit any section -> direct textarea editing.
- Goal picker -> tap level buttons to add trials, tap X to remove, tap "Not attempted" to switch mode.
- Flag "Fix it" -> scrolls to section, focuses textarea. The caregiver edits the vague phrase, and the flag auto-dismisses when the phrase is no longer present.
- Flag "Keep as is" -> flag dismissed (still recorded in audit).
- Incident "File report" -> navigates to Incident Report wizard (step 1), passing detected context.
- "Sign and submit" -> opens sign confirmation sheet.
- Confirm sign -> note status becomes `submitted`, success screen appears.

**Offline behavior:** All editing and signing works offline. The signed note persists locally and syncs on reconnect.

**Therap-preset differences:**
- Section labels use Therap terminology.
- Section order follows Therap order (Activities, ISP Data, Health, Meals, Mood). General Information is the app bar header, not a note section.
- App bar uses "T-Log" or "GER" terminology.
- Sign button reads "Sign and submit T-Log" / "Sign and submit GER."

---

### 4.5 MAR (Medication Administration Record)

**Purpose:** Record medication administration for one person today. Shows all scheduled and PRN medications with their status.

**Layout (mobile, top to bottom):**
- **App bar.** Back button. Title: "Medications" (or "eMAR"). Subtitle: person's name.
- **Safety callout.** Warm-tinted card with info icon: "Check the right person, medication, dose, time and route against the label before giving."
- **Scheduled section.** Header: "Scheduled today." One card per **dose slot**, sorted by time (earliest first). A twice-daily medication has two cards (e.g. 8:00am and 8:00pm), recorded separately. Each card:
  - **Header row.** Left: medication name (bold, 17px), below in muted text: dose, route, time (12-hour), notes. Right: status pill.
    - Not recorded: "Due" pill (due style).
    - Given: "Given" pill (ok style). Below: "Given at 8:14am by [name]."
    - Refused: "Refused" pill (bad style). Below: "Recorded at 8:14am by [name] -- [reason]."
    - Held: "Held" pill (warn style, amber -- clinically distinct from Refused). Below: "Recorded at 8:14am by [name] -- [reason]."
  - **Actions (if not recorded):**
    - "Mark as given" (primary button, full width, with checkmark icon).
    - Below in a 2-column grid: "Refused" (secondary) and "Held" (secondary).

- **PRN section.** Header: "As needed." Each PRN medication is a card:
  - Name (bold), dose, PRN instructions.
  - If given today: "Given at [time] for: [reason]." If no effect recorded yet: "Record whether it helped" button.
  - "Give as needed" button (secondary, full width).

**Bottom sheets:**

*Refused/Held reason sheet:*
- Title: "Refused: [medication name]" or "Held: [medication name]."
- Textarea: "What happened when you offered it?" (refused) or "Why was it held?" (held).
- Note: "Your supervisor will be alerted."
- "Save" button. "Cancel" button.

*PRN administration sheet:*
- Title: "Give [medication name]."
- PRN instructions displayed as muted text.
- Textarea: "Why is it needed?"
- "Record as given" button. "Cancel" button.

*PRN effect sheet:*
- Title: "Did it help?"
- Choice group: "Symptoms went away" / "Helped some" / "No change" / "Got worse."
- Auto-saves on selection.

**Key interactions:**
- "Mark as given" -> immediately records as given (current timestamp, current user). Status pill updates. Buttons disappear. Entry is irrevocable per constitution.
- "Refused" or "Held" -> opens reason sheet. After saving, status updates and supervisor is notified.
- "Give as needed" -> opens PRN sheet. After recording, a follow-up prompt appears after a configurable interval (default 30 minutes) as a push notification: "Guad: A follow-up is due. Tap to record it." (no name or medication in the push; details appear in the app, per notifications.md)

**Offline behavior:** All MAR actions persist locally. Supervisor notifications queue for sync.

**Therap-preset differences:** Screen title changes to "eMAR." No other differences.

---

### 4.6 Health Entry

**Purpose:** Record vitals, seizures, illness, or medical visits for one person.

**Layout (mobile, top to bottom):**
- **App bar.** Back button. Title: "Health." Subtitle: person's name.
- **Segmented control.** Four segments: `Vitals` | `Seizure` | `Illness` | `Visit`. Tapping a segment changes the form below. Default: Vitals.
- **Form card.** Fields change per type:

  **Vitals:**
  - 2-column grid: Blood pressure top (number, mmHg unit), Blood pressure bottom (number, mmHg unit).
  - 2-column grid: Pulse (number, bpm unit), Temperature (number with 0.1 step, degrees F unit).
  - Weight (number with 0.1 step, lb unit).
  - Out-of-range validation fires on blur with immediate inline alerts:
    - Temp >= 100.4 or < 95: "Temperature is outside the normal range."
    - Pulse > 100 or < 50: "Pulse is outside the normal range."
    - Systolic >= 140 or < 90: "Blood pressure (top) is outside the normal range."
    - Diastolic >= 90 or < 60: "Blood pressure (bottom) is outside the normal range."
  - Alerts appear as red text below the field and the field border turns red. The entry can still be saved -- the alert is informational, not blocking.

  **Seizure:**
  - 2-column grid: Started at (time input), Lasted (text, e.g., "About 2 minutes").
  - What you saw (textarea, placeholder: "Describe exactly what you observed").
  - Afterwards (textarea, placeholder: "How they were after").
  - What you did (textarea, placeholder: "Steps you took from the seizure protocol").

  **Illness:**
  - Symptoms (textarea, placeholder: "What you noticed").
  - Started (text, e.g., "This morning").
  - Might it spread to others? (select: "Not sure" / "Yes" / "No").
  - What you did (textarea, placeholder: "Who you told and what you did").

  **Visit (appointment):**
  - Date (date input).
  - With (text, provider name).
  - Reason (text).
  - Outcome and follow-up (textarea, placeholder: "What the provider said and any next steps").

- **Recent entries.** Section header: "Recent." Last 3 health entries for this person, displayed as a card list. Each row: kind and timestamp (bold), summary text, alert pill if flags exist.

- **Action bar (sticky bottom).** "Save [type]" button (e.g., "Save vitals," "Save seizure").

**Key interactions:**
- Switch segment -> form clears and changes to the selected type. Unsaved data in the previous type is discarded (no confirmation needed -- the forms are quick).
- Save -> validates required fields, checks vital ranges, persists entry. If any vitals are out of range, the entry is saved with flags that appear on the supervisor dashboard as health alerts.
- After save -> success screen: "[Type] saved for [name]. Your supervisor can see it now." Return to Person Detail.

**Offline behavior:** All entries persist locally. Flagged vitals generate a local notification to the supervisor that syncs on reconnect.

**Therap-preset differences:** None. Health terminology is consistent across presets.

---

### 4.7 Incident Report

**Purpose:** Structured 3-step wizard for documenting incidents. Designed to capture complete, objective information in the order it matters: what happened, who was affected, how serious it was.

**Layout (mobile):**
- **App bar.** Back button. Title: "Incident report" (or "GER"). Subtitle: person's name, "Step X of 3."
- **Progress bar.** Horizontal bar showing completion (33% / 67% / 100%).

**Step 1: What happened**
- **What kind of incident?** Choice group (wrap-flow buttons): Fall, Injury, Seizure, Medication error, Left without staff, Behavior with harm, Property damage, Other.
- **Time and Location.** 2-column grid: Time (time input), Where (select: Bedroom, Bathroom, Kitchen, Living room, Outside, Community, Vehicle, Other).
- **What happened.** Textarea, placeholder: "Describe only what you saw or heard."
- **What happened right before.** Textarea for antecedent documentation.

**Step 2: Assessment and response**
- **Any injury?** Choice group: No injury seen, Yes, Not checked yet. If "Yes": textarea for injury description (placeholder: "Where on the body, size, color, any bleeding").
- **What you did.** Textarea for staff action.
- **Medical follow-up.** Choice group: None needed, Nurse to check, Doctor visit, Emergency care.
- **Witnesses.** Text input.

**Step 3: Severity and notifications**
- **How serious was it?** Choice group: Low, Medium, High.
- **Who needs to be told.** Dynamically populated checklist based on incident type and severity. Each row: checkbox, role/person name, required timing. MVP rules (from `notifRules()` in app-core.js):
  - All incidents (any severity): Supervisor (Right away), Family or guardian (Within 24 hours).
  - Seizure, Medication error, Injury, or Fall: add Nurse (Within 2 hours).
  - High severity or "Left without staff" type: add State reporting system (Check your state's deadline).
  - *Note: These are simplified placeholder rules. Production deployment should implement state-specific regulatory notification timelines, which may include Program Director, prescribing doctor, and severity-graduated deadlines. See `notifications.md` for the full production notification architecture.*
- Checkboxes indicate "already told." Unchecked items become action items on the supervisor dashboard.

**Action bar (sticky bottom):**
- Step 1-2: "Back" (secondary) and "Next" (primary).
- Step 3: "Back" (secondary) and "Submit report" (primary).

**Key interactions:**
- Navigate between steps with Back/Next. Form data persists across steps within the session.
- Submit -> incident saved with `status: open`. Success screen: "Incident report submitted. Your supervisor has been notified." All required notifications that were not checked as "already told" appear as attention items on the supervisor dashboard.

**Offline behavior:** Incident report saves locally. Notification dispatch queues for sync. The supervisor receives the notification when either party comes online.

**Therap-preset differences:** Title changes to "GER" in app bar and success screen. "Report an incident" becomes "Report a GER" on Person Detail. Incident types and severity options remain the same (these are regulatory, not stylistic).

---

### 4.8 Supervisor Dashboard (Overview)

**Purpose:** The supervisor's landing page. Shows a high-level snapshot of today across all assigned homes (or one selected home), with an AI summary and a prioritized attention list.

**Layout (desktop, sidebar + main area):**
- **Sidebar.** Agency wordmark "Guad" at top. Home selector (dropdown: "All homes" or individual home). Navigation buttons with count badges:
  - Overview, Schedule, Notes (count: to review), Incidents (count: open), Medications (count: refused/held unacknowledged), Health (count: alerts), People, Messages, Analytics, Reports, Setup.
  - Bottom: user avatar, name, role, "Switch" link.

- **Main area (Overview tab):**
  - **Greeting.** "Hello, [first name]" in serif. Below: selected home name (or "All homes") and today's date.
  - **Setup prompt (if applicable).** If no clients or only one staff member: card prompting to finish setup with links to Setup and People tabs.
  - **Lomi summary card.** Lemon icon (40px). "Lomi's summary" header. If generated: 2-4 sentence plain-English summary of today's status (most important first: incidents, health alerts, refused meds, open shifts, missing notes). "Refresh summary" button. If not yet generated: "A quick read on today across coverage, notes, incidents, meds and health." "Summarize today" button.
  - **KPI stat cards.** 4-card grid:
    1. Shift notes in: "X/Y" (done/total).
    2. Open shifts ahead: count.
    3. Open incidents: count.
    4. Doses not recorded: count.
  - **Attention list.** Section header: "Needs your attention" with item count. Each row is tappable and navigates to the relevant detail screen. Item types (in priority order):
    1. **Coverage gaps.** Unfilled or offered shifts. Pill: "Coverage."
    2. **Open incidents.** Type and severity. Pill: "Incident."
    3. **Health alerts.** Out-of-range vitals or flagged entries. Pill: "Health."
    4. **Medication issues.** Refused or held doses not yet followed up. Pill: "Medication."
    5. **Notes to review.** Submitted notes awaiting approval. Pill: "Review."
    6. **Unverified clock-ins.** Staff who clocked in outside the geofence. Pill: "Check-in."
  - If empty: "You're all caught up."

**Layout (mobile):**
The supervisor dashboard is primarily a desktop experience, but on mobile it renders as a single column with the sidebar replaced by a hamburger menu or top-level tab bar. The KPI cards stack in a 2x2 grid. The attention list renders identically.

**Key interactions:**
- Home selector -> filters all dashboard data to the selected home.
- "Summarize today" -> calls Lomi summary endpoint (Claude on Vertex AI with today's stats as structured data). Streams response into the summary card.
- Tap attention item -> navigates to the relevant detail view (note review, incident detail, health entry, schedule, etc.).
- Sidebar navigation -> switches the main content area to the selected tab.

**Offline behavior:** All stats and attention items render from local data. Lomi summary requires connectivity (button shows "Needs internet" tooltip if offline).

**Therap-preset differences:** Attention list labels use Therap terms where applicable (e.g., "T-Log to review" instead of "Note to review").

---

### 4.9 Supervisor Note Review

**Purpose:** Full display of a submitted note with all sections, goal data, and audit trail. Supervisor can approve or send back with comments.

**Layout (desktop, within split-pane):**
The Notes tab shows a split layout: note list on the left, selected note detail on the right.

- **Note list (left pane).** Each row: avatar (person initials), person's name (bold), note type and author, date. Status pill: "To review" (info), "Approved" (ok), "Sent back" (bad). Selected row has a blue background tint.

- **Note detail (right pane).** Card with:
  - **Header.** Person's name (19px bold). Below: note type (Shift note or Behavior note), author name, date and time. Status pill.
  - **Content sections.** Key-value pairs for each section (Activities, Meals, Mood, Health). Non-empty sections only.
  - **Goal data.** For each recorded goal: goal text, trial levels (e.g., "Verbal, Verbal, Independent"), score percentage. For not-attempted goals: "Not attempted. [reason]."
  - **Audit trail.** Timeline of actions: "Oct 11, 2:14pm -- Marcus Johnson: Signed and submitted." "Oct 11, 2:15pm -- Lomi: Drafted with AI assistance."
  - **Review actions (if status is "submitted").** Comment textarea: "Comment for [author first name] (required to send back)." Two buttons: "Approve note" (primary) and "Send back" (secondary). Send back requires a non-empty comment.

**Key interactions:**
- Select note from list -> detail pane updates.
- Approve -> note status changes to `approved`. Note disappears from attention list. Audit trail updated.
- Send back -> note status changes to `returned` with the supervisor's comment. The caregiver sees "Fix" on their Today screen and the supervisor's comment when they open the note.

**Offline behavior:** Approval and send-back require connectivity (offline-sync.md, "What Requires Connectivity"); the buttons read "Needs internet" while offline. Reading notes works offline.

**Therap-preset differences:** "Shift note" becomes "T-Log," "Behavior note" becomes "GER." "Approve note" becomes "Approve T-Log." Section labels follow Therap ordering.

---

### 4.10 Schedule Grid

**Purpose:** Visual weekly schedule for one home showing all shifts across 7 days. Supports assigning staff, posting open shifts to Lomi, and monitoring coverage activity.

**Layout (desktop):**
- **Header.** "Schedule" in serif. Below: home name and week range. "Previous week" / "Next week" buttons.
- **Grid.** 7 columns (days) x 3 rows (AM/PM/ON shifts). Column headers show day labels; today's column is highlighted. Row headers show shift labels and times.
  - **Filled slot.** Staff name (bold). If filled via Lomi: small "Covered by Lomi" label.
  - **Open slot.** Orange-tinted cell: "Open shift."
  - **Offered slot.** Blue-tinted cell: "Offered to staff."
  - **Empty slot.** Dashed border: "+ Add."
  - Past days are grayed out.
- **Slot bottom sheet (on click).** Appears when any slot is tapped:
  - Title: day label, shift label and time.
  - Home name.
  - Staff assignment dropdown: lists staff assigned to this home, with their weekly shift counts.
  - "Save" button.
  - "Post as open shift and let Lomi fill it" button (secondary, with lemon icon). Starts the Lomi coverage workflow.
  - "Remove this shift" text button (if slot is filled).
  - "Cancel" button.
- **Coverage activity section.** Below the grid. Shows the most recent 6 coverage events as timeline cards. Each card:
  - Shift info (day, shift, time).
  - Callout reason or "Open shift."
  - Status pill: "Filled by [name]" (ok), "Needs you" (bad), "Offered" (info).
  - Timeline: timestamps and descriptions of each step Lomi took.
  - Candidate list: each caregiver considered, their eligibility reason, and reply status.

**Layout (mobile):**
The grid scrolls horizontally. Slot interactions use bottom sheets. Coverage activity appears below the grid as a vertical card list.

**Key interactions:**
- Tap a slot -> opens slot bottom sheet.
- Assign staff -> saves slot as filled. Schedule updates immediately.
- Post to Lomi -> creates a coverage request. Lomi begins texting eligible caregivers. Slot changes to "Offered" state. Coverage activity updates live through PowerSync sync (queued while offline).
- Navigate weeks -> grid updates to show the selected week.

**Offline behavior:** Schedule renders from local data. Assignments persist locally. Posting to Lomi queues the request for sync (Lomi texting requires connectivity).

**Therap-preset differences:** None. Schedule terminology is consistent across presets.

---

## 5. Success Screen

After signing a note, submitting an incident, or recording a health entry, a success screen appears:

- Large green checkmark animation (circle with checkmark).
- Serif headline: context-specific message (e.g., "Shift note signed," "Incident report submitted," "Vitals saved").
- Muted subtitle: "Your supervisor can see it now."
- "Back to today" button (primary, full width).
- "More for [first name]" button (secondary, full width) -- returns to Person Detail.

---

## 6. Team Messages

Each home has a team channel visible to all staff and supervisors assigned to that home. Lomi posts coverage updates here automatically.

**Layout:**
- **App bar (caregiver).** Back button. Title: "[Home name] team." Subtitle: "Staff, supervisors and Lomi."
- **Message list.** Chronological list of messages. Each message:
  - Alignment: own messages right-aligned (blue background), others left-aligned (gray background), Lomi messages left-aligned (pale yellow background with lemon icon).
  - Sender name and timestamp above message text.
- **Composer (sticky bottom).** Text input with placeholder "Message the [home name] team." Send button (paper plane icon).

**Key interactions:**
- Type message and tap send -> message appears immediately (optimistic update). Syncs on reconnect.
- Scroll up to see history.

**Offline behavior:** Full history renders from local data. Sent messages persist locally and sync when online.

**Therap-preset differences:** None.

---

## 7. Component Architecture

### Core SvelteKit Components

| Component | Description | Key Props |
|---|---|---|
| `AppBar` | Top bar with back button, title, optional subtitle | `title`, `subtitle`, `backAction` |
| `ChoiceGroup` | Horizontally wrapping group of toggle buttons (single-select) | `options[]`, `value`, `onSelect` |
| `Field` | Label + input wrapper with optional unit suffix | `id`, `label`, `type`, `unit`, `value` |
| `Sheet` | Bottom sheet with scrim overlay, grab handle, focus trap | `open`, `onClose`, children (slot) |
| `Pill` | Status chip with semantic color variants | `variant: 'ok'\|'bad'\|'due'\|'info'\|'mute'`, `text` |
| `CardList` | Vertical list of tappable row buttons | children (slot, rows) |
| `NoteSection` | Label + auto-growing textarea with optional flag highlighting | `label`, `value`, `flagged`, `placeholder` |
| `GoalPicker` | Goal trial recorder with level buttons, trial display, not-attempted toggle | `goal`, `trials[]`, `notAttempted`, `reason` |
| `LomiOrb` | Animated lemon SVG with two concentric pulsing rings | `size`, `live` (boolean, activates recording animation) |
| `ProgressBar` | Horizontal bar showing fractional completion | `done`, `total` |
| `SyncIndicator` | Sync state per frontend-spec-2.md §8.1 (none / amber dot / Offline pill) | `status: 'synced'\|'pending'\|'offline'` |
| `Callout` | Colored banner card for warnings, info, errors | `variant: 'warn'\|'info'\|'bad'`, children |
| `Waveform` | CSS-animated vertical bars simulating audio visualization | `active` (boolean) |
| `Avatar` | Circle with initials, optional size variants | `initials`, `size: 'sm'\|'md'\|'lg'` |
| `SegmentedControl` | Horizontal segmented button group (like iOS) | `options[]`, `value`, `onChange` |

### Layout Components

| Component | Description |
|---|---|
| `CaregiverShell` | Mobile layout wrapper: content area + bottom dock with 4 tabs |
| `SupervisorShell` | Desktop layout wrapper: sidebar + main content area |
| `SplitPane` | Two-column layout for list + detail views (desktop only) |

### Svelte 5 Rune Patterns

All state management uses Svelte 5 runes (`$state`, `$derived`, `$effect`). No Svelte stores (`writable`, `readable`) in new code.

```svelte
<script>
  let notes = $state([]);
  let pending = $derived(notes.filter(n => n.status === 'submitted'));
  
  $effect(() => {
    // Sync indicator updates when pending count changes
    syncStatus.set(pending.length > 0 ? 'pending' : 'synced');
  });
</script>
```

---

## 8. Accessibility

### WCAG 2.1 AA Compliance (minimum)

- **Keyboard navigation.** All interactive elements are reachable and operable via keyboard (Tab, Enter, Space, Arrow keys). Bottom sheets trap focus. Escape closes sheets and modals.
- **ARIA attributes.**
  - Icon-only buttons carry `aria-label` (e.g., `aria-label="Back"`, `aria-label="Send"`).
  - Choice groups use `role="group"` with `aria-pressed` on each button.
  - Bottom sheets use `role="dialog"` and `aria-modal="true"` with `aria-labelledby` pointing to the sheet title.
  - Navigation tabs use `aria-current="page"` on the active tab.
  - Alert callouts use `role="alert"` for screen reader announcement.
  - The schedule grid cells are buttons with descriptive labels (e.g., "Monday AM shift: Marcus Johnson" or "Tuesday PM shift: open").
- **Focus management.**
  - Opening a sheet moves focus to the sheet title or first interactive element.
  - Closing a sheet returns focus to the element that opened it.
  - After signing a note, focus moves to the success screen heading.
  - "Fix it" on a vague language flag moves focus to the relevant textarea.
- **Screen reader announcements.**
  - Status changes (note signed, medication given, clock-in confirmed) are announced via `aria-live="polite"` regions.
  - Error messages use `aria-live="assertive"`.
  - Loading states ("Lomi is writing your note") are announced.
- **Color independence.** Every status that uses color also uses text or an icon:
  - "To do" chip has text, not just a gray color.
  - "Done" has a checkmark icon inside a blue circle.
  - "Fix" has text inside a red-tinted chip.
  - Out-of-range vital alerts use red text AND a descriptive message.
- **Touch targets.** All interactive elements are at minimum 44x44px. This includes: buttons, choice group items, goal level buttons, medication action buttons, navigation tabs, avatar buttons, and sheet grab handles.
- **Text sizing.** All text uses relative units (rem). The app respects the user's system font size preference. No text is smaller than 13px at default size.
- **Motion.** The Lomi orb animation, waveform, and loading dots respect `prefers-reduced-motion: reduce` -- animations are replaced with static states.

---

## 9. Responsive Behavior

### Mobile (< 900px)

- **Navigation.** Bottom dock with 4 tabs: Today, Notes, Shifts, Me. Above the tabs: a centered "Talk to Lomi" button with the lemon icon. The dock is fixed to the bottom of the viewport.
- **Layout.** Single column. Full-width cards. No side-by-side panes.
- **Sub-screens.** Person Detail, Compose, Review, MAR, Health, Incident, Messages -- all render as full-screen views that slide in from the right with a back button in the app bar.
- **Bottom sheets.** Used for: sign confirmation, medication refusal reason, PRN administration, attendance recording, callout confirmation, person picker.
- **Schedule.** Horizontally scrollable grid. Slot interactions via bottom sheets.

### Desktop (>= 900px)

- **Caregiver view.** Left sidebar replaces bottom dock. Sidebar contains: "Guad" wordmark, "Talk to Lomi" button, navigation links (Today, Notes, Shifts, Messages, Me), and user info at the bottom. Main content area centered, max-width 720px.
- **Supervisor view.** Left sidebar with home selector and full navigation (Overview, Schedule, Notes, Incidents, Medications, Health, People, Messages, Analytics, Reports, Setup). Main content area fills remaining width. Split-pane layouts for Notes, Incidents (list on left, detail on right). Schedule grid renders without horizontal scroll.
- **Bottom sheets on desktop.** Render as centered modal dialogs instead of bottom-anchored sheets. Same content, different positioning. Scrim overlay still present.

### Breakpoint behavior

| Width | Layout | Nav |
|---|---|---|
| < 900px | Single column, bottom dock | 4-tab dock + Lomi button |
| 900-1024px | Sidebar + main (no split pane) | Sidebar nav |
| > 1024px | Sidebar + main (split pane where applicable) | Sidebar nav |

Note: The caregiver phone frame gets desktop border/shadow at >= 700px (per styles.css). The supervisor dashboard collapses to single column at <= 900px.

---

## 10. Navigation Maps

### Caregiver Navigation

```
Today (home)
  |-- [tap person] --> Person Detail
  |     |-- Shift Note --> Compose --> Review --> Sign --> Success
  |     |-- Medications --> MAR
  |     |-- Attendance --> Sheet (services)
  |     |-- Health --> Health Entry
  |     |-- Behavior Note --> Compose (behavior) --> Review --> Sign --> Success
  |     |-- Incident --> Incident Wizard (3 steps) --> Success
  |     |-- Health Summary --> Read-only summary
  |-- [tap messages] --> Messages
  |-- [tap coverage offer] --> Accept/Decline
Notes (tab)
  |-- Today's activity log (notes, meds, health, incidents, attendance)
Shifts (tab)
  |-- Clock status card
  |-- Coverage offers
  |-- 7-day schedule
  |-- [tap "Can't make it"] --> Callout sheet --> Lomi coverage
Me (tab)
  |-- Profile info
  |-- Clock out
  |-- Switch user
```

### Supervisor Navigation

```
Overview
  |-- Lomi summary
  |-- KPI cards
  |-- Attention items --> [tap] --> relevant detail view
Schedule
  |-- Weekly grid --> [tap slot] --> Slot sheet (assign / post to Lomi)
  |-- Coverage activity log
Notes
  |-- Split pane: note list | note detail
  |-- [approve / send back]
Incidents
  |-- Split pane: incident list | incident detail
  |-- [mark reviewed with follow-up]
Medications
  |-- Table: all meds across all people today
  |-- [mark followed up]
Health
  |-- List of health entries with alert badges
  |-- [mark followed up]
People
  |-- Person list --> Person detail (tabs: overview, goals, meds, attendance, case notes)
  |-- Add person form
Messages
  |-- Team channel for selected home
Analytics
  |-- Coverage, documentation, and care charts (4-week trends)
Reports
  |-- CSV export: notes, incidents, MAR, goals, attendance, coverage, clock-ins
Setup
  |-- Homes: add/edit homes with geofence
  |-- Staff: add/edit staff with role, homes, med certification
```

---

## 11. Lomi Interaction Patterns

Lomi appears in four contexts across the application. Each has a distinct visual treatment and interaction model.

### 11.1 Note Drafting (Compose Screen)
- **Visual:** Orb container (210px) with 104px lemon SVG inside, and concentric ring layers.
- **Interaction:** Voice recording, transcription, AI drafting.
- **Tone:** Encouraging, brief. "Tell Lomi about the shift." "Lomi is writing your note."
- **Output:** Structured JSON mapped to note sections.

### 11.2 Shift Coverage (Scheduling)
- **Visual:** Small lemon icon (26px) in callout cards and team messages.
- **Interaction:** Automatic. Lomi texts caregivers, logs steps, posts updates to team channel.
- **Tone:** Professional, informative. "Lomi offered this shift to 4 trained caregivers nearby." "Priya accepted at 6:12am."
- **Output:** Coverage request progression, schedule updates, team channel messages.

### 11.3 Daily Summary (Supervisor Dashboard)
- **Visual:** Medium lemon icon (40px) in summary card.
- **Interaction:** Supervisor taps "Summarize today." Lomi generates a 2-4 sentence summary.
- **Tone:** Concise, prioritized. Most important items first (incidents, alerts, gaps).
- **Output:** Plain-text paragraph.

### 11.4 "Talk to Lomi" (Dock Button)
- **Visual:** Lemon icon (30px) in the dock "Talk to Lomi" button.
- **Interaction:** Opens a person picker sheet. Caregiver selects who the note is about, then enters the Compose screen.
- **Purpose:** Quick access to start a note without navigating through Person Detail first.

### 11.5 Multi-Modal Review (Per-Box + Chat)

On the review screen, Lomi supports three additional input modes beyond the initial voice brain dump (see ai-pipeline.md for full architecture):

- **Per-box editing (Mode 2).** Each section textarea has a mic button at top-right. Tapping records audio scoped to that section. Speech-to-Text transcribes, then Haiku rewrites the section with the new content merged in. The section flashes lemon briefly to indicate the update. An "Undo" link appears for 10 seconds. Text editing works the same way: when the caregiver types casual language into a section and blurs the field (or taps the rewrite button), Lomi rewrites the text into clinical documentation language via Haiku. The rewrite preserves meaning but improves clinical tone.
- **Chat (Mode 3).** A chat panel at the bottom of the review screen accepts text or voice input. Lomi classifies which section the content belongs to and routes it there. Example: "He only ate half his lunch" updates the Meals section. Proactive questions from Lomi also appear in this panel.
- **Direct edit (Mode 4).** The caregiver types clinical language directly into any section box. No AI involvement. This is the fallback for experienced staff who prefer to write their own notes.

### Lomi Design Rules
1. Lomi never submits, approves, or signs anything. Lomi drafts; humans confirm.
2. Lomi output is always visually labeled: "Review Lomi's draft" header, "Drafted with AI assistance" in audit trail.
3. The entire voice-to-draft pipeline (transcription + parallel AI calls) targets under 8 seconds total. The thinking state specifically ("Lomi is writing your note" to draft rendering) targets under 5 seconds. If the thinking state exceeds 8 seconds, the fallback (rule-based draft) activates.
4. Lomi never speaks in first person in clinical notes. Notes are third-person, past tense, objective.
5. Lomi's lemon icon is the only yellow element in the UI. This makes it instantly recognizable.

---

## 12. Offline Indicators

The app never shows a blocking "you're offline" screen. Instead:

- **Sync indicator in app bar** (canonical spec: frontend-spec-2.md §8.1):
  - Nothing shown when synced. This is the default.
  - Amber dot: changes pending or syncing (tappable, shows count: "3 changes waiting to sync").
  - "Offline" pill: device is offline. Never red; being offline is normal.
- **Feature-specific messaging.** When a specific feature requires connectivity:
  - Lomi voice recording: "Needs internet for voice" tooltip on disabled Speak button.
  - Lomi AI drafting: "You're offline. Lomi will write your note when you reconnect, or you can write it yourself now."
  - Lomi summary: "Summarize today" button shows "Needs internet" tooltip.
  - Push notifications: queued silently.
- **Data freshness.** On reconnect, PowerSync resolves conflicts (server-authoritative). If a note was approved by the supervisor while the caregiver was offline, the local status updates on sync and the Today screen reflects the change.

---

## 13. Error Handling Patterns

- **Validation errors.** Inline, below the relevant field, in red text with `role="alert"`. Never in a toast or modal. Fields with errors get a red border.
- **Server errors.** If a sync fails, the amber sync dot appears. The change remains in the local queue. No user-facing error message unless the user explicitly checks sync status.
- **AI errors.** If Vertex AI returns an error or times out, the fallback rule-based draft activates with a banner explaining it. If transcription fails, the Speak button is disabled with an explanation.
- **Permission errors.** If microphone permission is denied, the Speak button is disabled. A muted message appears: "Microphone access was denied. You can type your notes below."
- **PHI safety.** Error messages never contain client names, health data, or any PHI. Error messages reference only operation identifiers: "Could not save note (ref: n-3f8a). Try again." Monitoring tools (Cloud Logging, Error Reporting) receive the same sanitized messages.

---

## 14. Animation Specifications

### Lomi Orb Rings
- **ring1:** Outer ring (`#FFF3C4`). In live mode: uses `breathe` keyframe -- `transform: scale(1)` to `scale(1.05)`, 2.4s ease-in-out, infinite.
- **ring2:** Inner ring (`#FFE9A8`, inset 26px). Static -- no animation.
- **Live mode (recording):** Orb gets `.live` class. ring1 animates with the `breathe` keyframe. ring2 remains static.
- **Reduced motion:** ring1 animation disabled (static). No animation on any orb element.

### Waveform
- 10 vertical bars, each with a CSS keyframe animation that varies height between 10px and 38px.
- Each bar has a different animation duration (0.3s to 0.7s) and delay (0 to 0.15s) for organic movement.
- **Reduced motion:** bars are static at varied heights.

### Loading Dots
- 3 dots, each fading opacity 0.3 to 1.0 with 0.2s stagger.
- **Reduced motion:** dots are static at full opacity.

### Success Checkmark
- Circle scales from 0 to 1, checkmark draws (stroke-dashoffset animation) over 0.4s.
- **Reduced motion:** instant appearance, no animation.

### Page Transitions
- Sub-screens slide in from right (transform: translateX(100%) to translateX(0), 200ms ease-out).
- Sheets slide up from bottom (transform: translateY(100%) to translateY(0), 250ms ease-out).
- Scrim fades in (opacity 0 to 0.5, 200ms).
- **Reduced motion:** instant appearance for all transitions.

---

## 15. Typography and Spacing

### Type Scale
| Role | Size | Weight | Font |
|---|---|---|---|
| Page heading (h1) | 30-38px | 400 (serif) / 700 (sans) | Serif (Georgia, Times New Roman, serif) |
| Section heading (h2) | 15-20px (`.section-h`: 15px, `.sheet`: 20px) | 600 | System sans-serif |
| Card title / row name | 15-17px | 600 | System sans-serif |
| Body text | 16px | 400 | System sans-serif |
| Secondary / muted text | 14px | 400 | System sans-serif |
| Fine print / timestamps | 13px | 400 | System sans-serif |

Serif (Georgia, Times New Roman, serif) is used only for page-level headings (greeting, screen titles). Everything else uses Figtree (the project sans-serif font) for maximum readability on all devices. See `design-system.md` for canonical font definitions.

### Spacing
- Page padding: 16px horizontal (mobile), 24px (desktop).
- Card padding: 16px 18px.
- Section gap (between cards/sections): 18px.
- Field gap (within forms): 14px.
- Action bar padding: 12px horizontal, 10px vertical.
- Screen bottom padding: 120px (to clear dock/nav).
- Minimum touch target: 44x44px.

See `design-system.md` for canonical spacing values.

---

## 16. Color Semantics

> **See `design-system.md` for the complete, canonical color token table, dark mode values, and all component patterns.**
> All color values are defined in `styles.css` and extracted into `design-system.md`. Do NOT duplicate the full token table here -- refer to `design-system.md` as the single source of truth for exact hex values, dark mode tokens, and component-level color usage.

Colors are defined as CSS custom properties. Font: **Figtree** (Google Fonts, weights 400/500/600/700).

Key UX-relevant color rules:
- Page background is warm cream (`--bg: #FFFCF3`), NOT pure white. This is the signature Guad warmth.
- Lomi's yellow (`--lemon: #FFD66B`) is the only yellow element in the UI, making the lemon icon instantly recognizable.
- Success/approved uses `--ok` (green). Errors/refused uses `--bad` (red). Held medications use warn style (amber) -- distinct from refused.
- Dark mode is defined via `[data-theme="guad-dark-off"]`. The `prefers-color-scheme` path in styles.css is disabled (`max-width:0px` guard) until dark mode is turned on in the rebuild.
