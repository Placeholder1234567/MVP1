# AI Voice Architecture Analysis — Lomi

> **Decision document.** Compares two architectures for Lomi's voice-to-documentation pipeline.
> Read this before expanding `ai-pipeline.md` or implementing the AI layer.

## The Question

How should Lomi turn a caregiver's spoken shift description into a structured clinical note?

**Architecture A — Batch Pipeline:** Record voice → Speech-to-Text transcription → parallel Claude calls → structured draft → review screen.

**Architecture B — Real-Time Voice Agent:** Conversational AI (ElevenLabs / Vapi / Retell / LiveKit+Deepgram) conducts a guided interview, filling sections as the caregiver speaks.

The user's stated priority: **quality and speed are #1** — most accurate output, as fast as possible.

---

## Architecture A: Batch Pipeline (Extended)

This is the current MVP approach, extended with parallelism and per-section editing.

### How It Works

```
Caregiver taps "Talk to Lomi"
  → records voice (MediaRecorder, webm/mp4, ≤5 min at 32 kbps)
  → POST /api/transcribe → Google Speech-to-Text (Chirp) → transcript text
  → client builds prompt (prompts.js)
  → POST /api/lomi → Claude on Vertex AI → structured JSON
  → Review screen renders sections (activities, meals, mood, health, goals, flags, incidents)
  → Caregiver edits, signs
```

### Extended: Parallel Pipeline (New)

Instead of a single Sonnet call doing everything, split into parallel tasks:

```
Speech-to-Text transcript (one call, ~3s)
       ↓
  ┌────┼────────┬──────────────┐
  ↓    ↓        ↓              ↓
Haiku  Haiku    Haiku        Sonnet
classify  match goals  detect issues  draft sections
(~1s)    (~1.5s)      (~1s)         (~4s)
  └────┴────────┴──────────────┘
       ↓
  Merge results → Review screen
```

**Total wall-clock: ~7-8s** (Speech-to-Text 3s + max(parallel calls) 4s + overhead 0.5s)

The Haiku calls are fast classifiers:
- **Classify:** Sentence → section mapping (activities/meals/mood/health)
- **Match goals:** Transcript × goal list → prompt-level trials per goal
- **Detect issues:** Flag vague language, detect incidents, check completeness

Sonnet handles the harder task: drafting professional clinical prose from raw speech.

### Extended: Per-Section Voice Editing (New)

On the review screen, each section box gets a mic button:

```
┌─────────────────────────────────┐
│ Activities                   🎤 │
│ "John participated in a        │
│ community outing to the park..." │
│                                 │
│ [Edit text]                     │
└─────────────────────────────────┘
```

When the caregiver taps 🎤 on a specific section:
1. Records a short voice clip (≤30s)
2. Speech-to-Text transcribes it (~2s)
3. Haiku rewrites just that section, merging the new information with the existing draft (~1.5s)
4. Section updates in-place, highlighted briefly to show what changed

**Prompt for per-section edit (Haiku):**
```
You are editing one section of a clinical shift note.
Current section ({sectionName}): "{currentText}"
Caregiver's additional input: "{newTranscript}"
Merge the new information into the existing section. Keep the same
professional tone. If the new input contradicts the old, use the new.
Return only the updated section text, nothing else.
```

**Total per-edit: ~3.5s** (record stop + Speech-to-Text 2s + Haiku 1.5s)

---

## Architecture B: Real-Time Voice Agent

A conversational AI that conducts a structured interview.

### How It Works

```
Caregiver taps "Talk to Lomi"
  → WebSocket/WebRTC connection to voice platform
  → Lomi speaks: "Hi! Tell me about your shift with John."
  → Caregiver speaks naturally
  → Real-time STT processes speech as it arrives
  → LLM processes transcript, determines next question
  → TTS speaks follow-up: "Got it. Did John work on any goals today?"
  → Sections fill progressively on screen as conversation flows
  → When all sections covered, Lomi: "I think we're done. Take a look."
  → Review screen (pre-filled, same as Architecture A)
```

### Platform Options

