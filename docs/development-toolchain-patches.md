# Compatible development-tool dependency updates

A development-inclusive audit after the Nodemailer fix reported eleven package records: nine moderate and two high. `npm explain` located the patchable findings beneath Firebase CLI, its Express/JSON-schema dependencies and optional node-gyp tooling. They are development dependencies, not a production-vulnerability count.

The npm CLI updated only these six locked nodes, within the existing parent ranges. `package.json`, Firebase CLI, Drizzle Kit, OpenTelemetry and all production dependency versions are unchanged.

| Dependency path                  | Before | After  |
| -------------------------------- | ------ | ------ |
| body-parser (Firebase/Express 4) | 1.20.8 | 1.20.9 |
| body-parser (MCP SDK/Express 5)  | 2.3.0  | 2.4.0  |
| fast-uri (CLI JSON schema tools) | 3.1.8  | 3.1.9  |
| qs (CLI HTTP/query tools)        | 6.16.0 | 6.16.2 |
| undici (Firebase CLI)            | 6.29.0 | 6.29.1 |
| undici (optional node-gyp)       | 8.11.2 | 8.12.3 |

Upstream advisory boundaries identify patched versions for [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) and [undici](https://github.com/advisories/GHSA-xjj6-f33q-929c). This change uses compatible selected versions rather than `npm audit fix --force`, a CLI/Drizzle downgrade or a major OpenTelemetry override. Body-parser 2.4.0 also raises three dependency requirements; their existing locked versions already satisfy them, so no additional package version changed.

## Current evidence and limits

On this lockfile, production-only audit reports zero findings. Development-inclusive audit reports seven moderate package records and zero high findings. The remaining records are the OpenTelemetry/Core/PubSub/Firebase CLI chain and the legacy esbuild/core-utils/esm-loader/Drizzle Kit chain. These are still findings, not waived or claimed fixed. Review their actual development-tool exposure and compatible upstream options separately; do not substitute a forced major replacement for a tested fix.

All 597 unit tests and full lint/types pass locally with zero errors or warnings; spec and diff checks pass. No new application regression tests mirror these external libraries. The meaningful toolchain checks remain the existing GitHub CI jobs: database/Auth emulator/PowerSync integration and SQL RLS, both desktop/phone production/development browser suites, build/PWA/artifact checks and unchanged performance budgets. All five jobs must pass on the exact final head before merge. No local database, browser, real provider, deployment or infrastructure action was executed.

This candidate includes the DST evidence from PR306 and the production Nodemailer patch from PR307; merge those dependencies first. After final-head validation, retain its immutable SHA and review the M1 workflow register. Owner decisions on intake scope, scheduled-report access and payroll period/offline sequence remain open. Live AI/STT quality, staff usability, physical devices and operational/provider evidence still need separately authorized evaluation. The audit improvement does not certify clinical suitability, compliance or milestone acceptance.
