# Payroll daylight-saving boundary evidence

Baseline: combined main `53af0a9ec99d7d219a3156e61a680b0db1fecfb9`, after verified merges of push lifecycle PR303, spoken Lomi follow-up PR304 and AI storage-claim correction PR305. This increment addresses the explicit elapsed-time boundary test gap in the M1 index. This was the elapsed-time increment in merged PR306; it did not choose payroll input timezone policy. The later PR320 decision and its separate evidence are recorded below.

The existing timesheet service receives absolute Date instants, clips completed records to the requested period and categorizes elapsed hours. Three unit scenarios in `tests/unit/domain/payroll-bounds.test.ts` exercise explicit UTC-offset changes:

- A spring-forward overnight period contains seven elapsed hours despite eight nominal wall-clock hours. Its manual entry crosses from 01:30 to 03:30 and contributes one hour.
- A fall-back overnight period contains nine elapsed hours. A manual entry between two 01:30 wall-clock labels with different offsets also contributes one hour.
- A report from the first 01:30 to the second 01:30 clips a longer record to exactly one elapsed hour rather than treating the period as empty.

The overnight cases preserve verified, manual and unverified categories, exclude an unfinished punch, clip both period boundaries and leave source timestamps unchanged. The database query is mocked, so this evidence does not establish database selection, RLS, browser date-input conversion or physical-device behavior. The PR306 elapsed-time increment changed no production service, query, clock sequence, export, role or authorization.

## Validation and remaining decisions

On the combined baseline, all six focused payroll tests and the full 593-unit suite passed locally, with zero lint/type errors or warnings; spec and diff checks passed. Earlier results from a different baseline are not used as candidate evidence. PR306 is merged; do not re-open that historical validation as pending. Every current candidate still requires all five exact-head CI jobs across core, database/Auth/PowerSync plus SQL RLS, desktop and phone production/development browser/axe, and unchanged performance budgets. Inspect actual failures without weakening assertions or retrying blindly.

## Agency-time input decision and review evidence

Merged PR320 final `d0fa0d9da7280a8fa3fbbe9e711cd11a85f124dc` uses `agencies.timezone` for typed report periods, manual entries, clock-out corrections and displayed times. `typedInstant` refuses a nonexistent spring-gap wall time rather than silently moving it. A repeated wall time chooses the earlier occurrence, and the form states that rule. The shared reminder `localInstant` behavior is unchanged.

Review first reproduced New York `2026-03-08T02:30` silently becoming `01:30`, then Berlin and Lord Howe overlaps choosing the second occurrence despite the first-occurrence promise. The final head fixes those cases. Six unit tests in `tests/unit/domain/typed-instant.test.ts` cover ordinary input, gap boundaries, repeated times east and west of UTC, a half-hour offset change, malformed input and a no-DST zone. Eight independent pure-function assertions also passed; none executed a database or browser locally.

All five final-head jobs and logs passed: [core/database](https://github.com/Placeholder1234567/MVP1/actions/runs/41257651062) (608 units, zero lint/type errors or warnings, 356 integration tests plus 84 SQL RLS checks, spec/schema and build/PWA/artifacts), [both browsers](https://github.com/Placeholder1234567/MVP1/actions/runs/41257651049) (desktop 133 production passes/three exclusions plus one development pass; phone 118 production passes/18 exclusions plus one development pass), and [unchanged performance](https://github.com/Placeholder1234567/MVP1/actions/runs/41257651050). PR320 merged as `3af563fd6bd9949407495a4894cee488b7e63288`; these PR-head results do not establish every later combined main's result.

The recorded agency-time decision replaces the earlier unanswered device-versus-agency policy question. Acceptance of an immediate offline clock-in after a queued clock-out remains open, and the entire timekeeping workflow still requires explicit owner acceptance. Typed-input and elapsed-time checks are separate evidence; neither accepts the workflow.

After this bounded validation and any confirmed failures, preserve one immutable candidate SHA and reconcile its five job results with the ten M1 workflow rows. Recorded intake, scheduled-report and typed-time decisions are indexed in `m1-evidence.md`; explicit workflow acceptance and review of the offline punch sequence remain necessary. Live model/STT accuracy, staff task usefulness and physical/provider/operational evidence require separately authorized evaluation; synthetic CI is not that proof. No AI promise, clinical suitability, security certification or completion percentage is accepted by this evidence addition.
