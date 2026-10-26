# Queued care reports

This workflow limits supervisors to assigned homes; administrators can select any agency home. This is intentionally narrower than immediate care exports. Status and download are reauthorized, including current person/home membership.

Selected reports and recent rows display their original requested period, person/all-people scope and signed/approved-note filter. These summaries use server metadata independently of the editable request form, so changing form dates does not relabel an existing file.

Navigation start immediately invalidates in-flight status, recent-list, request and download responses and clears this view's local job references, before waiting for the destination to load or this component to be disposed. It does not cancel a server job or delete a prepared file. If navigation is cancelled, select the request again from the recent list; no request or download is automatically retried.

Supervisors with Care reporting access can request a larger care export from Care reports. The selected home is required; a person can be selected or everyone in that home included. Dates include both agency-local calendar days, up to 93 days. CSV, structured data and HTML allow 10,000 records; PDF allows 2,000. Every file is limited to 8 MB. Signed/approved note rules match immediate care exports; this screen never signs or changes clinical records.

Request, refresh, recent requests and download are POST mutations carrying the expected current profile ID. The server reauthorizes each operation. Before a new request the screen refreshes device upload status and blocks until saved changes sync. The selected job and recent metadata are held only in page memory. Account, home or privacy-lock transitions discard them and invalidate in-flight responses. No report content, selection or job reference is written to browser storage, URLs or logs.

Progress checks run every five seconds only while visible, online and unlocked, with no concurrent request. A manual refresh is available. Download requires a separate explicit button; completion never starts a download. Errors use generic text instead of server payloads. The browser revokes its temporary download URL. Exported files must be handled using agency-approved storage.

Queue/generation has a 15-minute deadline; prepared files remain available for 24 hours. Scheduled reports (Complete plan, "Scheduled reports" on the same page) are queued by the hourly `report-schedule-sweep` as their owner, with a 1-hour generation deadline, and their files remain available for 7 days; the owner gets a `report_ready` alert with the report type and dates only. Failed or expired jobs require a deliberate new request. A lost request response may still have created a server job; requests never automatically retry. Leaving, reloading, locking or changing homes forgets the selection without cancelling server work. After unlocking, resume a request from the recent list. The list returns up to 20 currently accessible jobs for the selected home from the account’s latest 50 requests, rather than a complete history. It loads once for a newly unlocked home context and supports explicit refresh; the entire list is never polled. There is no cancellation interface.

Unit checks cover context invalidation and polling eligibility. The browser CI case creates a unique synthetic health observation, queues a report, verifies no automatic download and checks the explicit file, offline guard and home switch. Live deployment, real-device behavior and production queue delivery are not validated by these local checks.

## Verification

The implementation merged in [PR117](https://github.com/Placeholder1234567/MVP1/pull/117): final commit `c34ff16ede9fcdf8fd66ce495fef12ac19947b64`, merge `9ed16efa74a11748a81b8ef229ea4d77b3e65679`. Core lint/types/units/spec/build/artifacts, database/auth/sync/RLS, desktop/phone/accessibility browser and performance gates passed on that final commit before the guarded merge.

The browser cases retain a synthetic source marker, downloaded type and original saved period/scope checks, explicit download, offline/home guards and reload/PIN recent recovery. Reload resets the current home; tests explicitly select the requested home rather than persisting a report reference or home selection. Future changes require all four gates on their exact final head. Integration and browser execution use isolated GitHub CI services, never a shared user database or desktop. Synthetic CI does not establish real-provider delivery or production deployment.
