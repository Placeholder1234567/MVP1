# Local payroll exports

The supervisor Timesheets screen exports CSV and versioned JSON for the loaded home and period. Exporting re-reads authoritative records through the existing clock aggregation service; a downloaded report may include updates since the screen was loaded. Downloads contain readable staff/home labels and stable references, UTC timestamps, clipped hours, verification/manual/review flags, and the report period. JSON also includes the four aggregation totals. Open clocks contribute zero hours.

`report.exportTimesheet` is a POST-only tRPC mutation, requires supervisor/admin plus a reports entitlement and timekeeping, and uses the caller's tenant-scoped transaction and RLS. Every successful export appends a `report_exports` audit event with actor, request details, format and row count; only this insert elevates privileges. It stores no report contents. If auditing fails the export fails. CSV uses the shared spreadsheet formula neutralization helper.

Ranges must be positive and no longer than 366 days. Queries fetch at most 5,001 rows and reject results exceeding 5,000, rather than quietly truncating payroll. Coordinates, client records and manual correction explanations are excluded. The browser creates a temporary object URL for the explicit download and revokes it after use; no report is stored in web storage or a service worker cache. Keep downloaded files in approved agency storage.

This is a bounded synchronous local/test implementation. The broader specification's asynchronous report queue, private cloud object storage, signed downloads and generated binary PDF are not implemented here. No cloud services or spending are enabled. When offline, export reports a reconnect message and preserves the loaded screen; it does not pretend an incomplete local cache is authoritative payroll.

## Care records

`/dashboard/reports` provides a separate bounded clinical export via the POST-only `report.exportClinical` mutation. It requires a supervisor/admin, the `reports` entitlement and the relevant care feature (`charting`, `mar`, `health` or `incidents`). Reports require an authorized home and can narrow to a person currently assigned to that home. Supervisors have the agency-wide home access defined by the existing RLS policies. A foreign home, foreign person or mismatched person/home returns the same scope-unavailable error. All reads and joins remain explicitly tenant-scoped under the caller's RLS transaction; only the append-only export audit insert elevates permissions.

Supported sources:

- Notes: submitted and approved records, optionally approved only; drafts and returned notes excluded. Includes content, author, status, AI indicator, and available signing/resubmission/approval events. Events are the recorded history, not a recreated signature. Imported or offline-created submitted records may have no separate signing event; the report leaves that history empty rather than inventing a signature timestamp. Goal trials and full revision history are not included.
- MAR: every recorded outcome, PRN, acknowledgment, amendment reference and conflict reference. Corrections do not replace originals. Uses medication IDs; current prescription names/doses are omitted because the schema does not snapshot their historical values. This report is not a reconstructed medication order.
- Health: recorded entry data, author reference, flags and acknowledgment.
- Incidents: occurrence time, type, severity, description, action, medical follow-up and review status. Omits precise location, witness/notification contacts and unrelated identity details. Undated incidents are excluded explicitly.
- Attendance: service day, recorded services and recorder identity.

From/through dates are inclusive calendar days in the agency's authoritative time zone. Note ranges use the stored shift start day (including overnight notes); MAR uses its stored dose day and attendance its service day. Health and incidents use real timestamp intervals from start midnight through exclusive midnight after the last day, including 23-/25-hour DST days. UTC boundaries and date basis appear in report metadata. Invalid/nonexistent calendar dates are rejected. Changing agency time zone does not rewrite historic stored day keys.

Exports support CSV, versioned JSON and a script-free UTF-8 HTML document with print styling for browser Print/Save as PDF. HTML escapes every field, blocks external resources and active content with CSP, uses system fonts, and preserves Unicode; no generated binary PDF or third-party PDF service is used. HTML is an explicit downloaded file, never inserted as active markup in the application. CSV neutralizes spreadsheet formulas. Filenames are generic and contain no client identifiers. DOBs, guardian contacts, addresses, coordinates and complete profile rows are never selected.

Limits are 93 inclusive calendar days, 1,000 source records, 5,000 signature events and 8 MiB serialized output. Queries fetch one sentinel row beyond the cap and reject excessive results; no silent truncation. The HTML/CSV serialized size is checked separately after escaping. Report contents are not stored server-side, cached, logged or written to web storage. Audits retain actor, request details, report type, format and count, not clinical contents. On failure or offline the form stays available with a generic retry message. Keep deliberate downloads in approved storage.

Remaining reporting gaps: asynchronous cloud job/storage delivery, true generated PDF, goals/ISP progress aggregation, coverage/intake/audit reports, full note revisions and prescription history reconstruction. Those are not implied by this focused local/test increment.
