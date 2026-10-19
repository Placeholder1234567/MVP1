# Queued care reports

This workflow limits supervisors to assigned homes; administrators can select any agency home. This is intentionally narrower than immediate care exports. Status and download are reauthorized, including current person/home membership.

Selected reports and recent rows display their original requested period, person/all-people scope and signed/approved-note filter. These summaries use server metadata independently of the editable request form, so changing form dates does not relabel an existing file.

Supervisors with Care reporting access can request a larger care export from Care reports. The selected home is required; a person can be selected or everyone in that home included. Dates include both agency-local calendar days, up to 93 days. CSV, structured data and HTML allow 10,000 records; PDF allows 2,000. Every file is limited to 8 MB. Signed/approved note rules match immediate care exports; this screen never signs or changes clinical records.

Request, refresh, recent requests and download are POST mutations carrying the expected current profile ID. The server reauthorizes each operation. Before a new request the screen refreshes device upload status and blocks until saved changes sync. The selected job and recent metadata are held only in page memory. Account, home or privacy-lock transitions discard them and invalidate in-flight responses. No report content, selection or job reference is written to browser storage, URLs or logs.

Progress checks run every five seconds only while visible, online and unlocked, with no concurrent request. A manual refresh is available. Download requires a separate explicit button; completion never starts a download. Errors use generic text instead of server payloads. The browser revokes its temporary download URL. Exported files must be handled using agency-approved storage.

Queue/generation has a 15-minute deadline; prepared files remain available for 24 hours. Failed or expired jobs require a deliberate new request. A lost request response may still have created a server job; requests never automatically retry. Leaving, reloading, locking or changing homes forgets the selection without cancelling server work. After unlocking, resume a request from the recent list. The list returns up to 20 currently accessible jobs for the selected home from the account’s latest 50 requests, rather than a complete history. It loads once for a newly unlocked home context and supports explicit refresh; the entire list is never polled. There is no cancellation interface.

Unit checks cover context invalidation and polling eligibility. The browser CI case creates a unique synthetic health observation, queues a report, verifies no automatic download and checks the explicit file, offline guard and home switch. Live deployment, real-device behavior and production queue delivery are not validated by these local checks.

## Verification handoff (2026-10-18)

PR117 remains the first priority. Main at `5b736992086959f7ff91175db57c131f34f183d5` was merged without conflicts. The original browser failure was a navigation race: the trace shows the health selection hitting the immediate-report page before the queued-report page mounted; the request and downloaded file both contained `type: notes`. The browser case now waits for the destination heading and also verifies the downloaded type and saved period. The synthetic health-record assertion remains required.

On `c76789b`, core CI, all 253 integration tests, SQL RLS and performance passed. Both browser projects passed the synthetic health-file assertion, then failed the recent-resume lookup because reload restored Maple House rather than the requested Oak House. The snapshot showed the correct empty recent list for Maple. The browser case now captures the requested home and explicitly reselects it after reload/PIN unlock; no home selection or report reference is persisted by this change. Revalidate all gates on the follow-up head.

Validate all four gates again on the new exact head: core lint/types/units/spec/build/artifacts, database/auth/sync integration, desktop/phone/accessibility browser, and performance. Do not merge with any pending or failing gate. Inspect new failures and synthetic artifacts before changing code. Existing CI provides isolated Docker/Postgres/PowerSync/Auth-emulator runners; the remote editing workspace lacks Docker privileges, so integration and browser execution stays in CI. No shared database was changed.

After this PR merges, reassess the latest main/spec backlog and open PRs before selecting further work. Do not infer current Claude ownership from old PR numbers. Scheduled continuation has resumed a normal stopped turn, but usage-limit recovery is untested. Do not claim a durable worker lock or supported usage-stop status interface exists.
