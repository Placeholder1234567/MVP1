# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel (PR206) is awaiting validation after integrating the report-test correction. Its production exclusion and development preview phases both passed on the preceding commit.
- Sign-out work preservation (PR227) includes explicit draft/refused-write warnings, fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended. Its latest browser cases require CI validation.
- Development notification controls add explicit synthetic test requests for the caller and an agency-scoped history view. Provider guards remain mandatory; queued does not mean delivered.

## Remaining engineering work

1. Complete pending PR validation and merges; all four gates must pass on each final commit.
2. Inspect and explicitly fire only authorized synthetic delayed notification jobs in the guarded development panel. Process timers are volatile across restart; never imply durable scheduling.
3. Separate carrier STOP suppression from ordinary SMS preferences before adding any agency-required supervisor SMS policy. Existing opt-outs must remain protected during migration.
4. Persist original Lomi observations and the edit ledger in encrypted device storage for reconnect recovery after reload. Keep account/home/person binding, human review and signatures; never use browser key/value storage for PHI.
5. Implement the intake spec's explicit needs/certifications placement matching. The current comparison shows room availability and requires human review; it does not infer clinical eligibility from referral narrative.
6. Implement agency offboarding with access shutdown and retention holds, without deleting immutable audit or clinical history. Actual account/data operations need an authorized operator workflow.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.
