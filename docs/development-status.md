# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel and controls are merged (PR206, PR229, PR230). Core, database/RLS, production/development browser and performance checks passed on each final commit. Local timers remain volatile across restart.
- Sign-out work preservation is merged (PR227), including cancel/reload/PIN recovery and failed server-session cleanup browser cases. All four final-commit gates passed.
- The duplicate delivery claim precision fix is merged (PR231), with a concurrent single-send integration assertion and all four gates passing.
- Carrier-state separation and required supervisor SMS are merged (PR232/233) after all four gates passed. Legacy suppression and verified START/current-policy/current-role/current-phone semantics are explicit; no real account migration or provider execution has occurred.
- Encrypted Lomi reload recovery (PR234) is implemented in a follow-up branch awaiting final validation, preserving explicit resume, separate Use/signature and scoped encrypted storage.
- Guarded operator offboarding is merged (PR235), with all four final-commit gates passing. Default preview, exact confirmation, access block, retryable identity revocation and an application retention hold preserve clinical/audit records; no actual agency was offboarded.
- Intake matching is implemented in a follow-up branch awaiting validation. Reviewed medication-certified-staff needs are separate from narrative. Bounded caller-visible room and active assigned certified-caregiver facts inform human review, never automatic clinical eligibility or placement.

## Remaining engineering work

1. Complete pending PR validation and merges; all four gates must pass on each final commit.
2. Validate encrypted Lomi original-observation/edit-ledger recovery through reload/PIN and home isolation; never use browser key/value storage for PHI.
3. Validate intake explicit needs/certification facts and fresh human admission guidance, including migration on a fresh isolated CI database.
4. Preserve offboarding access/retention safeguards. Actual operations require an authorized operator and exact agency confirmation; infrastructure retention/disposal evidence remains separate.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.
