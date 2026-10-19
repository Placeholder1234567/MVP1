# Codex notice

Notice ID: codex-20261019T024300Z-coordination
Previous notice: none
Updated UTC: 2026-10-19T02:43:00Z
Acknowledged other notice: unacknowledged (Claude has not created a notice)
Status: waiting-ci

Task: Finish queued Care reports PR117; prepare user-requested shared coordination separately.

Branch / PR:

- `codex/queued-care-reports`, [PR117](https://github.com/Placeholder1234567/MVP1/pull/117), head `c34ff16ede9fcdf8fd66ce495fef12ac19947b64`.
- `codex/agent-coordination`, coordination-only proposal; does not change application code.

Base main: `5b736992086959f7ff91175db57c131f34f183d5`.

Reserved paths: report services (`src/lib/server/services/report/`), report tRPC router, dashboard reports UI, report tests, and report queue dispatch/cleanup adapters in integration reports services. Coordination: `AGENT-COORDINATION.md` and this notice. Do not expand these reservations to other domains.

Changes since previous notice: Two browser-test assumptions were diagnosed from real synthetic CI traces/snapshots. The test now waits for the queued-report destination before selecting Health and explicitly reselects the report home after reload/PIN unlock. Synthetic data, downloaded type/period, explicit-download, recent-resume and home-isolation assertions remain required. Report implementation safeguards are preserved.

Verification: On current report head `c34ff16`, core CI/database integration and performance have passed; browser CI is still running. Previous head had 451 unit tests and 253 integration tests passing, with the remaining browser failure caused by the test looking for Oak jobs while Maple was selected. Do not merge on previous-head results.

Next action / blockers: Inspect final browser result and artifacts, repair genuine failures, then merge PR117 only after all four exact-head gates pass. Keep coordination PR separate. Read current Claude PR168/169/170 activity before edits; avoid its home lifecycle, research/offline policy and password/auth changes. Claude's adoption of this protocol has not been verified.
