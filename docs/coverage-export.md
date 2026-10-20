# Coverage log export

`report.exportCoverage` is an account-bound POST mutation for supervisors and admins with reports and coverage features. CSV and JSON use the selected home's coverage-request **shift start calendar day**, including overnight starts. The period is at most 93 inclusive agency-calendar days. Current related candidate/reply, activity and visible coverage-offer notification rows are included; this is not a historical snapshot at the end of the period.

Source reads remain under the requester's RLS. A fresh active profile, unchanged role and auth binding, current plan and home assignment are checked inside the transaction. Supervisors require a current assigned home; admins may select any home in their agency. The input binds `expectedProfileId`. No service-role report read, notification-policy widening or external API reuse is involved. Only the existing append-only export audit insert is elevated.

Requests, candidates, activity and visible notification records together have a 1,000-source-row cap. Each query uses a sentinel bound, excessive totals are rejected and serialized CSV/JSON is limited to 8 MiB. No partial report is returned. Metadata audits contain scope, period, request/staff IDs, count, format and notification visibility, never clinical/free-text source contents. Exports use generic filenames and are not queued, stored server-side, logged or cached in browser key/value storage. This does not extend the queued Care source enum or its limits.

## What the evidence means

- A candidate's eligibility, reason, reply and reply timestamp are recorded facts. Eligibility and the generic offered-to-count activity text are not proof a notification was sent.
- Notification evidence uses the existing `notifications_select` policy: admins see agency records; supervisors see only rows addressed to themselves. The JSON metadata and CSV preface label this distinction. Other recipients' rows are not read as service or exposed through a new policy.
- Notification channel/status and recorded sent/read timestamps are source state, not guaranteed provider/device delivery. A missing row is unknown, not proof no offer occurred. No phone numbers, provider IDs, titles, bodies, email addresses or complete profile objects are selected for this export.
- Names are current labels, not historical snapshots. Missing names remain null. Activity descriptions remain source text rather than reconstructed structured history. No missing offer/signature history is invented.

## Interaction and validation

Download starts only from an explicit form submission while connected, visible and unlocked, with settled device upload status. Account/home/lock/view changes invalidate in-flight results, including a home change away and back. Date/format values belong to the submitted request. The form stays available offline with its selected dates and a reconnect explanation; it does not imply that offline recent activity is a complete server report.

Synthetic integration coverage checks role/account/tenant/home boundaries, reused-caller home/role/activity/plan revocation, notification RLS visibility, current source semantics, CSV formula escaping, strict inputs, caps and export audit. The browser case creates a real future coverage request and fill through the existing UI, explicitly downloads JSON, checks its source records, exercises offline/home-change response guards and checks axe/overflow on desktop and phone. Browser execution is remote CI only.

This increment exposes the evidence currently available to the requester. A complete cross-recipient supervisor delivery ledger remains a separate source-design problem; it must not be claimed complete or implemented by bypassing notification RLS. No migration, provider execution, real account action or deployment occurs in the editing workspace.
