# Guad completion milestone

Status: proposed scope freeze, awaiting owner acceptance. Baseline: main 991ff9372abb576417e70bc083329ee234fea1d2. This is an evidence checklist, not certification or a completion percentage.

## Finish line

M1: Core engineering complete for an owner-reviewed synthetic pilot. All core workflows below have current evidence, no unresolved critical/high-impact safety, privacy, authorization or data-loss defects, and all four CI gates pass on the exact release candidate.

M2: Controlled real-agency pilot ready. M1 plus representative physical-device testing, provider delivery verification, operational recovery/retention evidence, required agreements and security review. Real data, deployment, providers and spending require separate authorization.

M3: General release ready. Controlled pilot findings resolved; onboarding, support, monitoring, incident response and business release decisions accepted by the owner.

Do not describe M1 as production readiness. No target date or percentage is defensible until the evidence inventory is complete.

## Scope control

Freeze new optional features during M1. Accept only reproducible defects, missing acceptance criteria, security/safety fixes or explicit owner-approved scope changes. Keep optional requests in a later backlog. Record each addition's reason and impact on the finish line.

Current committed work: Codex push-removal/context and browser cleanup safety; Claude staff credentials and medication-certification expiry. Review both against M1 before starting additional features.

Self-service signup, billing automation, Spanish, expanded placement matching, branding and progressive feature reveal are deferred unless the owner explicitly makes one a pilot prerequisite. Resolve scheduled-report plan access and nearby-staff location behavior before claiming the affected workflow accepted; they need not block unrelated core workflows if explicitly excluded from pilot scope.

## Core workflow evidence register

Each row starts as implemented / evidence reconciliation pending. This means code and prior automated coverage exist; it does not mean the row has passed this milestone review.

| Workflow | Required acceptance evidence |
| --- | --- |
| Agency and staff access | Provision agency; invite, sign in, role/home restrictions, deactivate and revoke access; negative cross-agency/profile tests |
| Care records and goals | Draft online/offline; reconnect; review and edit Lomi output; human signature; submit, return, correct, approve; history preserved |
| Medication administration | Scheduled/PRN/refused/held doses, immutable corrections, controlled counts and witnesses, duplicate/offline conflicts, certification policy |
| Vitals and incidents | Capture observations; threshold alerts; incident review and required follow-up; no automatic clinical submission |
| Scheduling and coverage | Assign/change/call out/fill shifts; overlapping assignment concurrency; human approval and scoped visibility |
| Timekeeping and payroll | Clock in/out, geofence failure, missed punches, correction review, overnight/time-zone boundaries, period-correct export |
| Intake | Inquiry through admission, required review, home/room scope and permissions; no unsupported automatic eligibility |
| Messaging and notifications | In-app access, preferences versus carrier STOP/START, safe payloads, retry/idempotence, device ownership and cleanup |
| Reports and exports | Correct scope/period, current authorization, revocation, bounded output, explicit download, queued ownership and expiry |
| Offline and recovery | Encrypted storage/PIN, interrupted writes, rejected writes, restart/reconnect, privacy lock, sign-out with pending work |

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

- Push removal can still complete against a changed context; browser-wide cleanup requires account-transition safety. Codex owns this unresolved issue.
- Credentials/medication certification expiry work is active under Claude. Do not count it complete until merged and validated.
- Existing status prose contains historical pending statements for merged work; reconcile against actual main rather than recreating completed features.
- Verified baseline PR281 final 0dcbe3b: CI 40397766336 (557 units, 345 integration plus SQL RLS), browser 40397766351 (220 production passes, 20 exclusions, 2 development passes), performance 40397766337. Both new nonempty push concurrency tests passed. This evidence covers that commit and those scenarios only.

## Execution order

1. Inventory current-main tests and map evidence to each workflow; classify every gap as blocker, external evidence or deferred improvement.
2. Finish the two committed workstreams; fix confirmed core blockers in small PRs.
3. Freeze one release-candidate SHA and run all four gates; inspect failures and exclusions without weakening assertions.
4. Review the completed workflow register with the owner. Declare M1 only when every required row is accepted and blockers are zero.
5. Obtain separately authorized external evidence for M2.

Report progress as accepted workflow rows / total required rows, open blockers by severity, and external gates remaining. Keep implementation, automated verification and real-world readiness separate. Update the register after each material merge; do not add tasks merely to keep development busy.