| Platform | STT | LLM | TTS | Latency | HIPAA BAA | Pricing |
|----------|-----|-----|-----|---------|-----------|---------|
| **ElevenLabs Conversational AI** | Deepgram/custom | Claude/GPT/custom | ElevenLabs | ~800ms turn | Available | $0.10-0.35/min |
| **Vapi** | Deepgram | Claude/GPT | Various | ~700ms turn | Available | $0.05/min + provider costs |
| **Retell AI** | Deepgram | Claude/GPT | ElevenLabs/11Labs | ~800ms turn | Available (Enterprise) | $0.07-0.18/min |
| **LiveKit + Deepgram** | Deepgram | Self-hosted Claude | Various | ~500ms turn | Self-hosted = you control | Infrastructure costs |
| **OpenAI Realtime API** | Built-in | GPT-4o-realtime | Built-in | ~300ms turn | BAA available | $0.06/min audio + tokens |

### Conversation Flow Design

```
Turn 1: "Hi! Tell me about your shift with {person}. What did you all do today?"
  → fills: activities
Turn 2: "Thanks. What about meals — did {person} eat well?"
  → fills: meals
Turn 3: "How was their mood today?"
  → fills: mood
Turn 4: "Any health observations? Vitals, medications, anything like that?"
  → fills: health
Turn 5: "Let's go through goals. [For each goal]: How did {goal.text} go?"
  → fills: goals with prompt levels
Turn 6 (if flags detected): "You mentioned {person} 'was fine' — can you describe what that looked like specifically?"
  → improves: flagged sections
Turn 7: "Anything else I should note? Any incidents?"
  → fills: incident detection
Close: "All done! Your note is ready for review."
```

---

## Dimension-by-Dimension Comparison

### 1. Quality (Accuracy of Clinical Documentation)

**Architecture A wins.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| Transcription accuracy | Batch STT on the full recording (Whisper v3 or Google Chirp; Whisper-class accuracy, ~95-97% accuracy on conversational English) | Deepgram (optimized for speed, ~93-95% WER) or platform STT |
| Clinical reasoning | Full transcript available → Sonnet sees everything at once, reasons holistically | Incremental — LLM sees partial transcript per turn, must reason in real-time |
| Prompt control | Exact, tested prompts (prompts.js) with JSON schema enforcement | Conversational system prompt — harder to guarantee structured output |
| Hallucination risk | Low: Sonnet gets the full narrative, instruction says "use only facts stated" | Higher: turn-by-turn processing means the model may infer connections between partial statements |
| Prompt level mapping | Haiku classifies from complete context → better accuracy | Real-time → may miss a goal reference spoken 3 turns ago |
| Consistency | Same prompt, same model, deterministic pipeline | Varies with conversation flow — caregiver may go off-script |

**Why this matters for IDD documentation:** Clinical notes are legal records. A note that says a client "completed" a goal when the caregiver said "we tried but he refused" is a compliance violation. Batch processing with full context produces more accurate clinical mappings.

**Per-section voice editing closes the gap further.** The main quality argument for B is "the agent asks follow-up questions to get specifics." But per-section editing achieves the same outcome: after Lomi drafts, the caregiver can tap 🎤 on the "mood" box and say "actually what I meant was he was calm in the morning but got agitated around 2pm when the new staff came." Haiku rewrites just that section. Same specificity, without the real-time complexity.

### 2. Speed (Time to Completed Note)

**Architecture A wins for short notes. Architecture B wins for complex cases — but A+editing matches it.**

| Metric | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| Simple shift note | ~8s (record 30s + transcribe 3s + draft 4s + render 1s) | ~3-5 min (guided conversation with 5-7 turns) |
| Complex note (many goals) | ~10s pipeline + 30-60s manual editing | ~5-8 min (agent asks about each goal) |
| Per-section edits | +3.5s per section edited | N/A (done during conversation) |
| Perceived speed | Fast: speak freely → wait briefly → review | Slow: answer questions one by one, wait for each response |

**The speed math for IDD caregivers:** A DSP documenting 3-4 people per shift needs to file notes quickly, often at the end of a busy shift. A 3-minute unstructured monologue → 8s wait → 30s review is **~4 minutes total**. A 5-minute guided conversation → 30s review is **~5.5 minutes total**. Architecture A is 25-30% faster in the common case.

**The user's priority is "as fast as possible."** Batch pipeline wins here. The caregiver brain-dumps everything at once — no waiting for the agent to ask questions between thoughts.

### 3. Cost Per Note

**Architecture A wins significantly.**

