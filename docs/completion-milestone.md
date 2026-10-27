# Guad completion milestone

Status: proposed scope freeze, awaiting owner acceptance. Inventory baseline: main 18e764f2fe75114edfb9b79be1471f99a21bc63d. Detailed evidence and open decisions are indexed in [m1-evidence.md](m1-evidence.md). This is an evidence checklist, not certification or a completion percentage.

## Finish line

M1: Core engineering complete for an owner-reviewed synthetic pilot. All core workflows below have current evidence, no unresolved critical/high-impact safety, privacy, authorization or data-loss defects, and all four CI gates pass on the exact release candidate.

M2: Controlled real-agency pilot ready. M1 plus representative physical-device testing, provider delivery verification, operational recovery/retention evidence, required agreements and security review. Real data, deployment, providers and spending require separate authorization.

M3: General release ready. Controlled pilot findings resolved; onboarding, support, monitoring, incident response and business release decisions accepted by the owner.

Do not describe M1 as production readiness. No target date or percentage is defensible until the evidence inventory is complete.

## Scope control

Freeze new optional features during M1. Accept only reproducible defects, missing acceptance criteria, security/safety fixes or explicit owner-approved scope changes. Keep optional requests in a later backlog. Record each addition's reason and impact on the finish line.

Credentials and medication-certification expiry are merged (PR284/285); their workflow evidence still needs reconciliation and reviewer acceptance. Codex merged Lomi suggestion response ownership (PR297) and complete voice-input handling (PR299); summary response/accessibility work is verified and merged in PR301. Spoken follow-up input is the current bounded acceptance increment; see `lomi-followup-voice.md`. The cross-tab push cleanup race remains open after the notification review; coordinate ownership before changing that lifecycle. These are completion work, not optional feature expansion.

Self-service signup, billing automation, Spanish, expanded placement matching, branding and progressive feature reveal are deferred unless the owner explicitly makes one a pilot prerequisite. Resolve scheduled-report plan access and nearby-staff location behavior before claiming the affected workflow accepted; they need not block unrelated core workflows if explicitly excluded from pilot scope.

## Core workflow evidence register

Each row starts as implemented / evidence reconciliation pending. This means code and prior automated coverage exist; it does not mean the row has passed this milestone review.

| Workflow                    | Required acceptance evidence                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Agency and staff access     | Provision agency; invite, sign in, role/home restrictions, deactivate and revoke access; negative cross-agency/profile tests                |
| Care records and goals      | Draft online/offline; reconnect; review and edit Lomi output; human signature; submit, return, correct, approve; history preserved          |
| Medication administration   | Scheduled/PRN/refused/held doses, immutable corrections, controlled counts and witnesses, duplicate/offline conflicts, certification policy |
| Vitals and incidents        | Capture observations; threshold alerts; incident review and required follow-up; no automatic clinical submission                            |
| Scheduling and coverage     | Assign/change/call out/fill shifts; overlapping assignment concurrency; human approval and scoped visibility                                |
| Timekeeping and payroll     | Clock in/out, geofence failure, missed punches, correction review, overnight/time-zone boundaries, period-correct export                    |
| Intake                      | Inquiry through admission, required review, home/room scope and permissions; no unsupported automatic eligibility                           |
| Messaging and notifications | In-app access, preferences versus carrier STOP/START, safe payloads, retry/idempotence, device ownership and cleanup                        |
| Reports and exports         | Correct scope/period, current authorization, revocation, bounded output, explicit download, queued ownership and expiry                     |
| Offline and recovery        | Encrypted storage/PIN, interrupted writes, rejected writes, restart/reconnect, privacy lock, sign-out with pending work                     |

For every row record: owner; exact commit; test names/CI URLs; positive and negative scenarios; desktop/phone coverage; offline and interruption coverage; exclusions; unresolved defects. An owner/reviewer must explicitly accept the row. An old passing test count is not a substitute.

## Security and operational gates

- Tenant/profile/home/role authorization: reconcile negative tests and server enforcement for every core workflow.
- Clinical integrity: verify signatures, immutable records, correction/history rules and AI review boundaries.
- Privacy: confirm encrypted local persistence, lock/sign-out behavior, no sensitive browser caches/logs, stale responses and downloads.
- Dependencies and secrets: current production audit, client artifact checks and unresolved development findings assessed.
- External evidence: representative Safari/Firefox and physical-device storage/push; real provider outcomes; external security assessment; signed agreements and covered services.
- Operations: backup/restore drill, access revocation, retention/disposal, monitoring and incident response evidence.

External evidence is currently outstanding. Repository checkboxes and synthetic CI cannot satisfy it.

## Known immediate blockers and evidence

