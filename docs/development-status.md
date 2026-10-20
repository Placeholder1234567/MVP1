# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel, synthetic tests/history and scoped local timer controls are merged (PR206/229/230), with all four final-commit gates passing. Timers remain volatile across restart.
- Sign-out work preservation (PR227) is merged after all four exact-head gates passed. It includes fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended.
- Carrier-state separation and required supervisor SMS are merged (PR232/233), with all four final-commit gates passing. STOP, conservative legacy suppression and verified START/current-role/current-number checks remain enforced. No production migration or provider execution has occurred.
- Encrypted Lomi reload recovery is implemented in a follow-up branch awaiting validation. It uses local-only encrypted `care_drafts`, scoped source/edit metadata, explicit resume and separate human Use/signing. Signing invalidates delayed writers before clearing recovery.
- The duplicate delivery claim precision fix is merged (PR231), with a concurrent single-send integration assertion and all four gates passing.
- Operator agency offboarding is implemented in PR235 awaiting final validation; default preview, exact agency confirmation, access block, identity-disable retry/lease and an application retention hold preserve clinical/audit records. No actual agency was offboarded.

## Remaining engineering work

1. Complete pending PR validation and merges; all four gates must pass on each final commit.
2. Validate encrypted Lomi reload recovery, including actual device reload/PIN and edit-preservation flows; never use browser key/value storage for PHI.
3. Finish the intake spec's explicit needs/certifications placement matching. Work in progress records reviewed needs separately from narrative; human placement review remains required.
4. Validate agency offboarding with access shutdown and retention holds, without deleting immutable audit or clinical history. Actual account/data operations need an authorized operator workflow.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.