| Component | A: Batch Pipeline | B: Real-Time Agent |
|-----------|--------------------|--------------------|
| STT | Google Speech-to-Text: ~$0.016/min (Whisper API: ~$0.006/min) | Deepgram: ~$0.005/min (streaming) |
| LLM (drafting) | Sonnet: ~$0.003-0.008/note | Claude via platform: ~$0.02-0.05/conversation (more turns, more tokens) |
| LLM (classifiers) | Haiku ×3: ~$0.001/note | N/A (included in agent LLM) |
| TTS | None | ElevenLabs: ~$0.05-0.15/conversation |
| Platform fee | None | $0.05-0.35/min × 3-5 min = $0.15-1.75/conversation |
| **Total per note** | **~$0.01-0.02** | **~$0.25-2.00** |

Architecture B is **12-100x more expensive per note.** For an agency with 50 caregivers filing 3 notes per shift (450 notes/day), that's:

- A: $4.50-9.00/day → **$135-270/month**
- B: $112-900/day → **$3,375-27,000/month**

This cost difference is a dealbreaker for the IDD market, where agencies run on thin Medicaid margins.

### 4. HIPAA Compliance

**Architecture A is simpler to comply.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| PHI exposure points | 2 (Speech-to-Text, Claude) | 3-4 (STT, LLM, TTS, platform orchestrator) |
| BAAs needed | Google Cloud only (already planned) | Google Cloud + voice platform (ElevenLabs/Vapi/Retell) |
| Data in transit | Audio file (one POST), text (one POST) | Continuous audio stream over WebSocket — more surface area |
| Audio retention | Processed in memory, never persisted | Platform may buffer/log audio for quality/debugging |
| Audit trail | Simple: 2 API calls per note, logged | Complex: multi-turn conversation, each turn is an API call |
| PHI in TTS | N/A | Agent speaks client names aloud — audio output contains PHI |

**Key risk with B:** Voice platforms are newer companies with less mature HIPAA compliance programs than the major clouds. BAA availability varies, and enterprise tiers (required for BAA) are expensive. The PHI flows through more systems, increasing the attack surface.

### 5. Reliability and Offline Behavior

**Architecture A wins decisively.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| Offline fallback | Full rules-based fallback (lomi.js) — notes can always be filed | No fallback — conversation requires live connection |
| Network quality needed | Works on any connection (single HTTP POST) | Requires stable, low-latency connection for real-time audio streaming |
| Failure mode | Graceful: fallback produces a usable (if simpler) draft | Hard: conversation drops, caregiver loses progress |
| Recovery | Caregiver can retry or type manually | Must restart entire conversation |
| Group home reality | Many homes have poor Wi-Fi, cellular dead spots | Real-time streaming fails in these environments |

**IDD caregivers work in group homes, not offices.** Network quality is unpredictable. A pipeline that works over spotty connections and degrades gracefully is essential. Real-time voice agents require sustained, low-latency connectivity that many group homes cannot provide.

### 6. Engineering Complexity

**Architecture A is dramatically simpler.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| New dependencies | 0 (Speech-to-Text and Claude already in stack) | Voice platform SDK, WebRTC/WebSocket handling, TTS integration |
| Server infrastructure | Existing SvelteKit routes + Cloud Tasks | Voice platform webhook handlers, WebSocket servers, audio stream management |
| Client complexity | MediaRecorder (existing) + fetch | WebRTC setup, audio stream management, real-time UI updates, conversation state machine |
| Conversation design | N/A | Dialog flow, error recovery, interruption handling, silence detection, barge-in |
| Testing | Straightforward: mock API, check JSON output | Complex: simulate voice conversations, test timing, handle race conditions |
| Lines of code estimate | ~200-300 new (parallel pipeline + per-section editing) | ~2,000-4,000 new (conversation engine, platform integration, state management) |
| Time to build | 1-2 weeks | 6-10 weeks |
| Maintenance burden | Low: Speech-to-Text and Claude are stable APIs | High: voice platform API changes, conversation flow tuning, audio edge cases |

### 7. User Experience

**Nuanced. A wins for experienced users; B has discovery advantages for new users.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| Learning curve | Tap → talk → wait → review (intuitive) | Conversation with AI (novel, may confuse some users) |
| User control | Caregiver controls the narrative, speaks at their pace | Agent controls the flow, asks questions in sequence |
| Flexibility | Free-form — caregiver mentions things in any order | Structured — agent walks through sections sequentially |
| Completeness | Caregiver may forget sections → flags help | Agent asks about each section → better coverage |
| Interruption tolerance | Can pause recording, resume later | Conversation context may be lost on interruption |
| Hands-free | Partial: must tap to start/stop, then review | Yes: fully conversational (but still needs review per HIPAA) |
| Multi-person homes | Fast: 3 notes × 4 min = 12 min | Slow: 3 notes × 5.5 min = 16.5 min |

