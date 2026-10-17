# Goal management screen

Supervisors/admins can open `/dashboard/goals`, guarded by the existing goals feature and dashboard role check. A goals-gated link appears in Care reports; direct access requires goals, not a reporting entitlement. No person detail, navigation, staff, people or settings screens are changed.

The screen selects a home/person, lists authoritative active and stopped goals, creates or edits bounded goal definitions, and explicitly confirms irreversible stopping. Stopped definitions are read-only and existing trials remain unchanged. Definition text is current wording, not a reconstructed historical snapshot. Changes use the registered goal APIs and reach offline care forms after PowerSync updates.

Agency templates can be filtered by exact area, created and explicitly copied into a new goal draft. Copying never creates a goal or signs a note. Defaults are displayed only when already provisioned for the agency; new templates always use the API's non-default behavior. Inputs match API field limits and enforce at most 30 nonblank steps of 1,000 characters. API failures keep form values; list errors explain the 500-record bound.

Management requires connectivity and does not queue offline writes. An offline banner and guarded save actions preserve drafts in the open page; no browser storage is used. Navigation/unload guards cover unsaved goal/template fields, and navigation during a mutation is cancelled until the request finishes. Closing the page still discards unsaved in-memory forms. Existing offline care charting is unchanged.

The synthetic browser case covers the workflow in desktop and 390px phone projects, including template copy before creation, editing, cancelled/confirmed stopping, read-only stopped listing, offline retained entries, cancelled navigation and a clean PIN-unlocked reload that initializes home/person choices after local sync. It uses real emulator UI and attaches a successful screenshot. Browser execution is reserved for CI; no local automated browser is launched.

