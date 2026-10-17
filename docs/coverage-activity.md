# Coverage activity

Supervisors and administrators see the six most recent saved coverage requests for the selected home below Schedule. Cards include the shift, callout/reason when present, status, filled staff name (or a fallback), and the saved event timeline. Times use the account timezone. Requests are ordered by creation time and ID, independently of the displayed schedule week.

The encrypted local sync window contains recent seven-day activity, not a complete historical log. Missing events and local read errors are explicit. Home changes abort the old event watch, immediately hide old-home events, and query the new home with bound home and agency parameters. No candidate data, provider calls, additional storage, or schema changes are introduced.

Assignments and coverage requests require a connection and are never queued by this page. An in-flight action retains its original home and week; changing home cannot redirect its mutation or show its completion in another scope. Week navigation is disabled while saving.

The synthetic browser case covers supervisor assignment, posting an open shift, local-job search steps, manual fill, offline reading/write blocking, home isolation, axe, and phone overflow on both configured projects. It restores the original assignment; the coverage timeline is intentionally retained as history. Browser execution is reserved for CI. It does not exercise real messaging providers, caregiver acceptance, timeout delays, or claim a complete accessibility audit.
