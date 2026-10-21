# Implementation status

This technical checkpoint describes repository behavior and remaining work. It is not production-readiness certification. Validate current branch heads and CI before acting on it.

## Implemented

Core care records, explicit review/signatures, goal trials, MAR and controlled counts, expanded health, incidents, scheduling/coverage, timekeeping/payroll exports, intake/admission, messages, bounded reports, analytics, imports and administration have implementations and automated coverage. Queued Care reports and active-review reconnect drafting are merged; preserve their ownership, revocation, atomic publication, cleanup and edit-preservation guards.

## Current increments

- Coverage and queued Care downloads now invalidate at navigation start, closing the same transition window found in immediate Care exports. Queued views abort outstanding UI requests and forget local job/list references without cancelling server work. Four new desktop/phone regressions hold real coverage/prepared-file responses while the destination route remains blocked and require zero downloads before navigation finishes. Final-head cloud validation is required before merge.

- Timesheet loads and payroll downloads use the existing in-memory response guard and abort on account/home/privacy/view changes, clear reports on scope changes, preserve offline dates and retain the loaded export period despite later form edits. New held-real-response desktop/phone tests cover loads, downloads, home-away/back, lock, navigation, loaded-period JSON, offline controls, axe and overflow. Final-head cloud validation is required before merge.

PR245 merged after all four final-head gates passed (528 units, 326 integration tests plus SQL RLS, 155 production and 2 development browser passes, performance). Its initial browser run passed all ten new Timesheets cases but found an immediate Care navigation race: a held response could complete after navigation started and before the old page was disposed. Care and Timesheets invalidate pending responses in `beforeNavigate` as well as on disposal. Their strengthened navigation regressions hold the destination's real route-data request, release the report while the transition is still pending and require zero downloads before allowing navigation to finish. Original scope/period/privacy assertions remain.

- Immediate Care downloads use the existing in-memory report guard and request abort on privacy/view/account/scope changes. Submitted period/format metadata is captured before waits; offline controls retain form dates. Held real server-response regressions run on desktop and phone in cloud CI for home-away/back, lock, navigation and edited dates.

PR244 merged after all four final-head gates passed: 528 units, 326 integration tests plus SQL RLS, 145 production and 2 development browser passes, and performance. Its eight new desktop/phone cases passed without weakening the privacy or captured-period assertions.

- Basic reporting plans can export coverage CSV with current account/home/plan checks; JSON and Care reports still require full reporting. The Reports page shows the clinical form only with full report access. This corrects the endpoint's earlier mismatch with the Starter `reports_basic` entitlement.
- Email transient-bounce accounting uses stable agency/delivery/address identities so callback replay cannot turn one failed message into three failures. Concurrent duplicate inserts are idempotent; three distinct bounced messages still trigger the existing 24-hour suppression rule. Historical counts and suppressions are not rewritten. PR242 merged after all four gates passed, including callback replay and concurrency integration regressions. Basic coverage CSV access in PR243 also passed all four gates before merge.

- Refused upload operation matching, correct-PIN failure handling and deterministic report-audit assertions are merged (PR225, PR226, PR228).
- The guarded development notification panel and controls are merged (PR206, PR229, PR230). Core, database/RLS, production/development browser and performance checks passed on each final commit. Local timers remain volatile across restart.
- Sign-out work preservation (PR227) includes explicit draft/refused-write warnings, fail-closed inventory reads, bounded server cleanup and accurate warnings when the server session cannot be confirmed ended. Its final-head core, database/RLS, browser and performance checks passed before merge.
- The duplicate delivery claim precision fix is merged (PR231), with a concurrent single-send integration assertion and all four gates passing.
- Carrier-state separation and required supervisor SMS are merged after all four final-head checks passed. Legacy suppression and verified START semantics are explicit; no real account migration or provider execution has occurred.

- Intake matching is merged in PR236 after all four final-head gates passed (525 units, 318 integration tests, SQL RLS, 133 production and 2 development browser passes). Explicit medication-certified-staff needs remain separate from narrative; bounded room and active assigned certified-caregiver facts inform human review, never automatic eligibility or placement.
- Returned-note signing feedback is fixed in merged PR238: fresh upload status after local saves and before online resubmission, disabled signing while unsettled, and a real held-upload regression preserving all signature/history assertions. All four final-head gates passed.

## Remaining engineering work

1. The bounded CSV/JSON coverage-log increment is merged in PR239 after all four exact-head gates passed (526 units, 321 integration tests plus SQL RLS, 137 production and 2 development browser passes, performance). It provides account-bound POST, current-home/profile/plan checks, existing RLS, source caps, explicit download and scope/lock response guards. It exports requests, candidates, activity and visible notification records. Supervisor notification visibility remains own-recipient-only; this is not a complete cross-recipient delivery ledger. See coverage-export.md.
2. Prospective coverage-offer evidence is implemented as a content-free, append-only home ledger with separate queued, provider-accepted, delivery-reported and terminal events. It never widens personal notification RLS and has no historical backfill. Provider acceptance remains distinct from delivery, and providers without callbacks cannot establish device delivery. Audit metadata CSV and timesheet clock exports already exist; do not duplicate them.
3. Reconcile progressive feature-reveal thresholds with the MVP before gating tools currently available from the start. PDF branding and broader font/history targets require current data and asset review; never invent unavailable historical evidence.

Encrypted original Lomi observations and edit-ledger recovery (PR234), operator offboarding/application retention hold (PR235), and report-interface technical documentation (PR237) are merged with all four final-head gates passing. Offboarding does not establish infrastructure retention/disposal or offline-device erasure. No real account or provider action has occurred.

## Release evidence still required

Safari/Firefox encrypted-storage behavior, physical-device push delivery, external security assessment, signed provider BAAs and covered-service verification require evidence beyond the synthetic Chromium/emulator checks. Repository checklist text is not proof those prerequisites are satisfied. Deployments, real providers, infrastructure provisioning and purchases are outside the current development authorization.

## Encrypted Lomi recovery increment

PR234 implements encrypted local-only original-observation and review-ledger recovery, with explicit resume, binding to account/home/person/note period and ID, protected caregiver edits after Use, and signature clearing that invalidates delayed writers. The composer waits for the resolved existing note context and appears only in the person's current home. No AI call or clinical note change happens merely by loading recovery. All four final-head cloud gates passed before merge; synthetic browser failures are repaired without removing reload/PIN/edit-preservation assertions. This increment does not add PHI to browser key/value storage.

## Current Care PDF identification increment

Care PDFs read and display the current tenant agency name at generation, using the same caller transaction/RLS and existing glyph refusal, output limits and clinical source rules. This covers immediate and account-owned queued Care PDFs through their shared export service, not external API PDFs. It is not historical branding, logo support or expanded font coverage. PR240 passed all four exact-final-head gates before merge. No browser rendering, provider execution or deployment is claimed.