- Cross-tab sign-out/sign-in push cleanup can cancel a newer push setup. The notification review records this as unresolved; the existing list/removal tests do not establish lifecycle safety. Held-dependency account-transition tests and a bounded fix are still needed. No wrong-recipient delivery is claimed as reproduced.
- AI section/chat response guards (PR297) and voice length handling (PR299) are merged and verified. Daily-summary response and accessibility work (PR301) is also merged and verified. Spoken follow-up input still requires its final-head browser validation.
- Intake supervisor scope, scheduled-report plan access and timekeeping period semantics remain explicit review items in the evidence index. Preserve current authorization until a decision is made.
- Existing status prose contains historical pending statements for merged work; reconcile against actual main rather than recreating completed features.
- Verified baseline PR281 final 0dcbe3b: CI 40397766336 (557 units, 345 integration plus SQL RLS), browser 40397766351 (220 production passes, 20 exclusions, 2 development passes), performance 40397766337. Both new nonempty push concurrency tests passed. This evidence covers that commit and those scenarios only.

## Execution order

1. Inventory current-main tests and map evidence to each workflow; classify every gap as blocker, external evidence or deferred improvement.
2. Complete committed validation and fix confirmed core blockers in small PRs; reconcile the remaining evidence rows without recreating merged features.
3. Freeze one release-candidate SHA and run all four gates; inspect failures and exclusions without weakening assertions.
4. Review the completed workflow register with the owner. Declare M1 only when every required row is accepted and blockers are zero.
5. Obtain separately authorized external evidence for M2.

Report progress as accepted workflow rows / total required rows, open blockers by severity, and external gates remaining. Keep implementation, automated verification and real-world readiness separate. Update the register after each material merge; do not add tasks merely to keep development busy.

## AI promise acceptance gate

AI is core scope, not an optional polish item. No promise is accepted merely because a button, mock or model call exists. Inventory actual website/demo/sales wording and map each claim to the rows below; revise unsupported wording or complete its acceptance criteria before M1. Repository/app claim surfaces are inventoried in `ai-acceptance.md`; no separate external sales site or sales collateral was supplied for review.

| Promise                         | Required evidence before acceptance                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observations to clinical draft  | Representative synthetic typed and voice observations produce the supported note sections; preserve negation, times, quantities and uncertainty; do not invent events, diagnoses, interventions or outcomes; missing evidence stays visibly missing                        |
| Section revisions and Lomi chat | Requests affect the intended section/person/note; additions preserve earlier observations and caregiver edits; corrections supersede contradictions visibly; undo/recovery and stale-response guards work                                                                  |
| Voice input                     | Full-note and section recording, permission denial, interruption, partial transcription, long recording ordering and segment boundaries; errors never silently discard observations; typed entry remains available                                                         |
| Supervisor summaries            | Authorized current source records and period only; distinguish facts from missing/unreviewed material; omit unsupported clinical conclusions; verify scope changes, sparse/conflicting records and stale responses                                                         |
| Coverage assistance             | Document whether each step is deterministic matching, templated messaging or model generation; verify current eligibility, contact/consent rules, replies and concurrent fills; retain human approval and an audit trail; do not market unimplemented autonomous decisions |
| Questions and suggestions       | Relevant to supplied observations and supported workflow; no fabricated trial levels, retrospective events or clinical decisions; users can dismiss and continue manually                                                                                                  |
| Availability and failures       | Voice/Lomi available from the start as required; clear offline/provider-outage/rate-limit behavior, useful manual fallback, preserved edits, no accidental repeat submissions or charges claimed as tested                                                                 |
| Privacy and control             | Current tenant/home/person authorization; AI labeling; explicit human review/signature; no auto-submit/approve; minimized inputs and no sensitive logs; authorized provider/model/region agreements before real data                                                       |

For each row name an owner and attach exact test/evaluation fixtures, current results, known limitations and reviewer acceptance. Include straightforward, ambiguous, contradictory, incomplete and unsafe-input cases. Set expected factual invariants and a reviewer scoring rubric before evaluating; retain failures rather than selecting only favorable examples. Record latency and failure rate against agreed targets with measured conditions.

Separate three evidence levels: deterministic/mock tests; authorized live-provider evaluation using synthetic data; controlled human-reviewed pilot. Mock success cannot establish transcription accuracy, model faithfulness, live latency or clinical suitability. Live-provider calls and spend remain separately authorized.

Known documented gap: long voice recording segmentation still needs real Chirp word-accuracy verification at segment edges. Server-side audio splitting/streaming is unbuilt and must not be promised as delivered. Current goal references are conservative; Lomi does not fill observed trial scores. No claim of live-provider AI completion is made here.