**Per-section editing addresses the completeness gap.** When Lomi drafts show empty sections (mood: "", health: ""), the review UI can highlight them and prompt: "Lomi didn't catch anything about mood — tap 🎤 to add." This gives the completeness benefit of B's guided approach without the time cost.

### 8. Scalability

**Architecture A scales better.**

| Factor | A: Batch Pipeline | B: Real-Time Agent |
|--------|--------------------|--------------------|
| Concurrent users | Limited only by API rate limits (easily handled) | Each active conversation holds a WebSocket/WebRTC connection |
| Server resources | Stateless: request → response → done | Stateful: maintain conversation state per active user |
| Cost scaling | Linear with notes filed ($0.01-0.02 each) | Linear with conversation minutes ($0.25-2.00 each) |
| Peak load | End-of-shift rush: batch requests, Speech-to-Text handles concurrency | End-of-shift rush: dozens of simultaneous voice sessions — expensive, may hit platform limits |

### 9. Accuracy for IDD-Specific Vocabulary

**Architecture A wins slightly.**

Batch transcription (Speech-to-Text or Chirp) handles medical/IDD terminology better because it processes complete audio with full context. Real-time STT (Deepgram streaming) processes audio in chunks and may struggle with terms like "gestural prompt," "elopement," "ISP goals," or medication names mid-stream.

Both approaches benefit from post-processing with Claude, which understands IDD terminology. But A gives Claude the full, corrected transcript to reason over, while B gives Claude fragments that may contain STT errors.

---

## Hybrid Approach (Not Recommended for MVP)

A middle ground: Use Architecture A as the primary flow, with an optional "Lomi interview" mode for new caregivers or complex cases.

```
Default: Batch Pipeline (Architecture A)
  ↓
Review screen shows empty sections?
  ↓
Offer: "Want Lomi to ask you about the missing sections?"
  ↓ (if yes)
Short guided conversation (3-4 turns, covering only empty sections)
  ↓
Update draft with new information
```

**Why not for MVP:** Doubles the engineering surface, adds voice platform dependency, and the per-section editing feature achieves 90% of the same benefit at 10% of the complexity.

**When to revisit:** After launch, if quality metrics show caregivers consistently produce incomplete notes (>20% send-back rate) despite per-section editing prompts.

---

## Recommendation

**Architecture A (Batch Pipeline) with parallel processing and per-section voice editing.**

### Rationale

