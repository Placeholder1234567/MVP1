# Verification Report

> Post-fix verification by 30 agents checking cross-spec consistency

## Summary

- **7/30 checks passed** (fully consistent)
- **23/30 checks failed** (remaining issues)
- **106 remaining issues** across 17 files
- By severity: **10 critical**, **54 major**, **42 minor**, **0 other**

### Checks That Passed

- rls-policies
- schema-service-assignment
- offline-sync-schema-match
- Sidebar width consistency
- indexeddb-localstorage-phi
- framework-references
- css-class-existence

---

## Check Results (all 30)

| # | Dimension | Status | Issues | Summary |
|---|-----------|--------|--------|---------|
| 1 | rls-policies | PASS | 0 | All 30 schema tables have RLS enabled with at least a SELECT policy. 29 of 30 also have INSERT policies. The sole exception is 'agencies', which in... |
| 2 | schema-service-assignment | PASS | 0 | All 30 tables defined in schema.ts are assigned to exactly one owning service in services.md. Verified against both the Data Ownership Matrix (line... |
| 3 | tRPC procedure entitlement gates | FAIL | 1 | Extracted 84 tRPC procedures across 22 routers from trpc-router.md. All 84 are present in the entitlements.md Section 6 router-to-feature mapping w... |
| 4 | vital-thresholds | FAIL | 1 | All vital threshold numeric values (temp 95/100.4, pulse 50/100, systolic 90/140, diastolic 60/90) are consistent across all three files. Seven of ... |
| 5 | Lomi feature tier gating | FAIL | 2 | Lomi draft and summarize have correct tier gates in entitlements.md: lomi_drafting is Professional+ and lomi_summary is Professional+ with analytic... |
| 6 | incident-type-enum-consistency | FAIL | 1 | The incident TYPE enum (8 values: Seizure, Medication error, Injury, Fall, Left without staff, Behavior with harm, Property damage, Other) is consi... |
| 7 | offline-architecture-matches-constitution | FAIL | 3 | The sync strategy is consistent: both files say server-authoritative last-write-wins, not CRDTs. However, offline-sync.md misquotes the constitutio... |
| 8 | prompt-level-enum-consistency | FAIL | 2 | The canonical LEVELS array (7 values: Independent, Verbal prompt, Gestural prompt, Model, Partial physical, Full physical, Refused) is consistent a... |
| 9 | status-enum-consistency | FAIL | 3 | Checked note_status, mar_status, coverage_status, and referral_status across schema.ts, charting-ux.md, trpc-router.md, and app-core.js. note_statu... |
| 10 | notification-types | FAIL | 4 | All 18 notification type NAMES are consistent across the three files. The trpc-router.md notification.updatePreferences procedure (line 257) lists ... |
| 11 | offline-sync-schema-match | PASS | 0 | All 22 SQL SELECT queries across 4 sync buckets (global, home_data, user_data, admin_clock_data) were verified. Every table name (agencies, homes, ... |
| 12 | Subscription tier feature mapping | FAIL | 2 | Of the 16 features checked, 12 that exist in both documents have consistent tier assignments (scheduling, coverage, timekeeping, charting, mar, inc... |
| 13 | Light mode color tokens | FAIL | 1 | Checked all 17 light mode CSS custom property tokens (--bg, --card, --ink, --muted, --faint, --line, --line2, --blue, --blue-d, --sky, --lemon, --l... |
| 14 | Spacing and border radii | FAIL | 5 | Five cross-file inconsistencies found in spacing and border radii. Two are major: (1) callout border-radius is 18px in styles.css and design-system... |
| 15 | Sidebar width consistency | PASS | 0 | The supervisor sidebar width is 220px in styles.css (.dash grid-template-columns: 220px minmax(0,1fr) at line 177). frontend-spec-3.md references t... |
| 16 | WCAG contrast ratio accuracy | FAIL | 7 | All 27 contrast ratios in Section 9.2 are mathematically correct to 2 decimal places. However, six ratio values in other sections of the same file ... |
| 17 | lint-passes | FAIL | 1 | The linter reports 1 failure: Table 'audit_log' is missing updated_at column (check: timestamps). This is a linter false positive -- audit_log is i... |
| 18 | lomi-ux-vs-ai-pipeline | FAIL | 6 | charting-ux.md mentions all 4 interaction modes from ai-pipeline.md (voice brain dump, per-box editing, chat routing, direct edit) and proactive qu... |
| 19 | Dark mode color tokens | FAIL | 3 | All 18 current MVP dark mode token values (--bg, --card, --ink, --muted, --faint, --line, --line2, --blue, --blue-d, --sky, --lemon, --lemon-2, --l... |
| 20 | tRPC input/output types match schema | FAIL | 5 | Found 5 mismatches between tRPC router spec and schema.ts. Three are critical: (1) incident_type enum has 2 values in tRPC that do not exist in the... |
| 21 | Lomi UX in frontend-spec-2.md vs ai-pipeline.md | FAIL | 1 | All 4 interaction modes from ai-pipeline.md (Voice Brain Dump, Per-Box Editing, Chat, Direct Text Edit) are reflected in frontend-spec-2.md Section... |
| 22 | PHI inventory completeness | FAIL | 6 | The PHI inventory in security.md covers most PHI-bearing columns but has 6 gaps across 4 tables. The most significant omissions are: (1) clients.be... |
| 23 | migration-plan-coverage | FAIL | 10 | Verified all 14 store.js top-level fields (agency, homes, staff, clients, schedule, notes, incidents, mar, health, attendance, msgs, coverage, cloc... |
| 24 | typography | FAIL | 8 | Font families (Figtree sans-serif, Georgia serif) and their CSS custom property definitions (--sans, --serif) are consistent across all four files.... |
| 25 | indexeddb-localstorage-phi | PASS | 0 | No violations found. All four files are consistent with the policy that PowerSync OPFS is the only permitted client-side PHI cache. Every mention o... |
| 26 | framework-references | PASS | 0 | All 8 specification files verified. The only non-SvelteKit framework references found are two mentions of React in competitive-research.md (line 83... |
| 27 | css-class-existence | PASS | 0 | Every CSS class referenced in the Section 5 Component Library of frontend-spec-3.md was verified against styles.css. All classes that do not exist ... |
| 28 | responsive-breakpoints | FAIL | 3 | styles.css uses three breakpoint values: 560px (legacy demobar), 700px (caregiver phone frame, nav, actionbar, sheet, dock -- 6 rules), and 900px (... |
| 29 | security-auth-matrix-vs-rls | FAIL | 13 | Found 13 discrepancies between the authorization matrix in security.md and the RLS policies in rls.sql. One critical issue: case_notes SELECT expos... |
| 30 | current-vs-future-delineation | FAIL | 18 | Found 18 remaining delineation issues across frontend-spec-2.md and frontend-spec-3.md. The specs generally do a good job marking rebuild targets (... |

---

## Remaining Issues by File

### frontend-spec-1.md (16 issues)

- **[CRITICAL]** _WCAG contrast ratio accuracy_ (line ~80): Section 2.1.4 claims --disabled-text (#A09EB8) on --card (#FFFFFF) is 3.0:1, but actual WCAG computation yields 2.60:1 (off by 0.40). This is particularly problematic because 3.0:1 is the AA threshold for large text -- the claimed value suggests barely passing, but the actual value fails.
  - Fix: Change '3.0:1' to '2.60:1' in the Section 2.1.4 text colors table.

- **[MAJOR]** _Light mode color tokens_ (line ~800): In section 10.2.2 (Dark mode proposal table), the 'Light Value' column for --blue is listed as #3B4FC4, but styles.css line 3, design-system.md line 29, frontend-spec-1.md section 2.1.2 line 49, and the CSS block at section 10.6 line 916 all define --blue as #2F3ED8. The table's light value is inconsistent with every other reference.
  - Fix: Change the Light Value for --blue in the section 10.2.2 table from #3B4FC4 to #2F3ED8 to match styles.css and all other spec references.

- **[MAJOR]** _Spacing and border radii_ (line ~377): Callouts mapped to --radius-xl (14px) in Section 2.5.2 usage rules, but styles.css line 94 uses border-radius:18px for .callout, and design-system.md line 79 says 'Callouts | 18px'. The spec says 14px while the implementation and design-system both say 18px.
  - Fix: Update frontend-spec-1.md Section 2.5.2 to map callouts to --radius-2xl (18px) instead of --radius-xl (14px), matching styles.css and design-system.md.

- **[MAJOR]** _WCAG contrast ratio accuracy_ (line ~77): Section 2.1.4 claims --ink (#1C1B4B) on --bg (#FFFCF3) is 12.8:1, but actual WCAG computation yields 15.65:1 (off by 2.85). Section 9.2 in the same file correctly states 15.65:1, creating an internal contradiction.
  - Fix: Change '12.8:1 (AAA)' to '15.65:1 (AAA)' in the Section 2.1.4 text colors table.

- **[MAJOR]** _WCAG contrast ratio accuracy_ (line ~77): Section 2.1.4 claims --ink (#1C1B4B) on --card (#FFFFFF) is 14.1:1, but actual WCAG computation yields 16.06:1 (off by 1.96). Section 9.2 correctly states 16.06:1.
  - Fix: Change '14.1:1 (AAA)' to '16.06:1 (AAA)' in the Section 2.1.4 text colors table.

- **[MAJOR]** _WCAG contrast ratio accuracy_ (line ~80): Section 2.1.4 claims --disabled-text (#A09EB8) on --bg (#FFFCF3) is 2.8:1, but actual WCAG computation yields 2.53:1 (off by 0.27). Section 9.2 correctly states 2.53:1.
  - Fix: Change '2.8:1 (intentional fail)' to '2.53:1 (intentional fail)' in the Section 2.1.4 text colors table.

- **[MAJOR]** _WCAG contrast ratio accuracy_ (line ~51): Section 2.1.2 claims --blue-active (#232F73) on white (#FFFFFF) is 10.1:1, but actual WCAG computation yields 12.17:1 (off by 2.07).
  - Fix: Change '10.1:1 (AAA)' to '12.17:1 (AAA)' in the Section 2.1.2 blue palette table.

- **[MAJOR]** _WCAG contrast ratio accuracy_ (line ~51): Section 2.1.2 claims --blue-active (#232F73) on --bg (#FFFCF3) is 9.80:1, but actual WCAG computation yields 11.86:1 (off by 2.06).
  - Fix: Change '9.80:1 (AAA)' to '11.86:1 (AAA)' in the Section 2.1.2 blue palette table.

- **[MAJOR]** _Dark mode color tokens_ (line ~800): Section 10.2.2 table shows --blue light value as #3B4FC4, but all other sources (styles.css line 3, design-system.md line 29, and even this file's own Section 2.1.2 line 49 and CSS block line 916) use #2F3ED8. This internal contradiction is not marked as a proposed change -- the CSS block on line 916 says '/* matches styles.css */' while using #2F3ED8.
  - Fix: Change the --blue light value in the Section 10.2.2 table from #3B4FC4 to #2F3ED8 to match the rest of the file and the other two source files.

- **[MAJOR]** _typography_ (line ~233): Mobile greeting h1 size in visual hierarchy example is --text-4xl (32px), but styles.css .greet h1 is 30px (which is --text-3xl). The spec overestimates the mobile greeting size by 2px.
  - Fix: Change the visual hierarchy example line 233 from '--text-4xl 700 serif' to '--text-3xl 600 serif' for mobile greeting, matching styles.css line 230 (.greet h1{font-size:30px}).

- **[MINOR]** _Spacing and border radii_ (line ~363): Segment control inner button radius mapped to --radius-lg (12px), but styles.css line 109 uses border-radius:11px and design-system.md line 75 says '11px inner buttons'. The 12px token value contradicts both other files.
  - Fix: Either change --radius-lg use-case description in frontend-spec-1.md to exclude segment control inner buttons (adding a note that seg inner uses 11px as a special case), or update styles.css and design-system.md to use 12px. The nested rounding rule in line 379 (outer minus padding = 14-4 = 10px) also disagrees with all three values.

- **[MINOR]** _Spacing and border radii_ (line ~362): Tooltips listed under --radius-md (8px) use cases, but design-system.md line 80 groups 'Tooltips/toasts' together at 999px. styles.css .toast uses border-radius:999px. There is no .tooltip class in styles.css to verify, but the two spec files disagree on what radius tooltips should use (8px vs 999px).
  - Fix: Decide whether tooltips should be pill-shaped (999px, matching design-system.md and toast styling) or use 8px. Update the disagreeing file accordingly. If tooltips are distinct from toasts, clarify in design-system.md by separating 'Tooltips' from 'Toasts'.

- **[MINOR]** _Spacing and border radii_ (line ~250): Declares '4px base unit' with 'all spacing values are multiples of 4px', but the component padding presets in the same file (and matching values in styles.css and design-system.md) use 6px, 10px, 14px, 18px, 22px, 26px -- none of which are multiples of 4px. The stated rule is violated by the spec's own component definitions.
  - Fix: Either change the base unit claim to '2px' (all values are multiples of 2px), or acknowledge that the 4px grid applies to the spacing token scale only and component padding uses a 2px grid. The current wording is misleading for implementers.

- **[MINOR]** _WCAG contrast ratio accuracy_ (line ~662): Section 9.2 Semantic Color table labels several large-text results as 'AA Pass' when the ratios (4.69, 5.23, 5.32, 5.75, 6.00, 6.57, 6.62) all exceed the 4.5:1 AAA threshold for large text. Affected pairs: --ok on --ok-bg, --ok on --card, --warn on --card, --bad on --bad-bg, --bad on --card, --info on --info-bg, --info on --card, --blue on --sky, --vital-alert on --card. These are technically not wrong (they do pass AA) but understate the actual compliance level.
  - Fix: Change 'AA Pass' to 'AAA Pass' in the Large Text column for all nine semantic color rows whose ratios exceed 4.5:1.

- **[MINOR]** _Dark mode color tokens_ (line ~801): Section 10.2.2 table uses token name '--blue-hover' with light value #2D3A8C, but the existing token in styles.css and design-system.md is '--blue-d' with value #2230B8. The CSS block on line 964 of this same file also uses '--blue-d', not '--blue-hover'. The proposed token rename is not flagged as such, creating confusion about whether this is a rename proposal or an error.
  - Fix: Either (a) add a note like '(Rebuild rename from --blue-d)' next to --blue-hover, or (b) use the existing token name --blue-d in the table with the current light value #2230B8 and just show the proposed dark value.

- **[MINOR]** _typography_ (line ~190): Type scale has no token for 15px, jumping from --text-base-sm (14px) to --text-base (16px). However, 15px is used extensively in styles.css for callouts (.callout), checks (.check), avatars (.avatar), sidebar nav buttons (.side button, .cg-nav button), section headings (.section-h h2), messages (.msg), tables (table.t), and clinical text (.cv-text). At least 9 CSS selectors use 15px.
  - Fix: Add a --text-base-md token at 0.9375rem (15px) to the type scale between --text-base-sm (14px) and --text-base (16px), or document 15px as a valid intermediate size used for compact UI contexts like callouts, messages, and navigation labels.

### charting-ux.md (13 issues)

- **[MAJOR]** _lomi-ux-vs-ai-pipeline_ (line ~284): Wrong cross-reference: says 'ai-pipeline.md Mode 3 -- Per-Box Text' but ai-pipeline.md Mode 3 is Chat, not Per-Box Text. Per-box text editing is part of ai-pipeline.md Mode 2 (Per-Box Editing).
  - Fix: Change '(ai-pipeline.md Mode 3 -- Per-Box Text)' to '(ai-pipeline.md Mode 2 -- Per-Box Editing)'.

- **[MAJOR]** _lomi-ux-vs-ai-pipeline_ (line ~309): Wrong cross-reference: says 'ai-pipeline.md Mode 4 -- Chat Routing' but ai-pipeline.md Mode 4 is Direct Text Edit. Chat routing is ai-pipeline.md Mode 3.
  - Fix: Change '(ai-pipeline.md Mode 4 -- Chat Routing)' to '(ai-pipeline.md Mode 3 -- Chat)'.

- **[MAJOR]** _lomi-ux-vs-ai-pipeline_ (line ~840): Section 11.5 splits ai-pipeline.md's single Mode 2 (Per-Box Editing, covering both voice and text) into two separate modes: 'Per-box voice (Mode 2)' and 'Per-box text rewrite (Mode 3)'. This creates a 5-mode numbering (Modes 2-5) that conflicts with ai-pipeline.md's 4-mode numbering (Modes 1-4). Chat is labeled Mode 4 here but Mode 3 in ai-pipeline.md; Direct edit is labeled Mode 5 here but Mode 4 in ai-pipeline.md.
  - Fix: Merge per-box voice and per-box text under a single 'Per-box editing (Mode 2)' entry, renumber chat as Mode 3 and direct edit as Mode 4, matching ai-pipeline.md exactly.

- **[MAJOR]** _typography_ (line ~915): Page heading (h1) size range listed as 28-32px, but styles.css desktop greeting (.greet h1 at >=900px) is 38px, which exceeds the stated maximum of 32px. The 28px lower bound also has no matching usage in styles.css.
  - Fix: Update charting-ux.md line 915 size range from '28-32px' to '30-38px' to match styles.css: mobile .greet h1 is 30px (line 230), desktop .greet h1 is 38px (line 350), and .main-h h1 is 32px (line 187).

- **[MAJOR]** _typography_ (line ~915): Page heading (h1) weight listed as 400, contradicting frontend-spec-1.md which says greeting weight is 700 (lines 232-233). The .serif class in styles.css sets font-weight:400 (line 24), so actual rendered weight depends on whether the h1 carries the .serif class. Meanwhile, non-serif h1 elements like .main-h h1 use browser-default bold (700). The blanket '400' is wrong for at least some h1 usages.
  - Fix: Reconcile: if greetings use the .serif class (weight 400 per styles.css line 24), update frontend-spec-1.md visual hierarchy (lines 232-233) to say weight 400 instead of 700. If greetings should be bold, remove font-weight:400 from the .serif class. Also update charting-ux.md to note that non-serif h1 elements (e.g., supervisor dashboard .main-h h1) are weight 700.

- **[MAJOR]** _typography_ (line ~916): Section heading (h2) size listed as 17px, but styles.css .section-h h2 is 15px (line 67) and .sheet h2 is 20px (line 167). Neither matches 17px. The 17px value in styles.css is used for .appbar .title b (line 44), which is a card/appbar title, not a section heading.
  - Fix: Update charting-ux.md line 916 to reflect actual CSS values: '.section-h h2' is 15px (weight 600) and '.sheet h2' is 20px (weight 600). Alternatively, split into two rows: 'In-card section heading | 15px | 600' and 'Sheet/modal heading | 20px | 600'.

- **[MINOR]** _vital-thresholds_ (line ~409): Pulse upper bound operator is >= 100, but app-core.js (line 104) uses > 100 and frontend-spec-2.md (line 737) uses > 100. A pulse of exactly 100 bpm would be flagged per charting-ux.md but NOT flagged per the code or frontend-spec-2.md. The operator note in frontend-spec-2.md (line 742) explicitly states pulse uses > and that all specs must match.
  - Fix: Change 'Pulse >= 100' to 'Pulse > 100' on line 409 of charting-ux.md to match app-core.js and frontend-spec-2.md.

- **[MINOR]** _prompt-level-enum-consistency_ (line ~291): Collapsed goal display example uses 'ind' as abbreviation for Independent (e.g., 'verbal, verbal, ind'), but app-core.js SHORT map defines Independent -> 'Independent' (no abbreviation). The actual rendering code in app-caregiver.js line 162 lowercases the SHORT value, producing 'independent' not 'ind'. The spec and code disagree on the display abbreviation.
  - Fix: Either update charting-ux.md examples to use 'independent' (matching current code behavior) or add a shorter abbreviation map to app-core.js and update app-caregiver.js to use it for inline/collapsed contexts.

- **[MINOR]** _prompt-level-enum-consistency_ (line ~293): Expanded trial display example uses 'Ind' as abbreviation for Independent (e.g., '1. Verbal' '2. Ind'), but app-core.js SHORT map defines Independent -> 'Independent'. The actual rendering code in app-caregiver.js line 164 produces '2. Independent' not '2. Ind'. The spec and code disagree.
  - Fix: Either update charting-ux.md examples to use 'Independent' (matching current code behavior) or add a shorter abbreviation to the SHORT map in app-core.js (e.g., 'Independent' -> 'Ind').

- **[MINOR]** _lomi-ux-vs-ai-pipeline_ (line ~307): Proactive question threshold says 'fewer than ~10 words' but ai-pipeline.md uses per-section character-based thresholds: empty string for mood/meals/health, 'under 20 chars' for activities, empty trials array for goals, and non-empty flags array. The charting-ux.md version oversimplifies into a single word-count heuristic that does not match the ai-pipeline.md logic.
  - Fix: Align the threshold description with ai-pipeline.md: 'If any section is empty, or activities is under 20 characters, or a goal has no recorded trials, Lomi surfaces a question...' or reference ai-pipeline.md Proactive Questions section for the per-section rules.

- **[MINOR]** _lomi-ux-vs-ai-pipeline_ (line ~307): Missing the 'at most 3 questions at a time' limit specified in ai-pipeline.md line 219: 'Lomi asks about at most 3 missing sections at a time to avoid overwhelming the screen. If there are more gaps, additional questions appear as earlier ones are addressed.'
  - Fix: Add the batching limit: 'Lomi shows at most 3 proactive questions at a time; additional questions appear as earlier ones are addressed.'

- **[MINOR]** _lomi-ux-vs-ai-pipeline_ (line ~284): Per-box text rewrite trigger only mentions 'on blur' but ai-pipeline.md Mode 2 specifies two triggers: 'on blur or explicit rewrite tap'. The explicit rewrite tap option is missing from charting-ux.md.
  - Fix: Change 'On blur after text edits, Lomi rewrites...' to 'On blur after text edits or on explicit rewrite tap, Lomi rewrites...' to match ai-pipeline.md.

- **[MINOR]** _typography_ (line ~233): Compose screen status text specified as 26px serif, but the type scale in frontend-spec-1.md has no 26px step. Nearest tokens are --text-2xl (24px) and --text-3xl (30px). The 26px value falls outside the defined type scale.
  - Fix: Either add a token for 26px or change the compose status text spec to use an existing token: --text-2xl (24px) or --text-3xl (30px).

### rls.sql (12 issues)

- **[CRITICAL]** _security-auth-matrix-vs-rls_ (line ~1096): case_notes SELECT is too permissive for caregivers. The RLS policy allows caregivers to read ALL case_notes in their assigned homes (via client home_id check), but the security.md matrix says caregivers should only read their OWN case_notes in assigned homes ('Create own; Read/Update own in assigned homes'). This is a PHI over-exposure: caregivers see case_notes authored by supervisors or other caregivers.
  - Fix: Add an author_id = current_profile_id() check to the caregiver branch of case_notes_select, similar to how notes_update restricts by author_id. E.g.: OR (author_id = current_profile_id() AND EXISTS (SELECT 1 FROM clients c WHERE c.id = case_notes.client_id AND c.home_id = ANY(current_user_home_ids())))

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~735): messages UPDATE policy is admin-only, but the authorization matrix says supervisors should have 'Read/Write all agency' access to messages. Supervisors cannot update or moderate any messages, contradicting the matrix.
  - Fix: Change messages_update to use is_supervisor_or_above() instead of current_user_role() = 'admin'. Also consider whether caregivers should be able to update their own messages (matrix says 'Read/Write in assigned homes').

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~1193): rooms INSERT policy is admin-only, but the authorization matrix says supervisors should have 'Read/Write all agency' access to rooms. Supervisors cannot create rooms.
  - Fix: Change rooms_insert WITH CHECK to use is_supervisor_or_above() instead of current_user_role() = 'admin'.

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~502): note_history has no UPDATE or DELETE policies, but the authorization matrix says admin has 'Full CRUD' on note_history. Admins cannot update or delete note_history rows. If note_history is intended to be append-only (like the comments suggest), the matrix should be corrected to say 'Read all agency' for admin instead of 'Full CRUD'.
  - Fix: Either add UPDATE/DELETE policies for admin (to match the matrix), or update the authorization matrix in security.md to say admin has 'Read + Insert (append-only)' for note_history instead of 'Full CRUD'.

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~430): note_goals SELECT allows caregivers to read note_goals for ALL notes in their assigned homes (via n.home_id check), but the matrix says caregivers can only 'Create/Read own notes' goals'. Caregivers see goal tracking data for notes authored by other staff.
  - Fix: Add n.author_id = current_profile_id() to the caregiver branch of note_goals_select. Or update the matrix to say 'Read all note goals in assigned homes' if the broader access is intentional.

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~482): note_history SELECT allows caregivers to read history for ALL notes in their assigned homes, but the matrix says caregivers can only 'Read own notes' history'. Caregivers see revision history for notes they did not author.
  - Fix: Add n.author_id = current_profile_id() to the caregiver branch of note_history_select. Or update the matrix to match the broader access if intentional.

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~1073): sync_checkpoints INSERT/UPDATE/DELETE policies all require profile_id = current_profile_id(), meaning admin can only write their OWN sync checkpoints. The authorization matrix says admin has 'Read/Write all agency'. Admin SELECT correctly includes all agency, but writes are limited to self.
  - Fix: Add an admin branch to sync_checkpoints_insert, sync_checkpoints_update, and sync_checkpoints_delete: OR current_user_role() = 'admin'.

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~1001): notifications UPDATE allows admin to update ALL agency notifications, but the authorization matrix says admin has only 'Read all agency' access (no Update). Caregivers and supervisors get 'Read/Update own' in the matrix. Admin's UPDATE scope exceeds what the matrix grants.
  - Fix: Either restrict notifications_update for admin to profile_id = current_profile_id() (matching the matrix), or update the matrix to grant admin 'Read/Update all agency' if the broader access is intentional.

- **[MINOR]** _security-auth-matrix-vs-rls_ (line ~539): incidents UPDATE allows caregivers to update their own open incidents (author_id check + status = 'open'), but the matrix only grants caregivers 'Create own; Read in assigned homes' with no Update mentioned. The RLS is more permissive than the matrix.
  - Fix: Either remove the caregiver branch from incidents_update (to match the matrix), or update the matrix to say 'Create own; Read in assigned homes; Update own open incidents'.

- **[MINOR]** _security-auth-matrix-vs-rls_ (line ~116): profiles UPDATE allows caregivers and supervisors to update their own profile (id = current_profile_id()), but the matrix only grants 'Read' access for those roles. Self-profile-update is a reasonable feature but is undocumented in the matrix.
  - Fix: Update the matrix: caregiver to 'Read own agency (home-filtered); Update own profile', supervisor to 'Read own agency; Update own profile'.

- **[MINOR]** _security-auth-matrix-vs-rls_ (line ~876): clock_records UPDATE allows caregivers to update their own records (profile_id = own), but the matrix only says 'Create/Read own'. Caregivers need UPDATE to clock out, but this is undocumented in the matrix.
  - Fix: Update the matrix: change caregiver from 'Create/Read own' to 'Create/Read/Update own'.

- **[MINOR]** _security-auth-matrix-vs-rls_ (line ~455): note_goals UPDATE allows caregivers to update note_goals on their own draft/returned notes, but the matrix only says 'Create/Read own notes' goals' for caregivers. The Update ability is reasonable (edit goals while drafting) but undocumented.
  - Fix: Update the matrix: change caregiver from 'Create/Read own notes' goals' to 'Create/Read/Update own draft notes' goals'.

### frontend-spec-3.md (11 issues)

- **[MAJOR]** _responsive-breakpoints_ (line ~2129): The main breakpoint reference table in Section 7.3 only lists two tiers (<=900px Mobile, >900px Desktop) but styles.css uses 700px as a significant intermediate breakpoint affecting 6 CSS rules: .app phone frame (line 41), .nav position (line 57), .actionbar position (line 158), .scrim/.sheet centering (line 165), .dock position (line 220), and .app border-color (line 324). The text at line 2127 mentions 700px only as 'phone frame border,' understating its scope. A developer following the table alone would not know that navigation, action bars, sheets, and the dock all change behavior at 700px.
  - Fix: Add a 700px row to the breakpoint table in Section 7.3, describing that the caregiver phone-frame shell (.app), bottom nav (.nav), action bar (.actionbar), bottom sheet centering (.scrim/.sheet), and dock (.dock) all transition from mobile-fixed to desktop-sticky/centered at min-width:700px.

- **[MAJOR]** _current-vs-future-delineation_ (line ~1493): Loading Skeleton component (lines 1493-1512) is specified with full shimmer animation CSS but does not exist in styles.css or any JS rendering code. Section 5 intro states new components are 'marked NEW' but this component is not marked NEW.
  - Fix: Add '**NEW**' marker to the Loading Skeleton heading, consistent with the convention used for .btn.danger, .btn.ok, .card.alert, etc.

- **[MAJOR]** _current-vs-future-delineation_ (line ~1526): Progress Ring SVG donut component (lines 1526-1548) is fully specified with sizes, color thresholds, and accessibility attributes. No progress ring exists in styles.css or any JS rendering code. Not marked NEW. The related compliance score ring in section 4.1 IS marked as rebuild target, but the component definition itself is not.
  - Fix: Add '**NEW**' marker to the Progress Ring heading.

- **[MAJOR]** _current-vs-future-delineation_ (line ~1907): Sync Status Indicator component (lines 1907-1928) is fully specified with 5 states (Synced, Pending, Syncing, Offline, Sync error). No sync indicator exists in the MVP -- the MVP is browser-only with no sync infrastructure. Not marked NEW.
  - Fix: Add '**NEW**' marker to the Sync Status Indicator heading.

- **[MAJOR]** _current-vs-future-delineation_ (line ~2046): Route Map (section 7.1, lines 2046-2088) presents a full URL-based routing structure (/today, /people/:id/note/review, /dashboard/notes, etc.) without noting that the MVP uses no URL-based routing at all. The MVP is a single-page innerHTML state machine -- navigation is managed via go()/render() functions with no history API. A developer could mistake this for documentation of existing routes.
  - Fix: Add a note at the top of section 7.1: '> *Note: The MVP prototype uses a single-page innerHTML rendering approach with no URL routing. The route map below is the target specification for the SvelteKit rebuild.*'

- **[MAJOR]** _current-vs-future-delineation_ (line ~2168): Search functionality (section 7.4, lines 2168-2191) describes Cmd+K command palette, mobile search, searchable content categories with priority rankings, and results layout. No search functionality exists anywhere in the MVP. Not marked as rebuild target. (Note: section 6.5 line 1629 acknowledges Cmd+K as a Month 3+ progressive disclosure feature, contradicting the unqualified presentation here.)
  - Fix: Add a rebuild target marker: '> *(Rebuild target -- no search functionality exists in the MVP prototype. Cmd+K is also listed as a Phase 4 item in section 13.)*'

- **[MINOR]** _responsive-breakpoints_ (line ~1313): Section 5.2 specifies a responsive rule '@media (max-width: 375px) { grid-template-columns: 1fr; }' for .grid2, but styles.css line 107 defines .grid2 with no such media query. This means on very narrow screens (<=375px), .grid2 remains two-column in the shipped CSS even though the spec says it should collapse to single-column.
  - Fix: Either add the 375px media query to styles.css for .grid2, or remove it from the spec if the two-column layout is acceptable at narrow widths.

- **[MINOR]** _current-vs-future-delineation_ (line ~1514): Pagination component (lines 1514-1519) specifies 'Load more' button for lists >25 items. No pagination exists in the MVP -- all lists render in full. Not marked NEW.
  - Fix: Add '**NEW**' marker to the Pagination heading.

- **[MINOR]** _current-vs-future-delineation_ (line ~1550): Sparkline inline SVG component (lines 1550-1559) is fully specified. No sparkline exists in the MVP codebase. Not marked NEW.
  - Fix: Add '**NEW**' marker to the Sparkline heading.

- **[MINOR]** _current-vs-future-delineation_ (line ~1562): Trend Arrow component (lines 1562-1571) is fully specified with computation logic and color rules. No trend arrow exists in the MVP. Not marked NEW.
  - Fix: Add '**NEW**' marker to the Trend Arrow heading.

- **[MINOR]** _current-vs-future-delineation_ (line ~1930): Draft Saved Indicator component (lines 1930-1942) is specified with saved/saving states. The MVP has no draft auto-save and no saved indicator. Not marked NEW.
  - Fix: Add '**NEW**' marker to the Draft Saved Indicator heading.

### frontend-spec-2.md (10 issues)

- **[MAJOR]** _current-vs-future-delineation_ (line ~57): Person card subtitle table (lines 57-67) presents med-timing subtitles ('Med due in 15 min', 'Lisinopril 30 min overdue', 'BP recheck at 2pm') as current subtitle states without any rebuild/future marker. The MVP (app-caregiver.js lines 68-72) only shows 'X meds due' without medication names, timing granularity, or BP recheck awareness. The 7-tier sort above this table has an explicit 'Note: The MVP code implements a simplified 2-tier sort' marker, but the subtitles table has no equivalent caveat.
  - Fix: Add a note above the subtitle table similar to the sort order note, e.g.: 'Note: The MVP renders simplified subtitles (see app-caregiver.js lines 68-72). The time-sensitive subtitles below are the target for the SvelteKit rebuild.'

- **[MAJOR]** _current-vs-future-delineation_ (line ~370): Therap preset metadata fields (Type selector chips, Summary field, Notification level, Time in/Time out) are described as part of the review screen for the Therap preset (lines 370-381) with no rebuild/future marker. The MVP review screen (V.review in app-caregiver.js) has no preset system and no such metadata fields. These are entirely aspirational.
  - Fix: Add a rebuild target marker: '*(Rebuild target -- the MVP review screen has no preset-dependent metadata fields. The preset system and these fields are planned for the SvelteKit rebuild.)*'

- **[MAJOR]** _current-vs-future-delineation_ (line ~1546): Auto-filled visual indicator (lines 1546-1549) describes a '2px left border in var(--lemon)' on auto-filled fields with fade-out transition. This CSS treatment does not exist in styles.css or any JS code. Presented as current behavior without rebuild/future marker.
  - Fix: Mark the entire 'Visual indicator for auto-filled values' block as '*(Rebuild target -- not in MVP)*'.

- **[MAJOR]** _current-vs-future-delineation_ (line ~1575): Lomi Brand Presence table (lines 1575-1582) lists 'Onboarding (first 3 sessions)' with 40px Lomi and speech bubble tips as a current Lomi appearance context. The MVP has no onboarding flow and no Lomi speech bubble tips. Not marked as rebuild target.
  - Fix: Add '(Rebuild target)' annotation to the Onboarding row.

- **[MAJOR]** _current-vs-future-delineation_ (line ~1576): Lomi Brand Presence table lists 'Empty states (18 occurrences)' with 32px Lomi icons and contextual one-liners. The MVP empty states (e.g., card.empty in V.cgNotes, emptyCard in app-office.js) are plain text with no Lomi icon. Not marked as rebuild target.
  - Fix: Add '(Rebuild target)' annotation to the Empty states row, or note that the MVP empty states do not include Lomi icons.

- **[MINOR]** _Lomi UX in frontend-spec-2.md vs ai-pipeline.md_ (line ~1890): Proactive questions table in section 6.8 lists only 5 conditions, missing the flags-based condition from ai-pipeline.md (line 215): when `flags` array is non-empty, Lomi should ask 'You said {person} "was fine" -- what did that look like?' in the chat panel. The vague language is handled via .cv-flag callout UI in section 3.2 Step 4, but ai-pipeline.md specifies it should ALSO appear as a proactive chat question (visible in the review screen layout mockup at ai-pipeline.md line 898-900).
  - Fix: Add a 6th row to the proactive questions table: | `flags` array is non-empty | You said {person} "was fine" -- what did that look like? |

- **[MINOR]** _current-vs-future-delineation_ (line ~917): Incident wizard auto-save is described as '(critical enhancement)' (line 917) but lacks a clear 'not in MVP' marker. The MVP incident wizard (V.incident in app-caregiver.js) has no auto-save. The phrasing 'critical enhancement' is ambiguous -- a developer could read it as something that should already exist or as a future item.
  - Fix: Change to: '**Auto-save (Rebuild target -- not in MVP):**' to match the markup convention used elsewhere.

- **[MINOR]** _current-vs-future-delineation_ (line ~1536): Smart Defaults auto-fill table (lines 1536-1542) lists 'Last weight: Most recent vitals entry for person' and 'Baseline BP: Most recent vitals with normal BP' as auto-filled field sources. The MVP health form (V.health in app-caregiver.js) does not implement these placeholder/reference features. No rebuild marker.
  - Fix: Mark the Last weight and Baseline BP rows with '(Rebuild target -- not in MVP)' as was done for the contextual topic suggestions in section 6.3.

- **[MINOR]** _current-vs-future-delineation_ (line ~1579): Lomi Brand Presence table lists 'All-notes-done celebration' with 24px Happy Lomi and bounce animation. V.cgToday renders a progress bar ('3 of 5 done') but has no celebration state or Lomi icon when all notes are done. Not marked as rebuild target.
  - Fix: Add '(Rebuild target)' annotation to the All-notes-done celebration row.

- **[MINOR]** _current-vs-future-delineation_ (line ~1580): Lomi Brand Presence table lists 'Error encouragement' with 24px Encouraging Lomi 'In .callout.warn for recoverable errors'. The MVP errLine() function renders .callout.bad with an alert triangle SVG, not a Lomi icon. Not marked as rebuild target.
  - Fix: Add '(Rebuild target)' annotation to the Error encouragement row.

### migration-plan.md (10 issues)

- **[CRITICAL]** _migration-plan-coverage_ (line ~156): Migration plan says clients.behaviors is 'Dropped' and moved into notes.content JSONB, but schema.ts (line 244) still defines 'behaviors: text("behaviors").array()' on the clients table. The plan and schema contradict each other.
  - Fix: Either remove the behaviors column from schema.ts to match the plan, or update the plan to show behaviors as a direct map (text[]) instead of 'Dropped'.

- **[CRITICAL]** _migration-plan-coverage_ (line ~473): Migration plan says clock lat/lng are 'Dropped (stored ephemerally, not persisted for privacy)' but schema.ts (lines 843-848) defines clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, and accuracy -- five undocumented columns that directly contradict the 'Dropped' designation.
  - Fix: Either remove the five geo columns from schema.ts to match the plan's privacy decision, or update the plan to show lat/lng mapped to clock_in_lat/clock_in_lng (with new clock_out_lat/clock_out_lng/accuracy columns). This is an architectural decision about PHI that must be resolved explicitly.

- **[MAJOR]** _migration-plan-coverage_ (line ~98): agencies.timezone column exists in schema.ts (line 154) but is not listed in migration-plan.md section 4.1. The schema adds a 'timezone' text column defaulting to 'America/New_York' that the plan does not document.
  - Fix: Add a row to the section 4.1 mapping table: '-- | -- | agencies.timezone | text | New, IANA timezone for the agency (default America/New_York)'.

- **[MAJOR]** _migration-plan-coverage_ (line ~306): Migration plan section 4.10 maps note_history timestamp as 'note_history.at' but schema.ts (line 501) defines the column as 'occurred_at'. The plan's column name does not match the schema.
  - Fix: Change the migration plan row from 'note_history.at' to 'note_history.occurred_at'.

- **[MAJOR]** _migration-plan-coverage_ (line ~315): incidents.home_id column exists in schema.ts (line 529) but is not documented anywhere in migration-plan.md section 4.11 (neither as a mapped MVP field nor as a new column).
  - Fix: Add a row to section 4.11: '-- | -- | incidents.home_id | uuid FK | New, links to homes'.

- **[MAJOR]** _migration-plan-coverage_ (line ~341): mar_records.amends_id column exists in schema.ts (line 594-596) as a self-referencing FK for amendment records, but is not documented in migration-plan.md section 4.12. This is a key column for the 'no delete MAR records' rule.
  - Fix: Add a row to section 4.12: '-- | -- | mar_records.amends_id | uuid FK (self-ref) | New, references original mar_records row for corrections/amendments'.

- **[MINOR]** _migration-plan-coverage_ (line ~216): Migration plan section 4.7 says medication_history.action type is 'text', but schema.ts (line 391) uses medHistoryActionEnum('action') with enum values ['added', 'updated', 'stopped']. The plan understates the type constraint.
  - Fix: Change the Postgres Type from 'text' to 'enum (med_history_action)' in the migration plan table.

- **[MINOR]** _migration-plan-coverage_ (line ~335): Migration plan says incidents.status type is 'text' with example values '(open, closed, etc.)' but schema.ts (line 545) uses incidentStatusEnum with values ['open', 'reviewed', 'closed']. The 'reviewed' state is undocumented in the plan.
  - Fix: Change the Postgres Type from 'text' to 'enum (incident_status)' and list the values as 'open, reviewed, closed'.

- **[MINOR]** _migration-plan-coverage_ (line ~441): Migration plan says coverage_candidates.reply type is 'text' with MVP values 'Offered, Accepted, Declined, etc.' but schema.ts (line 781) uses candidateReplyEnum with values ['pending', 'accepted', 'declined']. The MVP value 'Offered' has no enum equivalent.
  - Fix: Change the Postgres Type to 'enum (candidate_reply)' with values 'pending, accepted, declined' and document the MVP-to-enum value mapping (Offered->pending, Accepted->accepted, Declined->declined).

- **[MINOR]** _migration-plan-coverage_ (line ~472): Migration plan says clock_records.distance_meters type is 'integer' but schema.ts (line 850) defines it as 'real' (floating point). Type mismatch.
  - Fix: Change the Postgres Type in the plan from 'integer' to 'real', or change schema.ts to use integer(). Real is more appropriate for distance calculations.

### trpc-router.md (7 issues)

- **[CRITICAL]** _status-enum-consistency_ (line ~244): referral_status enum mismatch: trpc-router.md uses ['inquiry', 'assessment', 'accepted', 'placed', 'declined'] but schema.ts defines ['inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed']. Two differences: (1) 'touring' in schema vs 'assessment' in router, (2) 'waitlist' exists in schema but is missing from router. services.md (line 279) also uses the router's version with 'assessment'.
  - Fix: Reconcile the referral_status enum. Either update schema.ts to use 'assessment' instead of 'touring' and decide whether 'waitlist' is needed, or update trpc-router.md and services.md to match the schema. Both files must agree on the exact set of values.

- **[CRITICAL]** _tRPC input/output types match schema_ (line ~118): incident_type enum mismatch: tRPC lists 9 values including 'Elopement' and 'Behavioral', but schema incidentTypeEnum has 8 values with 'Behavior with harm' (not 'Behavioral') and no 'Elopement'. Any incident.create call using 'Elopement' or 'Behavioral' would fail the Postgres enum constraint.
  - Fix: Align enum values. Either add 'Elopement' to schema and rename 'Behavioral'->'Behavior with harm' in tRPC, or update both to use the same list.

- **[CRITICAL]** _tRPC input/output types match schema_ (line ~244): referral_status enum mismatch: tRPC lists statuses as 'inquiry','assessment','accepted','placed','declined' but schema referralStatusEnum uses 'inquiry','touring','accepted','waitlist','declined','placed'. 'assessment' (tRPC) does not exist in schema ('touring' is used instead), and 'waitlist' (schema) is not referenced in tRPC at all.
  - Fix: Reconcile the enum: decide whether the pipeline stage is called 'assessment' or 'touring', add 'waitlist' to tRPC if it is a valid status, and update both files to match.

- **[CRITICAL]** _tRPC input/output types match schema_ (line ~189): clock.manualEntry accepts a required 'reason: string' input, but the clock_records table in schema.ts has no 'reason' column. The reason value would be silently lost.
  - Fix: Add a 'reason' text column to the clock_records table in schema.ts, or remove the field from the tRPC procedure if it is not needed.

- **[MAJOR]** _tRPC procedure entitlement gates_ (line ~1): entitlements.md Section 6 (Audit Log) maps audit.list and audit.get procedures (gated by audit_log, admin role), but trpc-router.md has no audit router definition. These two procedures are phantom entitlement gates with no backing specification. Either the audit router needs to be added to trpc-router.md (with input/output schemas, descriptions) or the audit entries should be removed from entitlements.md.
  - Fix: Add an audit router section to trpc-router.md defining audit.list and audit.get procedures (input filters, output shapes, min role admin, feature gate audit_log), consistent with the entitlements.md mapping. Alternatively, remove the Audit Log section from entitlements.md Section 6 if audit log querying is not intended for v1.

- **[MAJOR]** _status-enum-consistency_ (line ~118): incident_type enum mismatch: trpc-router.md lists 'Elopement' and 'Behavioral' as valid incident types, but schema.ts defines neither. Schema has 'Left without staff' and 'Behavior with harm' instead. trpc-router.md includes both 'Elopement' and 'Left without staff' (redundant) and replaces 'Behavior with harm' with 'Behavioral'.
  - Fix: Update trpc-router.md incident.create description to match schema.ts incident_type enum: remove 'Elopement' and 'Behavioral', ensure 'Left without staff' and 'Behavior with harm' are listed.

- **[MAJOR]** _tRPC input/output types match schema_ (line ~120): tRPC incident.list description states 'the incidents table has no home_id column' and says homeId filtering requires joining through clients, but the schema incidents table (line 527-528) defines a home_id column with an FK to homes. The tRPC description contradicts the actual schema.
  - Fix: Remove the incorrect note from incident.list. The incidents table does have home_id, so the query can filter directly on it without joining through clients.

### security.md (7 issues)

- **[MAJOR]** _PHI inventory completeness_ (line ~119): clients.behaviors (text array, schema.ts line 244) is missing from the PHI inventory. This column stores behavioral descriptions tied to an identified client, which constitutes individually identifiable health information.
  - Fix: Add a row: Client behavioral descriptions | clients.behaviors | PHI (health/behavioral data)

- **[MAJOR]** _PHI inventory completeness_ (line ~130): goals.steps, goals.area, goals.frequency, and goals.target (schema.ts lines 301-305) are missing from the PHI inventory. Only goals.text is listed, but steps, area, frequency, and target are all client-specific treatment plan details that constitute PHI.
  - Fix: Expand the Goal tracking data row to: goals.text, .area, .steps, .frequency, .target, note_goals.trials

- **[MAJOR]** _PHI inventory completeness_ (line ~138): referrals.contact_name (schema.ts line 1103) is missing from the PHI inventory. The inventory lists contact_phone, contact_email, and notes but omits the contact name, which is also an associated contact identifier for a prospective client.
  - Fix: Add referrals.contact_name to the Referral contact info row

- **[MAJOR]** _security-auth-matrix-vs-rls_ (line ~98): coverage_steps matrix is internally inconsistent: supervisor gets 'Read/Write all agency' while admin gets 'Read + Insert (append-only)'. The RLS correctly implements append-only (INSERT + SELECT only, no UPDATE/DELETE) for both roles. The supervisor 'Write' label implies UPDATE capability that does not exist and should not exist for an immutable audit trail.
  - Fix: Update the supervisor column for coverage_steps from 'Read/Write all agency' to 'Read + Insert all agency' to match the append-only semantics and the actual RLS.

- **[MINOR]** _PHI inventory completeness_ (line ~130): note_goals.reason (schema.ts line 472) is missing from the PHI inventory. This field records clinical reasons for not attempting a goal and is PHI (treatment plan data).
  - Fix: Add note_goals.reason to the Goal tracking data row alongside note_goals.trials

- **[MINOR]** _PHI inventory completeness_ (line ~135): incidents.location and incidents.notified_parties (schema.ts lines 538, 545) are missing from the PHI inventory incident detail fields. Location within a small group home can contribute to re-identification, and notified_parties is a text array that may contain names of guardians, doctors, or other parties.
  - Fix: Add .location and .notified_parties to the Incident detail fields row

- **[MINOR]** _PHI inventory completeness_ (line ~128): health_entries.flags (schema.ts line 635) is missing from the PHI inventory. This text array contains clinical indicator flags (e.g., abnormal vital signs) tied to a specific client, qualifying as PHI.
  - Fix: Expand the Health entries row to: health_entries.data, .flags

### services.md (4 issues)

- **[MAJOR]** _notification-types_ (line ~288): Intake Service does not list Notification as a dependency, but the referral_status_change notification type (notifications.md section 2.17) is triggered by the Intake Service's updateReferralStatus() function. The Depends-on list (Auth, Home, Client, Audit) is missing Notification.
  - Fix: Add 'Notification (notify admin and supervisors on referral status change)' to the Intake Service Depends-on list.

- **[MAJOR]** _notification-types_ (line ~584): BullMQ Job Registry is missing scheduled jobs for three notification types that require timed triggers: shift_reminder (1 hour before shift start), med_due_reminder (30 min before scheduled medication time), and incident_review_needed (24 hours after incident opened with no review). These are defined in notifications.md sections 2.13, 2.8, and 2.12 respectively, but no corresponding BullMQ job appears in the registry.
  - Fix: Add ShiftReminderJob (cron or delayed, fires 1 hr before shift), MedDueReminderJob (fires 30 min before scheduled med time), and IncidentReviewCheckJob (daily cron or delayed job at incident creation + 24hr) to the BullMQ Job Registry.

- **[MINOR]** _notification-types_ (line ~91): Charting Service notification dependency omits note_approved. It mentions notify supervisor on sign (note_submitted) and notify DSP on return (note_sent_back) but does not mention notifying caregiver on approval (note_approved), which is a defined notification type in notifications.md section 2.5.
  - Fix: Add 'notify caregiver when note is approved' to the Charting Service Notification dependency description at line 91.

- **[MINOR]** _notification-types_ (line ~56): No service declares ownership of the system_maintenance notification trigger. notifications.md section 2.18 defines this type as 'Admin-initiated or automated deployment notification' but neither the Agency Service nor any other service in services.md lists Notification as a dependency for this purpose.
  - Fix: Add Notification dependency to the Agency Service (or create an explicit note on which service triggers system_maintenance notifications).

### styles.css (4 issues)

- **[MAJOR]** _Spacing and border radii_ (line ~185): Supervisor dashboard .main uses gap:20px for section spacing. frontend-spec-1.md Section 2.3.3 specifies desktop major section gap as 24px. design-system.md says 'Section gap: 18px' with no desktop distinction. Three different values (18px, 20px, 24px) across the three files for desktop section gaps.
  - Fix: Align on a single desktop section gap value. frontend-spec-1.md says 24px (which fits the 4px base unit); update styles.css .main gap to 24px and add the desktop distinction to design-system.md.

- **[MINOR]** _typography_ (line ~149): .say textarea has line-height:1.55 at 17px, but frontend-spec-1.md defines --text-md (17px) with line-height 1.5. The 0.05 difference affects vertical rhythm.
  - Fix: Either update styles.css .say line-height from 1.55 to 1.5 to match the --text-md token spec, or document the 1.55 override as intentional for the compose textarea (more generous spacing for long-form writing).

- **[MINOR]** _typography_ (line ~334): Desktop caregiver sidebar wordmark (.cg-side .wordmark) is 26px, which does not match any type scale token. The base .wordmark is 24px (matching --text-2xl) and the desktop homebar .wordmark is 30px (matching --text-3xl), but 26px is between tokens.
  - Fix: Change .cg-side .wordmark font-size to either 24px (--text-2xl, matching base .wordmark) or 30px (--text-3xl), or add 26px as a recognized intermediate value in the type scale.

- **[MINOR]** _responsive-breakpoints_ (line ~37): A @media (max-width:560px) breakpoint exists for legacy demobar styles (.demobar .note hidden, button font-size reduced) but is not documented in any frontend-spec file. While labeled 'legacy demo bar styles kept for reference,' it is still active CSS that could affect rendering.
  - Fix: Either remove the legacy demobar 560px media query from styles.css (since the demobar is superseded by the canvas design override at line 283), or document it in the spec as a legacy breakpoint retained for the demo bar.

### entitlements.md (3 issues)

- **[MAJOR]** _Lomi feature tier gating_ (line ~400): Section 6 'Router to Feature Mapping' (Care Records Pillar -- Lomi AI, lines 400-406) lists only lomi.draft, lomi.transcribe, and lomi.summarize. It is missing lomi.edit (per-box section rewrite) and lomi.route (chat message routing), both of which are defined as production endpoints in ai-pipeline.md (POST /api/lomi/edit at line 632, POST /api/lomi/route at line 658) and are described as migrating to SvelteKit server routes (tRPC) in the migration table (ai-pipeline.md line 829). Without entries in the router-to-feature mapping, these procedures have no specified feature gate, minimum role, or audit requirement.
  - Fix: Add two rows to the Lomi AI router-to-feature mapping table in entitlements.md: lomi.edit gated by lomi_drafting with min role caregiver, and lomi.route gated by lomi_drafting with min role caregiver. Both are part of the note drafting workflow and should share the lomi_drafting gate.

- **[MAJOR]** _Subscription tier feature mapping_ (line ~478): Reports scope mismatch: prd.md distinguishes Professional ('All Care Records reports') from Complete ('All CSV report types') with two separate entitlement rows (lines 218 and 226), but entitlements.md grants the same `reports` flag to both tiers and the report.generate procedure says 'Professional+ agencies can generate all types' -- a Professional agency could generate intake or audit report types that prd.md reserves for Complete only.
  - Fix: Either split the `reports` flag into `reports_care` (Professional+) and `reports_all` (Complete only), or add type-level restrictions in the report.generate procedure that limit Professional to Care Records report types (notes, incidents, MAR, goals, attendance) while allowing Complete to generate all types including intake and audit reports.

- **[MINOR]** _Subscription tier feature mapping_ (line ~39): Four features referenced in the verification list (lomi_edit, integrations, api_access, custom_branding) do not exist as feature flags in either prd.md or entitlements.md. lomi_edit is subsumed by the charting flag; integrations and api_access are not tiered; custom_branding does not exist (charting presets are available to all tiers). If these are intended future features, they need to be added to both documents with tier assignments.
  - Fix: If these features are planned, add them to both the prd.md Subscription Tiers table and the entitlements.md Feature Registry with explicit tier assignments. If they are not planned, no action is needed.

### offline-sync.md (3 issues)

- **[MAJOR]** _offline-architecture-matches-constitution_ (line ~59): offline-sync.md attributes a quote to 'Principle 11' but constitution.md Principle 11 is 'Charting presets are cosmetic only.' The quoted content is actually part of Principle 3 in the constitution, reworded. This is a fabricated principle number.
  - Fix: Change the quote attribution from 'Principle 11' to 'Principle 3' and use the actual text from constitution.md, or remove the separate quote and fold the content into the Principle 3 quote.

- **[MAJOR]** _offline-architecture-matches-constitution_ (line ~59): Scope mismatch: the fabricated 'Principle 11' says 'no online-only features in the core product pillars' but constitution.md Principle 3 actually says 'no online-only features in the caregiver-facing documentation workflows.' These have different scopes -- the offline-sync version is broader than what the constitution actually promises.
  - Fix: Use the constitution's actual wording: 'caregiver-facing documentation workflows' instead of 'core product pillars'.

- **[MINOR]** _offline-architecture-matches-constitution_ (line ~57): The Principle 3 quote uses different wording than the actual constitution.md text. Constitution says 'sync via server-authoritative last-write-wins on reconnect' but offline-sync.md quotes it as 'replayed against the server on reconnect using server-authoritative last-write-wins'. Quotes should be verbatim.
  - Fix: Replace the Principle 3 quote block with the exact text from constitution.md Principle 3.

### schema.ts (2 issues)

- **[CRITICAL]** _incident-type-enum-consistency_ (line ~53): Incident SEVERITY enum uses lowercase values ('low', 'medium', 'high') in the Postgres schema, but all UI code (app-caregiver.js line 208) and business logic (app-core.js line 99) use title-case ('Low', 'Medium', 'High'). A title-case value written to the database would fail the Postgres enum constraint.
  - Fix: Align casing: either change schema.ts to title-case ('Low', 'Medium', 'High') to match UI/business logic, or lowercase the values in app-caregiver.js and app-core.js to match the schema. Since incident types already use title-case in the schema (e.g., 'Seizure', 'Medication error'), changing the severity enum to title-case ('Low', 'Medium', 'High') is more consistent.

- **[MAJOR]** _tRPC input/output types match schema_ (line ~894): schedule_slots unique index is on (agency_id, day, shift, home_id, assigned_to) but tRPC schedule.setSlot describes an upsert using a unique index on (agency, day, shift, home) without assigned_to. The 5-column index allows multiple caregivers per slot, making the described upsert impossible since no matching unique constraint exists on only 4 columns.
  - Fix: If the intent is one caregiver per shift/home/day, change the unique index to (agency_id, day, shift, home_id) without assigned_to. If multiple caregivers per slot is intentional, rewrite the tRPC spec to use insert+delete instead of upsert.

### ai-pipeline.md (1 issues)

- **[MAJOR]** _Lomi feature tier gating_ (line ~377): The summary task spec defines output as plain text only (lines 377-391: 'Output: Plain text, 2-4 sentences') and the endpoint response schema is { text: string, fallback: boolean } (lines 698-699). Neither reflects the basic-vs-enhanced split required by the PRD and entitlements.md. The PRD (prd.md line 178) says Professional gets 'Basic (text only)' and Complete gets 'Enhanced (with highlights and recommendations)'. entitlements.md (line 406) says the procedure checks analytics_advanced to control output richness, and its integration tests (lines 1222-1278) expect a response with { summary, highlights } where Professional returns highlights:[] and Complete returns non-empty highlights. An implementer building from ai-pipeline.md alone would produce a single-mode summary endpoint with no highlights field, breaking the tier differentiation.
  - Fix: Add an enhanced output schema to the summary task spec and endpoint in ai-pipeline.md. The response should be { summary: string, highlights: Array<{ text: string }>, recommendations: Array<{ text: string }>, fallback: boolean }. Document that when the caller's agency lacks analytics_advanced, highlights and recommendations are returned as empty arrays.

### app-core.js (1 issues)

- **[CRITICAL]** _status-enum-consistency_ (line ~99): incident_severity case mismatch: notifRules() compares sev==="High" (capital H) but schema.ts defines incident_severity enum as lowercase ['low', 'medium', 'high']. The high-severity notification rule (adding State reporting system) will never trigger because "high" !== "High".
  - Fix: Change line 99 in app-core.js from sev==="High" to sev==="high" to match the lowercase enum values in schema.ts.

### lint.js (1 issues)

- **[MINOR]** _lint-passes_ (line ~122): Linter check #3 (timestamps) flags audit_log for missing updated_at column, but audit_log is intentionally append-only (constitution principle, CLAUDE.md rule: 'NO deleting MAR records', audit immutability). The linter should exempt audit_log from the updated_at requirement, just as check #2 already exempts 'agencies' from requiring agency_id.
  - Fix: Add 'if (tbl === "audit_log") continue;' before the updated_at check on line 122, or broaden the timestamp check to skip tables documented as append-only.

### design-system.md (1 issues)

- **[MAJOR]** _Dark mode color tokens_ (line ~45): Claims dark mode is 'Applied via [data-theme="guad-dark-off"] or prefers-color-scheme: dark' but styles.css line 9 disables the prefers-color-scheme path with an 'and (max-width:0px)' guard, making it dead code. Only data-theme="guad-dark-off" actually activates dark mode.
  - Fix: Change line 45 to: 'Applied via [data-theme="guad-dark-off"]:'  Remove the 'or prefers-color-scheme: dark' claim, or note that the media query is intentionally disabled in the current MVP.
