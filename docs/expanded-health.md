# Additional health observations

Vitals now retain `respiration` (breaths/min), `oxygen` (SpO2 percent) and
`glucose` (mg/dL). Respiration and oxygen keep their existing API JSON keys;
glucose is additive JSON. Values are entered by a person and stored through the
existing encrypted local health-record database and `sync.upload` path.

Shared device/server input guards accept finite decimal numbers or plain decimal
strings. Blank strings, null and omitted values are absent, never inferred zero.
Explicit zero remains an entry for the new metrics. Booleans, arrays, objects,
hex/scientific strings and non-numeric device displays are not converted into
readings. Mechanical input bounds are respiration 0–1000, oxygen 0–100%, glucose
0–10000; these are **not clinical alert or normal ranges**. Existing input bounds
for prior metrics are shared with the server as well.

No authoritative new clinical thresholds exist in the supplied specification.
These three fields therefore carry `alertConfigured: false`; the UI should say
automatic alert limits are not configured. Temperature, pulse and blood-pressure
alert operators and thresholds remain unchanged, including inclusive high limits
for temperature/BP and the exclusive pulse high limit. Neither new numeric
readings nor bowel statuses create invented alerts, diagnoses or care advice.

Bowel tracking is its own `health_entries.kind = 'bowel'`, not an illness/vitals
workaround. A person explicitly chooses `Observed`, `Not observed` or `Declined`.
An optional `time` is an exact HH:mm observation/check time; `consistency` is a
human description permitted only when `Observed`; `notes` is optional for any
status. Each text answer is bounded to 1000 characters. There is no implicit
absence, movement count, automated constipation rule, or stool classification.
Clinical reports retain the original JSON and kind through the generic health
export; record timestamps/actors and tenant/feature access stay unchanged.

The source schema and generated Drizzle migration `0004_health_bowel_tracking`
append one enum value. It must be applied by the normal release migration process
before accepting bowel entries. No shared local database was migrated/reset.
SQLite/PowerSync already stores kind as text and data as JSON, so no device schema
or sync-stream change is required. All bowel integration tests run normally in
CI against its freshly migrated database; local numeric-only checks can run on
the existing schema. No test is conditionally skipped in CI.
