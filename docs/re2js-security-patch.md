# RE2JS production dependency patch

On October 28, 2026, main `ea44ac8c9ff0cf921b46a819e9c84370024c12fc` failed its production audit in CI run `40786989343`, core job `123162541283`. The job stopped before lint, types and units. PR316's earlier successful audit is an earlier advisory snapshot, not evidence that this later main run passed. PR316 changes only workflow token permissions; the failure reports a newly indexed dependency advisory.

## Scope and reachability

The locked path is `firebase@13.0.0 -> @firebase/firestore@4.18.0 -> re2js@2.8.6`. Firestore declares `re2js: ^2.8.3`, so the patched 2.8.7 release fits its existing range. The npm CLI generated the change to this one lock node; `package.json`, Firebase and every other locked package remain unchanged. RE2JS's updated Node minimum is 20; Guad already requires 24.12 or later.

[GHSA-gg6h-894w-4m9c](https://github.com/advisories/GHSA-gg6h-894w-4m9c) identifies quadratic-time repeated matching with opt-in lookbehind support in versions 2.2.0 through 2.8.6. The [maintainer's 2.8.7 release](https://github.com/le0pard/re2js/releases/tag/2.8.7) includes its fix. This is a production-graph finding; source searches found no direct Guad import of Firestore or RE2JS and no use of `LOOKBEHINDS`. That bounds the inspected source, but does not prove every transitive path unreachable. No denial of service through Guad, live-provider behavior or patient-data exposure is claimed as reproduced.

## Validation and remaining work

A fresh production-only audit on the patched lock reports zero findings. The development-inclusive audit reports eleven package records: seven moderate and four low, with no high or critical findings. The low records are Svelte tooling and deepmerge; the moderate records remain the OpenTelemetry/PubSub/Firebase CLI and legacy esbuild/Drizzle chains. These are not waived or claimed fixed. No broad audit fix, forced override, major replacement or audit-threshold change is included.

All 602 units, full lint/types (zero errors or warnings), spec and diff checks pass locally. The remaining meaningful compatibility checks are build/PWA/artifact checks, synthetic Auth/PowerSync/SQL RLS integration, both desktop/phone production and development browser suites and unchanged performance budgets. All five CI jobs must pass on the exact final head before merge. No local database, browser, real provider, deployment or infrastructure action is authorized or executed for this patch.

Next: finish and inspect those final-head checks, fix actual failures without weakening assertions, merge with an expected-head guard, and verify raw merged state and main. Retain the exact candidate and results for the M1 review. The existing owner decisions and live model/STT/usability/physical-device/operational acceptance gaps remain open; a clean dependency audit does not accept M1 or establish clinical suitability.
