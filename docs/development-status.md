# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel and controls are merged (PR206, PR229, PR230). Core, database/RLS, production/development browser and performance checks passed on each final commit. Local timers remain volatile across restart.
- Sign-out work preservation (PR227) includes explicit draft/refused-write warnings, fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended. Its final-head core, database/RLS, browser and performance checks passed before merge.
- The duplicate delivery claim precision fix is merged (PR231), with a concurrent single-send integration assertion and all four gates passing.
- Carrier-state separation and required supervisor SMS are merged after all four final-head checks passed. Legacy suppression and verified START semantics are explicit; no real account migration or provider execution has occurred.

- Intake matching is merged in PR236 after all four final-head gates passed (525 units, 318 integration tests, SQL RLS, 133 production and 2 development browser passes). Explicit medication-certified-staff needs remain separate from narrative; bounded room and active assigned certified-caregiver facts inform human review, never automatic eligibility or placement.
- Returned-note signing feedback is fixed in merged PR238: fresh upload status after local saves and before online resubmission, disabled signing while unsettled, and a real held-upload regression preserving all signature/history assertions. All four final-head gates passed.

## Remaining engineering work

1. Validate the bounded CSV/JSON coverage-log increment: account-bound POST, current-home/profile/plan checks, existing RLS, source caps, explicit download and scope/lock response guards. It exports requests, candidates, activity and visible notification records. Supervisor notification visibility remains own-recipient-only; this is not a complete cross-recipient delivery ledger. See coverage-export.md.
2. A complete supervisor offer/delivery ledger needs a safe source design rather than privilege elevation or broader notification RLS. Candidate eligibility is not proof of an offer or delivery; unavailable historical evidence remains unknown. Audit metadata CSV and timesheet clock exports already exist; do not duplicate them.
3. Reconcile progressive feature-reveal thresholds with the MVP before gating tools currently available from the start. PDF branding and broader font/history targets require current data and asset review; never invent unavailable historical evidence.

Encrypted original Lomi observations and edit-ledger recovery (PR234), operator offboarding/application retention hold (PR235), and report-interface technical documentation (PR237) are merged with all four final-head gates passing. Offboarding does not establish infrastructure retention/disposal or offline-device erasure. No real account or provider action has occurred.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.

## Encrypted Lomi recovery increment

PR234 implements encrypted local-only original-observation and review-ledger recovery, with explicit resume, binding to account/home/person/note period and ID, protected caregiver edits after Use, and signature clearing that invalidates delayed writers. The composer waits for the resolved existing note context and appears only in the person's current home. No AI call or clinical note change happens merely by loading recovery. All four final-head cloud gates passed before merge; synthetic browser failures are repaired without removing reload/PIN/edit-preservation assertions. This increment does not add PHI to browser key/value storage.
