# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel and controls are merged (PR206, PR229, PR230). Core, database/RLS, production/development browser and performance checks passed on each final commit. Local timers remain volatile across restart.
- Sign-out work preservation (PR227) includes explicit draft/refused-write warnings, fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended. Its latest browser cases require CI validation.
- The duplicate delivery claim precision fix is merged (PR231), with a concurrent single-send integration assertion and all four gates passing.
- Carrier-state separation and required supervisor SMS are implemented in follow-up branches awaiting final validation. Legacy suppression and verified START semantics are explicit; no real account migration or provider execution has occurred.

## Remaining engineering work

1. Complete pending PR validation and merges; all four gates must pass on each final commit.
2. Finish carrier-state and required supervisor SMS validation; preserve STOP, conservative legacy suppression, current policy/role/number checks and read-only preview behavior.
4. Persist original Lomi observations and the edit ledger in encrypted device storage for reconnect recovery after reload. Keep account/home/person binding, human review and signatures; never use browser key/value storage for PHI.
5. Implement the intake spec's explicit needs/certifications placement matching. The current comparison shows room availability and requires human review; it does not infer clinical eligibility from referral narrative.
6. Validate the operator offboarding increment: preview by default, exact-ID execution confirmation, database access block, identity-disable retries and application retention hold, without deleting immutable audit/clinical history. Infrastructure retention verification and actual account operations remain operator responsibilities; no production action has been performed.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.
