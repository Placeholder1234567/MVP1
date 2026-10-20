# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel, synthetic tests/history and scoped local timer controls are merged (PR206/229/230), with all four final-commit gates passing. Timers remain volatile across restart.
- Sign-out work preservation (PR227) includes explicit draft/refused-write warnings, fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended. Its latest browser cases require CI validation.
- Carrier-state separation is merged (PR232), protecting STOP and conservative legacy suppression. Required supervisor SMS is in PR233 awaiting final browser validation. No production migration or provider execution has occurred.
- Encrypted Lomi reload recovery is implemented in a follow-up branch awaiting validation. It uses local-only encrypted `care_drafts`, scoped source/edit metadata, explicit resume and separate human Use/signing. Signing invalidates delayed writers before clearing recovery.

## Remaining engineering work

1. Complete pending PR validation and merges; all four gates must pass on each final commit.
2. Finish PR233 validation for required supervisor SMS, preserving verified consent, current policy/role/phone checks and STOP protection.
3. Validate encrypted Lomi reload recovery, including actual device reload/PIN and edit-preservation flows; never use browser key/value storage for PHI.
5. Implement the intake spec's explicit needs/certifications placement matching. The current comparison shows room availability and requires human review; it does not infer clinical eligibility from referral narrative.
6. Implement agency offboarding with access shutdown and retention holds, without deleting immutable audit or clinical history. Actual account/data operations need an authorized operator workflow.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.
