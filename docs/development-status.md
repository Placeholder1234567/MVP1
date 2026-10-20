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

- Intake matching is implemented in PR236 awaiting all four final-head gates. Explicit medication-certified-staff needs remain separate from narrative; bounded room and active assigned certified-caregiver facts inform human review, never automatic eligibility or placement.

## Remaining engineering work

1. Complete PR236 intake placement validation. The new desktop/phone intake cases pass; a returned-note resubmission browser failure exposed stale queue feedback. A separate fix refreshes the upload count after draft saves and before signing, blocks returned-note signing while sync is unsettled, and holds a real upload in the version-history regression. All four final-head gates remain required before either increment merges.
2. Add the confirmed coverage-log export target (frontend-spec-3 §4.5) after reconciling current source, tenant/home visibility, bounded output and phone privacy. Candidate eligibility is not proof of an offer or delivery. Audit metadata CSV and timesheet clock exports already exist; do not duplicate them.
3. Reconcile progressive feature-reveal thresholds with the MVP before gating tools currently available from the start. PDF branding and broader font/history targets require current data and asset review; never invent unavailable historical evidence.

Encrypted original Lomi observations and edit-ledger recovery (PR234), operator offboarding/application retention hold (PR235), and report-interface technical documentation (PR237) are merged with all four final-head gates passing. Offboarding does not establish infrastructure retention/disposal or offline-device erasure. No real account or provider action has occurred.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.

## Encrypted Lomi recovery increment

PR234 implements encrypted local-only original-observation and review-ledger recovery, with explicit resume, binding to account/home/person/note period and ID, protected caregiver edits after Use, and signature clearing that invalidates delayed writers. The composer waits for the resolved existing note context and appears only in the person's current home. No AI call or clinical note change happens merely by loading recovery. All four final-head cloud gates passed before merge; synthetic browser failures are repaired without removing reload/PIN/edit-preservation assertions. This increment does not add PHI to browser key/value storage.
