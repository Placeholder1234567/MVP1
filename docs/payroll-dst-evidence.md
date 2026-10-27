# Payroll daylight-saving boundary evidence

Baseline: combined main `53af0a9ec99d7d219a3156e61a680b0db1fecfb9`, after verified merges of push lifecycle PR303, spoken Lomi follow-up PR304 and AI storage-claim correction PR305. This increment addresses the explicit elapsed-time boundary test gap in the M1 index. It does not choose a different payroll timezone policy.

The existing timesheet service receives absolute Date instants, clips completed records to the requested period and categorizes elapsed hours. Three unit scenarios in `tests/unit/domain/payroll-bounds.test.ts` exercise explicit UTC-offset changes:

- A spring-forward overnight period contains seven elapsed hours despite eight nominal wall-clock hours. Its manual entry crosses from 01:30 to 03:30 and contributes one hour.
- A fall-back overnight period contains nine elapsed hours. A manual entry between two 01:30 wall-clock labels with different offsets also contributes one hour.
- A report from the first 01:30 to the second 01:30 clips a longer record to exactly one elapsed hour rather than treating the period as empty.

The overnight cases preserve verified, manual and unverified categories, exclude an unfinished punch, clip both period boundaries and leave source timestamps unchanged. The database query is mocked, so this evidence does not establish database selection, RLS, browser date-input conversion or physical-device behavior. No production service, query, clock sequence, export, role or authorization is changed.

## Validation and remaining decisions

On the combined baseline, all six focused payroll tests and the full 593-unit suite passed locally, with zero lint/type errors or warnings; spec and diff checks passed. Earlier results from a different baseline are not used as candidate evidence. Before merge, require all five exact-head CI jobs across core, database/Auth/PowerSync plus SQL RLS, desktop and phone production/development browser/axe, and unchanged performance budgets. Inspect actual failures without weakening assertions or retrying blindly.

The supervisor-local versus agency-local From/To decision remains open, as does acceptance of an immediate offline clock-in after a queued clock-out. Explicit-offset arithmetic tests do not resolve either workflow decision. The timekeeping row still needs owner acceptance.

After this bounded validation and any confirmed failures, preserve one immutable candidate SHA and reconcile its five job results with the ten M1 workflow rows. Owner decisions on intake scope, scheduled-report access and payroll period behavior remain necessary. Live model/STT accuracy, staff task usefulness and physical/provider/operational evidence require separately authorized evaluation; synthetic CI is not that proof. No AI promise, clinical suitability, security certification or completion percentage is accepted by this evidence addition.