| Priority | Winner | Margin |
|----------|--------|--------|
| **Quality** (user's #1) | A | Moderate — full-context reasoning beats incremental |
| **Speed** (user's #1) | A | Strong — 4 min vs 5.5 min per note |
| Cost | A | Decisive — 12-100x cheaper |
| HIPAA | A | Moderate — fewer PHI touchpoints |
| Reliability | A | Decisive — offline fallback, works on poor networks |
| Engineering | A | Decisive — 1-2 weeks vs 6-10 weeks |
| Scalability | A | Strong — stateless, linear cost |

Architecture B's main advantage — guided completeness — is addressed by per-section voice editing, which adds ~200 lines of code instead of ~3,000.

### What to Build

1. **Parallel draft pipeline** — Speech-to-Text → parallel Haiku classifiers + Sonnet drafter → merged result
2. **Per-section mic buttons** — Each review screen section gets a 🎤 → Speech-to-Text → Haiku edit
3. **Completeness prompts** — Empty sections are highlighted: "Lomi didn't catch anything here. Tap 🎤 to add."
4. **Streaming UX** — Server-sent events for the Sonnet draft call so sections appear progressively (~2s to first section instead of ~4s to all)

### Model Selection for Production

| Task | Model | Why |
|------|-------|-----|
| Transcription | Google Speech-to-Text v2 (Chirp), batch | Same cloud and BAA as the rest of the stack; phrase hints for IDD vocabulary. Accuracy and the 60 s sync limit to verify in the first spike (ai-pipeline.md); Azure OpenAI Whisper is the fallback |
| Section classification | Claude Haiku 4.5 (Vertex AI) | Fast (~1s), cheap ($1/MTok), sufficient for keyword-level classification |
| Goal matching | Claude Haiku 4.5 (Vertex AI) | Structured mapping task, Haiku handles well |
| Issue detection | Claude Haiku 4.5 (Vertex AI) | Pattern matching with clinical judgment |
| Note drafting | Claude Sonnet (latest) (Vertex AI) | Best quality-to-speed ratio for clinical prose generation |
| Per-section editing | Claude Haiku 4.5 (Vertex AI) | Single-section rewrite is a simple task, Haiku is fast enough |
| Supervisor summary | Claude Haiku 4.5 (Vertex AI) | Short output, structured input, speed matters |

### Cost Projection (Production)

| Agency Size | Notes/Month | AI Cost/Month |
|-------------|-------------|---------------|
| Small (10 caregivers) | ~900 | **~$12** |
| Medium (30 caregivers) | ~2,700 | **~$35** |
| Large (100 caregivers) | ~9,000 | **~$117** |

Per-note cost is ~$0.013, including draft pipeline, per-section edits, and chat routing (see ai-pipeline.md § Cost Projections for breakdown). These costs are compatible with all subscription tiers (starter, professional, complete).

### Latency Targets (Updated)

| Operation | Target (P50) | Target (P95) |
|-----------|-------------|-------------|
| Voice recording → transcript | 2s | 4s |
| Transcript → first section visible (streaming) | 2s | 3.5s |
| Transcript → full draft complete | 4s | 7s |
| Per-section voice edit → updated section | 2.5s | 4s |
| Supervisor summary | 1.5s | 3s |

### When to Reconsider Architecture B

Revisit the real-time voice agent approach if:

- Send-back rate exceeds 20% and per-section editing doesn't reduce it
- Caregivers report that the monologue-then-review flow feels unnatural
- A HIPAA-compliant voice platform emerges at <$0.03/min with BAA included
- Network infrastructure in group homes improves significantly (5G, better Wi-Fi)
- A competitor ships a conversational documentation product that gains traction

---

## Appendix: Per-Section Voice Editing — Detailed UX

### Review Screen Layout

```
┌─────────────────────────────────────┐
│ Shift Note — John D.            ✕   │
├─────────────────────────────────────┤
│                                     │
│ Activities                       🎤 │
│ ┌─────────────────────────────────┐ │
│ │ John participated in a          │ │
│ │ community outing to the park.   │ │
│ │ He walked for 20 minutes and    │ │
│ │ interacted with peers.          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Meals                            🎤 │
│ ┌─────────────────────────────────┐ │
│ │ John ate lunch: turkey sandwich │ │
│ │ and apple juice. He finished    │ │
│ │ everything.                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ⚠ Mood (empty — tap 🎤 to add)  🎤 │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Health                           🎤 │
│ ┌─────────────────────────────────┐ │
│ │ No health concerns reported.    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ── Goals ──                         │
│                                     │
│ 🎯 Make bed independently       🎤 │
│ ┌─────────────────────────────────┐ │
│ │ Trials: Verbal prompt, Verbal   │ │
│ │ prompt, Independent             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ── Flags ──                         │
│ ⚡ "was fine" — too vague for the   │
│   record. Describe what you saw.    │
│                                     │
│         [ Sign & Submit ]           │
└─────────────────────────────────────┘
```

### Mic Button States

1. **Idle:** Gray mic icon, tappable
2. **Recording:** Red pulsing mic, section border turns lemon, timer shows
3. **Processing:** Mic becomes spinner, "Updating..." text
4. **Updated:** Section flashes lemon briefly, new text appears with a subtle diff highlight
5. **Error:** "Couldn't update. Try again or type." — falls back to text editing

### Per-Section Edit Flow

```
User taps 🎤 on "Mood" section
  → Section expands, mic icon pulses red
  → User speaks: "He was calm most of the day but got
     a little anxious around dinner time, pacing back
     and forth in the hallway."
  → User taps 🎤 again to stop (or auto-stop after 3s silence)
  → Speech-to-Text transcribes (~2s)
  → Haiku merges with existing content (~1.5s)
  → Mood section updates:
     "John was calm for most of the shift. He became
      anxious around dinner time, pacing back and forth
      in the hallway."
  → Yellow flash confirms update
```

### Edge Cases

- **Overwrite vs. merge:** If the section already has content, Haiku merges. If empty, Haiku writes fresh from the transcript.
- **Contradiction:** New voice input overrides old content ("actually he didn't eat lunch" replaces the meals section).
- **Multiple edits:** Each 🎤 tap is cumulative. The section grows more detailed with each edit.
- **Undo:** Tapping the section shows "Undo last voice edit" for 10 seconds after an update.
- **Offline:** Per-section editing requires network (Speech-to-Text + Haiku). If offline, the mic button is disabled and the text input remains available.
