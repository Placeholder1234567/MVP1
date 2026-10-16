# Lomi AI Pipeline

## Implemented drafting review increment

The current Svelte app uses `lomi.draft`, `lomi.edit`, and `lomi.route` tRPC mutations (the REST endpoints below remain architecture references). Section edits and follow-up observations produce proposals; caregivers explicitly apply or discard them, then separately use the reviewed draft in the note. The note's signature remains a separate action. Empty sections offer direct editing. Direct text and conservative sorting remain available without configured providers.

Draft goal references are deliberately more conservative than the target trial-matching design below: the server loads active goals through the caller's tenant/home access and accepts references only to those IDs with exact observation quotes. The review screen displays all active goals and asks the caregiver to record actual trial levels manually. Lomi never fills trial scores. This avoids treating a model-inferred outcome as an observed clinical fact.

The bounded edit API accepts one of the four shift or five behavior sections, current text up to 6000 characters, and additional observations up to 2000 characters. Follow-up routing supports shift sections only, with a combined current-text/message maximum of 8000 characters. Longer sections keep direct editing available. The hourly per-user limits are 60 edits and 30 routes, inside the shared 500-call agency allowance. Configured `LOMI_FAST_MODEL` is used for edits/routes, otherwise the draft model is used. Provider failure returns a clearly labeled verbatim-append/sorting proposal; access checks and rate limits never become successful generated results.

Where an accepted proposal differs from Mode 2/3 below: the target design applies a rewrite immediately with a 10-second undo, but this increment shows "Now" and "Proposed" text and changes nothing until the caregiver taps "Apply proposed changes" (or "Discard suggestion"). After applying, "Undo last accepted change" restores the previous section text until the next direct edit. Chat routing does not update goals (Mode 3's goal example is not implemented).

Vague language flags are shown per section from the current text (`vagueFlags`, `openSectionFlags` in `src/lib/domain/`), with "Fix it" (focuses and selects the phrase) and "Keep as is". The reviewed draft can't be used in the note until every flag is fixed or kept, matching frontend-spec-2.md §3.2's sign-time rule one step earlier.

Recordings remain bounded to 55 seconds inline for the brain dump and 30 seconds for a per-section clip, without object storage. A per-section clip is transcribed into that section's "additional observations" field only; the caregiver then asks for a revision and reviews it like a typed one. The later five-minute, multi-call/streaming pipeline remains target work requiring provider verification. No real provider or cloud resource is needed for local/mock validation.

## Overview

Lomi ("lemon" in Amharic) is Guad's AI assistant. It drafts clinical documentation, transcribes voice, and summarizes daily status for supervisors.

Lomi is multi-modal. On the review screen, every input method feeds the same pipeline:

- **Voice brain dump** — caregiver speaks freely, Lomi drafts all sections at once
- **Per-box voice** — caregiver taps the mic on any section, speaks about that section
- **Per-box text** — caregiver types in any section box, Lomi rewrites into clinical language
- **Chat** — caregiver sends text or voice to Lomi in a bottom panel, Lomi routes content to the right sections
- **Direct edit** — caregiver types clinical language directly into any box, no AI involved

Lomi NEVER auto-submits notes, makes clinical decisions, or bypasses human review. Every AI-generated draft enters the workflow as `draft` status and requires explicit human signature before submission. AI output is always labeled as AI-generated in the UI (`lomi_drafted = true` on the `notes` table).

Lomi does not speak. All Lomi output is text on screen. No TTS, no voice synthesis. The only audio in the system is the caregiver's voice input flowing through Speech-to-Text.

## Architecture

### Initial Draft (brain dump → parallel pipeline → review screen)

```
Caregiver taps "Talk to Lomi" → records voice (≤5 min, 32 kbps)
  │
  ▼
POST /api/transcribe → Google Speech-to-Text (Chirp) → transcript
  │
  ▼
POST /api/lomi/draft → fan out to 4 parallel calls:
  ┌────────────┬────────────┬────────────┬──────────────┐
  │ Haiku      │ Haiku      │ Haiku      │ Sonnet       │
  │ classify   │ match      │ detect     │ draft        │
  │ sentences  │ goals      │ flags +    │ clinical     │
  │ → sections │ → trials   │ incidents  │ prose        │
  │ (~1s)      │ (~1.5s)    │ (~1s)      │ (~4s)        │
  └────────────┴────────────┴────────────┴──────────────┘
  │
  ▼
Merge classifier output + draft → review screen renders
```

Wall-clock: Speech-to-Text ~3s + max(parallel) ~4s + overhead ~0.5s = **~7-8s total**.

### Per-Box Editing (voice or text → single section rewrite)

```
Caregiver taps 🎤 on a section (or types in the box)
  │
  ├─ voice path: record → POST /api/transcribe → Speech-to-Text → text
  │                        (~2s)
  ├─ text path: input value used directly
  │
  ▼
POST /api/lomi/edit → Haiku rewrites that one section
  │                    (~1.5s)
  ▼
Section updates in-place
```

Wall-clock: voice path **~3.5s**, text path **~1.5s**.

### Chat Routing (voice or text → Haiku routes to sections)

```
Caregiver types in chat panel (or taps 🎤 in chat)
  │
  ├─ voice path: record → Speech-to-Text → text
  ├─ text path: message used directly
  │
  ▼
POST /api/lomi/route → Haiku identifies which sections to update
  │                     and what content maps where
  │                     (~2s)
  ▼
Each affected section updates in-place
```

### Offline Path (no network)

```
Voice unavailable → caregiver types in boxes directly
  │
  ▼
Local rules-based fallback (lomi.js) available for:
  - sentence classification (keyword matching)
  - vague language detection
  - incident pattern detection
  │
  ▼
Note enters workflow with { fallback: true }
  → caregiver edits, signs → PowerSync local DB → sync on reconnect
```

## HIPAA Compliance

### Business Associate Agreements

BAAs are required and must be executed before any PHI processing with:

| Subprocessor | Service | PHI Exposure |
|---|---|---|
| Google Cloud | Claude on Vertex AI | Caregiver transcript (health, behavior, meals, medications as spoken) + client first name + goal text |
| Google Cloud | Speech-to-Text | Voice recordings containing shift descriptions |
| Google Cloud | Cloud SQL, Identity Platform, Cloud Run | All stored PHI, transient request processing |
| AWS | SES, End User Messaging SMS | Shift times and home names only (never client names or health data) |

One Google Cloud BAA covers every row except the last. It covers only products on Google's HIPAA covered-products list, so confirm the Claude model and region before real data (infrastructure.md §8).

### PHI Minimization (Minimum Necessary Standard)

- **In prompts**: Guad adds only the client's **first name** and their goal text (and behavior plan types for behavior notes). It never adds last names, DOBs, IDs, the diagnoses list, medication lists or guardian information. The caregiver's transcript is sent as spoken, and it **is PHI**: it routinely describes health, behavior, meals and medications. That's why the Google Cloud BAA (Vertex AI and Speech-to-Text) must be in place before any real data reaches Lomi. Calling the minimization "first name only" would understate the exposure.
- **In transcripts**: Voice recordings may contain PHI spoken by the caregiver. Audio is sent inline to Speech-to-Text (never uploaded to Cloud Storage), with Speech-to-Text data logging left off, and is never persisted to disk, object storage, or any durable medium.
- **Transcript text**: Held in browser memory during the drafting session. Saved only as part of the final signed note content in the `notes.content` JSONB column, protected by RLS.
- **Chat messages**: Held in browser memory during the session. Not persisted independently. Content that Lomi routes into note sections is saved as part of the note, same as any edit.

### PHI Exclusion Zones

PHI must never appear in:

- Application error logs or monitoring (Cloud Logging, Error Reporting, console.log, console.error)
- URL parameters or query strings
- localStorage or sessionStorage (PowerSync OPFS is the sole permitted client-side PHI cache)
- Model training data (Vertex AI does not train on customer data; Vertex AI request/response logging and prompt caching across requests are left off)
- Prompt caching keys
- SMS message bodies (messages reference shift times and home names only)

### Audit Logging for AI Invocations

Every AI invocation is logged to the `audit_log` table with:

- `performed_by`: the authenticated user's profile ID
- `action`: `INSERT`
- `table_name`: `ai_invocations` (virtual; the audit entry itself)
- `new_values`: `{ task, model, token_count, request_id, latency_ms }`
- Prompt content is NOT logged. Only metadata for billing and compliance.

## Interaction Modes

### Mode 1: Voice Brain Dump

The primary charting path. Caregiver speaks freely about their shift — activities, meals, mood, goals, anything — in whatever order they want. Lomi processes the full transcript and populates all sections.

1. Caregiver taps the Lomi orb on the person detail screen
2. MediaRecorder captures audio (webm or mp4, `audioBitsPerSecond: 32000`, auto-stop at 5 minutes; 5 minutes is about 1.2 MB, under the request limit)
3. Audio sent to Speech-to-Text for transcription
4. Transcript sent to the parallel draft pipeline (§ Parallel Draft Pipeline)
5. Review screen renders with all sections populated

This mode handles the ~80% case: a straightforward shift where the caregiver remembers most things and speaks for 1-3 minutes. The 5-minute cap leaves room for longer shifts.

### Mode 2: Per-Box Editing

Every section on the review screen is a dual-input box — a text area for typing and a 🎤 button for speaking. Both produce the same result: Lomi rewrites the input into clinical language for that specific section.

**Voice**: Tap 🎤 → speak → Speech-to-Text transcribes → Haiku rewrites the section, merging with existing content.

**Text**: Type in the box → on blur or explicit "rewrite" tap → Haiku rewrites into clinical language.

**Direct edit**: If the caregiver writes clinical-quality text, no AI rewrite is needed. The text stays as-is.

Merge behavior:
- If the section is empty, Haiku writes fresh from the input.
- If the section has content, Haiku merges new information into existing text.
- If new input contradicts existing content, the new input wins.
- Each edit is cumulative — the section grows more detailed with each voice or text addition.

Undo: After any AI rewrite, "Undo" appears for 10 seconds. Tapping it restores the previous section content.

### Mode 3: Chat

A panel at the bottom of the review screen where the caregiver can send messages to Lomi — by typing or tapping 🎤. This is for corrections, additions, or answering Lomi's follow-up questions (§ Proactive Questions) in natural language.

The caregiver does not need to specify which section they're talking about. Lomi routes the content.

Examples:
- *"actually he didn't eat lunch, he refused"* → Lomi updates the meals section
- *"his mood was calm in the morning but got anxious around 2pm"* → Lomi updates the mood section
- *"he also had a verbal prompt on the teeth brushing goal"* → Lomi updates the relevant goal
- *"the activities were wrong, he didn't go to the park, he stayed home and watched TV"* → Lomi replaces the activities section

Multi-section input works: *"he skipped lunch and was in a bad mood all afternoon"* → Lomi updates meals AND mood.

Chat messages are ephemeral — held in browser memory for the session, not persisted to the database. The resulting note content (in the section boxes) is what gets saved.

### Mode 4: Direct Text Edit

The caregiver can edit any section box directly — select text, type over it, add to it. No AI involvement. This always works, including offline.

### How They Compose

All four modes work together on the same note:

1. Voice brain dump fills in most sections (Mode 1)
2. Lomi asks about empty sections (§ Proactive Questions)
3. Caregiver taps 🎤 on the mood box and adds detail (Mode 2)
4. Caregiver types in chat: *"actually he also had a seizure around 3pm"* (Mode 3)
5. Caregiver directly edits the health section to fix a typo (Mode 4)
6. Caregiver signs

No mode is privileged. The caregiver uses whatever is fastest for their situation — quiet room, noisy room, one-handed, sitting at a desk.

## Proactive Questions

After the initial draft renders, Lomi examines the result for gaps. For each empty or thin section, Lomi displays a question in the chat panel and next to the empty box.

Questions are specific, not generic:

| Condition | Question |
|---|---|
| `mood === ""` | What was {person}'s mood today? |
| `meals === ""` | Did {person} eat their meals? |
| `health === ""` | Any health observations — vitals, medications, concerns? |
| `activities` is under 20 chars | Can you tell me more about what {person} did today? |
| A goal has empty `trials` | How did {person} do on {goal.text}? |
| `flags` array is non-empty | You said {person} "was fine" — what did that look like? |

Questions appear as Lomi chat messages. The caregiver responds by typing, speaking into the chat mic, or tapping 🎤 on the specific section box. All three paths update the section.

Lomi asks about at most 3 missing sections at a time to avoid overwhelming the screen. If there are more gaps, additional questions appear as earlier ones are addressed.

Questions are generated client-side from the draft output — no additional API call. The logic checks for empty strings and short content against a minimum character threshold per section type.

## Parallel Draft Pipeline

The initial draft (Mode 1) fans out across four parallel model calls after transcription. This replaces the single Sonnet call in the MVP.

### Why Parallel

A single Sonnet call doing classification, goal matching, flag detection, and prose drafting takes ~6-8s and handles all tasks at average quality. Splitting the work:

- Lets Haiku handle structured tasks it excels at (classification, pattern matching) for $0.001 instead of burning Sonnet tokens
- Keeps total wall-clock the same (~4s, gated by Sonnet) while adding classifier accuracy
- Makes each prompt shorter and more focused — better adherence to output schemas

### Pipeline Tasks

**1. Sentence Classifier (Haiku)**

Maps each sentence in the transcript to a section: `activities`, `meals`, `mood`, `health`, or `unclassified`. This pre-classification feeds into the Sonnet drafter as structured input rather than making Sonnet do both classification and prose generation.

Input: `{ sentences: string[] }`
Output: `{ classified: Array<{ sentence: string, section: string }> }`

**2. Goal Matcher (Haiku)**

Takes the transcript and the person's goal list. For each goal, identifies whether it was mentioned and what prompt level the caregiver described.

Input: `{ transcript: string, goals: Array<{ id, area, text, steps }> }`
Output: `{ goals: Array<{ id, trials: string[], notAttempted: boolean, reason: string }> }`

**3. Flag and Incident Detector (Haiku)**

Scans for vague language, incident triggers, and completeness gaps. This runs in parallel with — not after — the drafter, so flags are ready the moment the draft renders.

Input: `{ transcript: string }`
Output: `{ flags: Array<{ phrase, tip }>, incident: { detected, summary }, gaps: string[] }`

**4. Clinical Prose Drafter (Sonnet)**

The main drafting call. Takes the full transcript and writes professional clinical prose for each section. It runs in parallel with the Haiku calls, so it does **not** receive their output; the classifier's sentence-to-section map is used only by the fallback and by `route`.

Input: `{ transcript: string, person: string }`
Output: `{ activities: string, meals: string, mood: string, health: string }`

### Result Merge

The server merges the four outputs into a single response:

```typescript
{
  activities: string,    // from Sonnet drafter
  meals: string,
  mood: string,
  health: string,
  goals: Array<{         // from Haiku goal matcher
    id: string,
    trials: string[],
    notAttempted: boolean,
    reason: string
  }>,
  flags: Array<{         // from Haiku detector
    phrase: string,
    tip: string
  }>,
  incident: {            // from Haiku detector
    detected: boolean,
    summary: string
  }
}
```

If a Haiku call fails, the Sonnet drafter's output is used alone. The flag/incident detector then falls back to the rules in `lomi.js`, and goals are left for the caregiver to score. The Haiku calls are optimizations, not hard dependencies.

**Keeping goals and prose consistent:** goal trials come only from the goal matcher, and the drafter is told not to restate prompt levels or goal outcomes in the prose sections. Otherwise the prose could say "he refused" while the trials say "Independent", and the caregiver might sign both. The review screen shows the matcher's trials in the goal picker, where the caregiver confirms them.

## Task Specifications

### Task: shift (initial draft)

**Input:**
```typescript
{
  task: "shift",
  person: string,         // client first name only
  text: string,           // caregiver's transcript
  goals: Array<{
    id: string,
    area: string,
    text: string,
    steps: string[]
  }>
}
```

**Output:**
```typescript
{
  activities: string,
  meals: string,
  mood: string,
  health: string,
  goals: Array<{
    id: string,
    trials: string[],     // each entry is one of LEVELS
    notAttempted: boolean,
    reason: string
  }>,
  flags: Array<{
    phrase: string,
    tip: string
  }>,
  incident: {
    detected: boolean,
    summary: string
  }
}
```

**Prompt rules** (from `prompts.js`):

- Use only facts the caregiver stated. Never add details, times, causes, or names they did not say.
- Third person, past tense, plain professional English, short sentences.
- Empty string `""` for any section with nothing stated.
- Vague or judgmental wording (e.g., "was fine", "acted out") is kept verbatim in the note and listed in `flags` with a one-sentence tip. Lomi does not invent replacements.
- Goal mapping: one entry per goal, same ID. `trials` lists one prompt level per attempt described, each exactly one of: `["Independent", "Verbal prompt", "Gestural prompt", "Model", "Partial physical", "Full physical", "Refused"]`. "Reminder" maps to "Verbal prompt"; "did it alone" maps to "Independent". If a goal was not mentioned, `trials` is `[]`. `notAttempted` is `true` only if the caregiver explicitly said it was not done.
- Incident detection triggers on: falls, slips, injuries, seizures, medication errors, the person leaving without staff, aggression that caused harm, emergency or medical care.

### Task: behavior (behavior note draft)

**Input:**
```typescript
{
  task: "behavior",
  person: string,
  text: string,
  behaviors: string[]     // agency's defined behavior types
}
```

**Output:**
```typescript
{
  before: string,         // antecedent
  behaviorType: string,   // closest match from behaviors[] or "Other"
  behavior: string,
  response: string,
  outcome: string,
  duration: string,
  flags: Array<{ phrase: string, tip: string }>,
  incident: {
    detected: boolean,
    summary: string
  }
}
```

ABC format (Antecedent-Behavior-Consequence) compatible with Therap GER when `charting_preset = "therap"`. The schema and API output are identical regardless of preset; only UI labels change.

### Task: summary (supervisor daily summary)

**Input:**
```typescript
{
  task: "summary",
  data: DaySnapshot       // aggregated shift data for one day
}
```

**Output:**
```typescript
{
  summary: string,
  highlights: Array<{ text: string }>,
  recommendations: Array<{ text: string }>,
  fallback: boolean
}
```

When the caller's agency lacks `analytics_advanced`, `highlights` and `recommendations` are returned as empty arrays (Professional tier). Complete tier gets populated arrays.

**Priority order:** incidents > health alerts > refused/held medications > open shifts > missing notes > notes to review.

No headings, no bullet symbols, no markdown. Written as if briefing a supervisor walking in.

### Task: section_edit (per-box rewrite)

Used by Mode 2 (per-box editing) and when Lomi processes chat input that targets a single section.

**Input:**
```typescript
{
  task: "section_edit",
  section: string,         // "activities" | "meals" | "mood" | "health"
  current: string,         // existing section text (may be "")
  input: string,           // caregiver's new text (from Speech-to-Text or typed)
  person: string           // client first name
}
```

**Output:**
```typescript
{
  text: string             // updated section content
}
```

**Prompt:**

```
You are editing one section of a clinical shift note for {person}.

Section: {section}
Current text: "{current}"
Caregiver's input: "{input}"

Rules:
- Merge the input into the current text. If current is empty, write fresh.
- If the input contradicts the current text, use the input.
- Third person, past tense, professional clinical English.
- Use only facts from the input. Never add details not stated.
- Return only the updated section text. No JSON wrapping.
```

Model: Haiku. Latency target: 1.5s.

### Task: route (chat message routing)

Used by Mode 3 (chat interface). Haiku reads the caregiver's chat message and determines which section(s) it applies to, with the relevant content extracted per section.

**Input:**
```typescript
{
  task: "route",
  message: string,         // caregiver's chat message (from Speech-to-Text or typed)
  person: string,
  current: {               // current state of all sections
    activities: string,
    meals: string,
    mood: string,
    health: string,
    goals: Array<{ id: string, text: string, trials: string[] }>
  }
}
```

**Output:**
```typescript
{
  updates: Array<{
    section: string,       // which section to update
    action: "merge" | "replace",
    content: string        // the relevant content from the message for this section
  }>,
  goal_updates: Array<{
    id: string,
    trials: string[],
    notAttempted: boolean,
    reason: string
  }>,
  unroutable: string       // anything in the message that doesn't map to a section
}
```

**Prompt:**

```
You are Lomi, routing a caregiver's message to the correct sections of a shift note for {person}.

Current note state:
- Activities: "{current.activities}"
- Meals: "{current.meals}"
- Mood: "{current.mood}"
- Health: "{current.health}"
- Goals: {JSON of current goals}

Caregiver said: "{message}"

Determine which section(s) this message applies to. A single message may update
multiple sections. Extract only the content relevant to each section.

Use "replace" when the caregiver is correcting what's there. Use "merge" when
they're adding information.

Return JSON: {"updates":[{"section":"...","action":"merge|replace","content":"..."}],
"goal_updates":[{"id":"...","trials":[],"notAttempted":false,"reason":""}],
"unroutable":""}
```

After routing, the server calls `section_edit` for each entry in `updates` to rewrite the content into clinical prose before sending it to the client. This is a sequential fan-out: one Haiku call for routing, then N parallel Haiku calls for rewrites (where N = number of affected sections, typically 1-2).

Model: Haiku for routing, Haiku for each section rewrite. Latency target: 2s for routing + 1.5s for rewrites = **~3.5s total** for a chat message.

## Fallback Strategy

When AI is unavailable (offline, API error, rate limited, network timeout), the client-side `lomi.js` module provides rules-based processing. The response includes `{ fallback: true }` so the UI can warn the caregiver.

### Rules-Based Sentence Classification (shift notes)

Sentences (split on `.!?`) are classified into sections by keyword matching:

| Section | Keywords |
|---|---|
| meals | ate, lunch, dinner, breakfast, snack, food, drank, meal |
| health | INC pattern match, med*, pain, sick, doctor, nurse, temperature |
| mood | mood, happy, upset, fine, calm, smil*, angry, sad, laugh*, anxious, yell* |
| activities | everything else (default bucket) |

### Vague Language Detection

String matching against a hardcoded list:

```
"was fine", "was good", "was normal", "was bad", "acted out",
"had an attitude", "had a bad attitude", "behaved", "was difficult",
"was a handful"
```

Each match produces a flag: `{ phrase: "<match>", tip: "\"<match>\" is too vague for the record. Describe what you saw or heard." }`

### Incident Detection

Regex pattern matching:

```
/\b(fell|fall|slipped|slip|tripped|hurt|injur\w*|bleed\w*|bruise\w*|
hospital|911|emergency|wrong med\w*|missed (his|her|their) med\w*|
ran off|left the house|eloped|seizure)\b/i
```

When matched, `incident.detected = true` and `incident.summary` contains the first sentence that triggered the match.

### Behavior Note Fallback

Returns the entire transcript as the `behavior` field with empty strings for all other fields. Flags and incident detection still run.

### Summary Fallback

Returns `{ text: "", fallback: true }`. The UI shows the raw data view instead of a narrative summary.

### Fallback Behavior Per Mode

| Mode | Online | Offline |
|---|---|---|
| Voice brain dump | Full pipeline | Voice unavailable (no Speech-to-Text). Caregiver types, rules-based classification runs. |
| Per-box voice | Speech-to-Text + Haiku rewrite | Mic button disabled. Text input works. No AI rewrite — text stays as typed. |
| Per-box text | Haiku rewrite | No AI rewrite. Text stays as typed. |
| Chat voice | Speech-to-Text + Haiku route + rewrite | Mic disabled. Text chat available without AI routing — caregiver must edit boxes directly. |
| Chat text | Haiku route + rewrite | Chat disabled. Direct box editing only. |
| Direct edit | No AI | Works normally. |

The UI communicates mode availability clearly. Disabled mic buttons show a crossed-out icon, not a hidden element. The text "Lomi is offline — you can type directly" appears in the chat panel when the network is down.

## Model Configuration

| Task | Provider | Model | Max Tokens | Temperature | Latency Target |
|---|---|---|---|---|---|
| Draft (shift) | Vertex AI | Claude Sonnet (latest) | 1200 | 0.3 | < 4s |
| Draft (behavior) | Vertex AI | Claude Sonnet (latest) | 1200 | 0.3 | < 4s |
| Sentence classifier | Vertex AI | Claude Haiku 4.5 | 600 | 0.1 | < 1s |
| Goal matcher | Vertex AI | Claude Haiku 4.5 | 400 | 0.1 | < 1.5s |
| Flag/incident detector | Vertex AI | Claude Haiku 4.5 | 400 | 0.1 | < 1s |
| Section edit | Vertex AI | Claude Haiku 4.5 | 400 | 0.2 | < 1.5s |
| Chat routing | Vertex AI | Claude Haiku 4.5 | 600 | 0.1 | < 2s |
| Summary | Vertex AI | Claude Haiku 4.5 | 400 | 0.2 | < 3s |
| Transcription | Google Cloud | Speech-to-Text v2, Chirp model | N/A | N/A | < 3s (verify, see below) |

**Current MVP implementation note:** The working MVP at `/api/lomi.js` calls the Anthropic Messages API directly (model configurable via `LOMI_MODEL` env var, defaulting to `claude-sonnet-5-5`). The production system will call Claude on Vertex AI (`@anthropic-ai/vertex-sdk`, same Messages API shape) under the Google Cloud BAA. The prompt interface (`prompts.js`) remains identical — only the transport layer changes.

**Current MVP transcription note:** The working MVP at `/api/transcribe.js` calls the OpenAI API directly (`whisper-1` model). The production system will use Google Speech-to-Text under the Google Cloud BAA.

Models are upgradeable without prompt changes. The server abstracts model identity behind environment variables and a provider interface.

### Model Selection Rationale

**Sonnet for drafting:** Writing clinical prose from a raw transcript is the hardest task in the pipeline. It requires understanding context, inferring structure, and generating professional language. Sonnet's quality-to-speed ratio is the best fit — Haiku produces noticeably worse prose for clinical documentation, and Opus is too slow for an interactive workflow.

**Haiku for everything else:** Classification, goal matching, flag detection, section editing, and chat routing are structured tasks with constrained outputs. Haiku handles them well at ~$1/MTok input, and its speed (sub-2s) keeps per-box interactions responsive.

**Speech-to-Text (Chirp) for transcription:** Keeps audio inside the same cloud and BAA as everything else. Chirp is Google's large speech model, with accuracy close to Whisper for conversational English. Model adaptation (phrase hints) is used for IDD vocabulary: prompt levels, "ISP", "elopement", common medication names. Batch transcription of the complete recording keeps full context, which matters for these terms.

**To verify in the first spike:**
- Synchronous `Recognize` accepts at most 60 seconds of audio. Brain dumps can run to 5 minutes, so the server either splits the recording at pauses (≤55 s chunks, transcribed in parallel and joined) or uses streaming recognition. Measure which meets the 3 s target.
- Word error rate on 20 synthetic shift recordings with IDD vocabulary, compared with the MVP's Whisper output.
- If Chirp misses the bar, Azure OpenAI Whisper is the fallback. It would add a second BAA (Microsoft's, included in its Product Terms).

## Server-Side Implementation

### Endpoint: POST /api/lomi/draft

Replaces the MVP's `POST /api/lomi` for shift and behavior notes. Orchestrates the parallel pipeline.

**Request:**
```typescript
{
  task: "shift" | "behavior",
  person: string,
  text: string,
  goals?: Array<{ id, area, text, steps }>,  // shift only
  behaviors?: string[]                        // behavior only
}
```

**Response:**
```typescript
{
  data: ShiftDraftOutput | BehaviorDraftOutput,
  fallback: false,
  timing: {
    stt_ms: number,
    classify_ms: number,
    goals_ms: number,
    detect_ms: number,
    draft_ms: number,
    total_ms: number
  }
}
```

The `timing` object is for monitoring only — the client renders as soon as `data` arrives.

**Validation:**
- `task` must be `"shift"` or `"behavior"`
- Total request body must not exceed 8000 characters
- Caller must be authenticated (Identity Platform session cookie)
- `person` required, non-empty, max 50 chars
- `text` required, non-empty

**Error responses:** 400 (bad input), 401 (not authenticated), 413 (too large), 429 (rate limited), 502 (upstream error).

### Endpoint: POST /api/lomi/edit

Handles per-box section rewrites.

**Request:**
```typescript
{
  section: "activities" | "meals" | "mood" | "health",
  current: string,
  input: string,
  person: string
}
```

**Response:**
```typescript
{
  text: string,
  timing: { haiku_ms: number }
}
```

### Endpoint: POST /api/lomi/route

Handles chat message routing and section updates.

**Request:**
```typescript
{
  message: string,
  person: string,
  current: {
    activities: string,
    meals: string,
    mood: string,
    health: string,
    goals: Array<{ id, text, trials }>
  }
}
```

**Response:**
```typescript
{
  updates: Array<{
    section: string,
    text: string           // already rewritten into clinical prose
  }>,
  goal_updates: Array<{
    id: string,
    trials: string[],
    notAttempted: boolean,
    reason: string
  }>,
  unroutable: string,
  timing: { route_ms: number, rewrite_ms: number, total_ms: number }
}
```

The server handles the two-step process (route → rewrite) internally. The client receives final rewritten text, not raw routing output.

### Endpoint: POST /api/lomi/summary

**Request:** `{ task: "summary", data: DaySnapshot }`
**Response:** `{ summary: string, highlights: Array<{ text: string }>, recommendations: Array<{ text: string }>, fallback: boolean }` (highlights and recommendations are empty arrays unless the agency has `analytics_advanced`; see Task: summary above)

### Endpoint: POST /api/transcribe

Unchanged from MVP.

**Request:** `{ audio: string (base64), mimeType: string }`
**Response:** `{ text: string }`

**Validation:**
- `audio` must be a non-empty base64 string, max 3,500,000 characters (~2.6 MB decoded; 5 minutes at 32 kbps is ~1.2 MB)
- `mimeType` must start with `audio/`; defaults to `audio/webm` if missing
- Supported formats: `audio/webm`, `audio/mp4`

### Prompt Module: prompts.js

Universal module (UMD pattern) that works in both browser and Node.js. Exports:
- `LEVELS`: Array of 7 prompt-level strings
- `build.shift(payload)`: Returns the full prompt string for shift note drafting
- `build.behavior(payload)`: Returns the full prompt string for behavior note drafting
- `build.summary(payload)`: Returns the full prompt string for supervisor summary

The production system extends this module with:
- `build.classify(payload)`: Sentence classification prompt
- `build.matchGoals(payload)`: Goal matching prompt
- `build.detect(payload)`: Flag and incident detection prompt
- `build.sectionEdit(payload)`: Per-section rewrite prompt
- `build.route(payload)`: Chat routing prompt

## Rate Limiting

Rate limits enforced at the server level by `rateLimitMiddleware`, counting AI invocations per profile and per agency from `audit_log` (trpc-router.md).

| Scope | Limit | Window | Enforcement |
|---|---|---|---|
| Per user: drafts | 10 | 1 hour | Count per `profile_id` |
| Per user: transcriptions | 20 | 1 hour | Count per `profile_id` |
| Per user: section edits | 60 | 1 hour | Count per `profile_id` |
| Per user: chat routes | 30 | 1 hour | Count per `profile_id` |
| Per agency: all AI calls | 500 | 1 hour | Count per `agency_id` |
| Audio file size | 3.5 MB (base64) | per request | Request validation |
| Audio duration (brain dump) | 5 minutes | per request | Client auto-stops; server rejects longer audio |
| Per-box audio duration | 30 seconds | per request | Client-side enforcement |
| Input text | 8000 chars | per request | Request validation |
| Chat message | 2000 chars | per message | Request validation |

Section edits and chat routes have higher per-user limits than drafts because they're smaller, cheaper calls that the caregiver uses iteratively.

When rate-limited, the server returns `429 Too Many Requests` with a `Retry-After` header. The client falls back to direct text editing for section edits and chat, or rules-based processing for drafts.

## Quality Monitoring

| Metric | Description | Target |
|---|---|---|
| Send-back rate | % of Lomi-drafted notes returned by supervisor | < 10% |
| Edit distance | Character-level diff between Lomi draft and signed version | Trending downward |
| Sections edited after draft | Average number of sections the caregiver modifies post-draft | Trending downward |
| Mode usage distribution | % of edits via voice / text / chat / direct | Track (no target) |
| Flag hit rate | % of flags that caregivers act on vs. dismiss | Informs prompt tuning |
| Incident detection recall | Incidents detected by Lomi vs. incidents filed manually | > 90% |
| Transcription accuracy | Periodic manual spot-check of Speech-to-Text output | Sample 1% monthly |
| Draft latency (P50) | Time from request to rendered draft | < 4s |
| Draft latency (P95) | Time from request to rendered draft | < 7s |
| Section edit latency (P50) | Time from input to updated section | < 1.5s |
| Section edit latency (P95) | Time from input to updated section | < 3s |
| Chat route latency (P50) | Time from message to all sections updated | < 3s |
| Chat route latency (P95) | Time from message to all sections updated | < 5s |
| Transcription latency (P50) | Time from upload to returned text | < 2s |
| Transcription latency (P95) | Time from upload to returned text | < 4s |
| Fallback rate | % of draft requests handled by rules-based fallback | < 2% |
| Cost per note | Total AI cost (draft + edits + routes) per completed note | Track |
| Proactive question response rate | % of Lomi questions that get a caregiver response | Track |

### Quality Feedback Loop

1. Supervisors approve or return notes (natural quality signal)
2. Returned notes with `lomi_drafted = true` are aggregated weekly
3. Common return reasons inform prompt adjustments
4. Edit distance between draft and signed version identifies systematic gaps
5. Sections most frequently edited post-draft identify where the pipeline is weakest
6. Mode usage data shows whether caregivers prefer voice, text, or chat for corrections

## Cost Projections

### Per-Note Cost Breakdown

| Component | Calls | Cost per call | Total |
|---|---|---|---|
| Speech-to-Text (60s recording) | 1 | ~$0.016 | $0.016 |
| Sonnet (draft) | 1 | ~$0.005 | $0.005 |
| Haiku (classifier + goals + detector) | 3 | ~$0.0003 | $0.001 |
| Haiku (section edits, avg 1.5 per note) | 1.5 | ~$0.0003 | $0.0005 |
| Haiku (chat routes, avg 0.5 per note) | 0.5 | ~$0.001 | $0.0005 |
| **Total per note** | | | **~$0.023** |

### Monthly Cost by Agency Size

| Agency Size | Caregivers | Notes/Month | AI Cost/Month |
|---|---|---|---|
| Small | 10 | ~900 | ~$21 |
| Medium | 30 | ~2,700 | ~$62 |
| Large | 100 | ~9,000 | ~$207 |

These costs are compatible with all subscription tiers. For context, Therap charges $15-25/user/month — Guad's entire AI cost per user is about $2/month. Speech-to-Text is the largest part; Google's list price is ~$0.016/min (check current pricing).

## Security Considerations

### Input Sanitization

- Transcript text is passed to the model as a quoted string within the prompt. No template injection is possible because the prompt structure is hardcoded in `prompts.js` and the transcript is treated as a data value, not an instruction.
- JSON output from the model is parsed with `JSON.parse` wrapped in try/catch. Malformed output triggers the rules-based fallback.
- The client strips markdown code fences from model output before parsing (handles models that wrap JSON in triple backticks).
- Chat messages are treated identically to transcripts — quoted data values within fixed prompt templates.

### Model Output Validation

The client validates that the parsed JSON matches the expected shape before rendering. Missing fields are filled with safe defaults (empty strings, empty arrays, `false` for booleans). Unexpected fields are ignored.

### No Prompt Injection Surface

- Users do not have direct access to modify prompts. The transcript and chat messages are the only user-controlled inputs, and they are embedded as quoted data values within fixed prompt templates.
- The model is instructed to "use only facts the caregiver stated" and "never add details," which limits hallucination risk.
- Output is structured JSON, not executable code.
- Chat routing output is validated against known section names — a prompt injection that tries to route to a non-existent section is dropped.

## Migration Path: MVP to Production

| Component | MVP (current) | Production |
|---|---|---|
| Note drafting | Anthropic Messages API direct, single Sonnet call | Claude on Vertex AI, parallel pipeline (3 Haiku + 1 Sonnet) |
| Section editing | Not implemented | POST /api/lomi/edit (Haiku) |
| Chat routing | Not implemented | POST /api/lomi/route (Haiku) |
| Transcription | OpenAI Whisper API direct | Google Speech-to-Text, Chirp (BAA) |
| Authentication | None; same-site check + per-IP rate limit (`api/_guard.js`) | Identity Platform session cookie verification |
| Rate limiting | Per-IP limit in `api/_guard.js` | Per-user, per-agency, per-task counts from `audit_log` |
| Audit logging | None | Every invocation logged to `audit_log` |
| Error handling | Generic 502 | Structured error codes, retry guidance |
| Hosting | Vercel serverless functions | SvelteKit server routes (tRPC) on Cloud Run |
| Proactive questions | Not implemented | Client-side gap detection from draft output |

The `prompts.js` module carries forward and is extended with new prompt builders. The `lomi.js` client module's rules-based fallback carries forward unchanged.

## Review Screen Layout

Reference layout for the multi-modal review screen. Every section box has a text area and a mic button. The chat panel sits at the bottom.

```
┌──────────────────────────────────────┐
│ Shift Note — James                   │
│ AM Shift · Elm Street Home · Today   │
├──────────────────────────────────────┤
│                                      │
│ Activities                       🎤  │
│ ┌──────────────────────────────────┐ │
│ │ James attended day program and   │ │
│ │ participated in art class. He    │ │
│ │ walked to the corner store with  │ │
│ │ staff in the afternoon.          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Meals                            🎤  │
│ ┌──────────────────────────────────┐ │
│ │ James ate breakfast (oatmeal,    │ │
│ │ juice). He ate all of his lunch  │ │
│ │ (turkey sandwich, chips, water). │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Mood                             🎤  │
│ ┌──────────────────────────────────┐ │
│ │ James was calm and engaged for   │ │
│ │ most of the shift. He became     │ │
│ │ anxious around 2pm, pacing in    │ │
│ │ the hallway for ~10 minutes.     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Health                           🎤  │
│ ┌──────────────────────────────────┐ │
│ │ No health concerns reported.     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ── Goals ──                          │
│                                      │
│ 🎯 Brush teeth independently    🎤  │
│ ┌──────────────────────────────────┐ │
│ │ Trials: Verbal prompt,           │ │
│ │ Verbal prompt, Independent       │ │
│ └──────────────────────────────────┘ │
│                                      │
│ 🎯 Make bed                     🎤  │
│ ┌──────────────────────────────────┐ │
│ │ Trials: (none recorded)          │ │
│ │ ⚠ How did James do on this?      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ── Flags ──                          │
│ ⚡ "was fine" — too vague for the    │
│    record. Describe what you saw.    │
│                                      │
│ ── Lomi ─────────────────────────    │
│ 💬 You mentioned James "was fine"    │
│    — what did that look like?        │
│ 💬 How did James do on "Make bed"?   │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Type a message...            🎤  │ │
│ └──────────────────────────────────┘ │
│                                      │
│           [ Sign & Submit ]          │
└──────────────────────────────────────┘
```

### Mic Button States (per box and chat)

| State | Visual | Behavior |
|---|---|---|
| Idle | Gray mic icon | Tap to start recording |
| Recording | Red pulsing mic, section border turns lemon (#FFE066), timer shows | Tap again or auto-stop after 3s silence |
| Processing | Spinner replaces mic, "Updating..." text | Speech-to-Text → Haiku running |
| Updated | Section flashes lemon briefly, new text appears | Diff highlight fades after 2s |
| Error | Red mic icon, "Couldn't update — try again or type" | Next tap retries |
| Offline | Crossed-out mic, muted color | Not tappable. Text input remains available. |

## Future Considerations (not in MVP)

- **Streaming responses**: Server-sent events for the Sonnet draft call so sections appear progressively (~2s to first section instead of ~4s to all)
- **Prompt tuning per agency**: Custom vocabulary, abbreviations, and documentation styles stored in `agencies.settings` JSONB
- **Multi-language support**: Spanish transcription and note drafting for diverse staff teams
- **Smart scheduling suggestions**: Lomi recommends coverage candidates based on historical patterns
- **Anomaly detection in charting**: Identify sudden changes in goal data trends or documentation gaps
- **Batch summarization**: End-of-day summary across all homes for agency-level supervisors
- **Chat memory across sessions**: Lomi remembers common patterns for a caregiver (e.g., "this caregiver always forgets meals") and asks proactively
