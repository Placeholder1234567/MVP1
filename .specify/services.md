# Service Architecture

## Overview

Modular monolith inside SvelteKit. Services are logical boundaries — directories under `src/lib/server/services/` — **not** microservices. Each service owns a set of Drizzle `pgTable` definitions and exports typed functions that other services import directly (same process, no network hop). Inter-service communication is synchronous function calls. Cloud Tasks (with Cloud Scheduler for recurring jobs) handles only deferred or long-running work: notification dispatch, AI inference, report generation, and coverage escalation timers. Job handlers are HTTP endpoints in the `worker` Cloud Run service built from the same code (infrastructure.md §5).

Every service receives the caller's `agency_id` from the Auth Service context and passes it through to Drizzle queries. Postgres RLS is the safety net — even if application code omits the filter, Postgres blocks cross-tenant access. Services never construct raw SQL; all queries go through Drizzle, inside the `withUser()` / `withService()` transaction helpers that set the session role and claims (infrastructure.md §4).

Directory convention:
```
src/lib/server/services/
  auth/
    index.ts          # public API (exported functions)
    auth.queries.ts   # Drizzle query helpers
    auth.types.ts     # service-specific types
  charting/
    index.ts
    charting.queries.ts
    charting.types.ts
  ...
```

---

## Service Catalog

### 1. Auth Service

**Responsibility:** User authentication context, session resolution, role enforcement, profile CRUD. Wraps Identity Platform (Firebase Admin SDK) — no custom JWT, password or session logic. Every other service depends on Auth for the current user's identity and `agency_id`.

**Owns tables:** `profiles`

**Key functions:**
- `getCurrentUser(authUid): Profile` — resolve the Identity Platform UID (from the verified session cookie) to the app profile with role and home assignments.
- `requireRole(user, ...roles): void` — throw if user lacks required role; used as guard in tRPC middleware.
- `getUsersByHome(agencyId, homeId): Profile[]` — list staff assigned to a home (used by Schedule for coverage candidates).
- `getUsersByIds(agencyId, ids): Profile[]` — batch-fetch profiles by ID.
- `updateProfile(agencyId, profileId, data): Profile` — update staff details, home assignments, med certification.
- `deactivateUser(agencyId, profileId): void` — soft-delete (sets `active = false`), disables the Identity Platform account and revokes its refresh tokens; never hard-deletes.
- `listActiveStaff(agencyId): Profile[]` — all active profiles for the agency.
- `inviteUser(agencyId, email, name, role, homeIds, medCertified?): Profile` — create an Identity Platform user and a corresponding `profiles` row, and send an invitation email (password-setup link from the Admin SDK) via SES. Used by the `staff.invite` tRPC procedure.

**Depends on:** None for sessions (foundational). Identity Platform is the upstream identity provider. Staff management (`staff.ts`) also uses Home (to check home assignments) and the messaging providers (invite email).

**Jobs:** None.

**Notes:** Sessions are Identity Platform session cookies, created and verified with the Admin SDK. `profiles.auth_uid` links each profile to its Identity Platform user. There is no `sessions` table in Guad's schema — Identity Platform owns session lifecycle. There are no custom claims: tRPC and PowerSync both read role, homes and active status from the profile row, so changes apply within seconds.

---

### 2. Agency Service

**Responsibility:** Multi-tenant configuration, charting preset management, agency settings, subscription tier, onboarding provisioning.

**Owns tables:** `agencies`

**Key functions:**
- `getAgency(agencyId): Agency` — fetch agency record including settings and preset.
- `updateAgency(agencyId, data): Agency` — update name, settings, subscription tier.
- `updatePreset(agencyId, preset): Agency` — switch charting preset (`"therap"` | `"default"`).
- `getChartingLabels(agencyId): LabelMap` — return UI label overrides based on active preset (e.g., "T-Log" vs. "Shift Note").
- `provisionAgency(name, slug, adminEmail): Agency` — create agency, seed default goal templates, create admin profile. (As built: `provisionAgency(tx, { name, slug, tier, timezone, chartingPreset, adminEmail, adminName })`, run by the operator through `npm run agency:provision`, never from the app. The defaults are the MVP's 13 templates in `domain/goal-templates.ts`, and the admin is invited like any staff member.)

**Depends on:** Auth (admin role enforcement), Goal (seed default templates on provision), Notification (system_maintenance notifications).

**Jobs:** None.

---

### 3. Charting Service (Care Records pillar)

**Responsibility:** Shift notes and behavior notes — the core clinical documentation workflow. Handles note creation, Lomi-assisted drafting, the submit/review/approve/return lifecycle, amendment tracking, and per-note goal trial recording.

**Owns tables:** `notes`, `note_goals`, `note_history`

**Key functions:**
- `createNote(agencyId, data): Note` — create a draft note (shift or behavior type). If Lomi-drafted, sets `lomi_drafted = true`.
- `updateNote(agencyId, noteId, data): Note` — edit a draft note's content and goal trials. Only allowed in `draft` or `returned` status.
- `signNote(agencyId, noteId, userId): Note` — transition from `draft` to `submitted`. Requires human signature confirmation. Appends to `note_history`.
- `approveNote(agencyId, noteId, supervisorId): Note` — supervisor approves; transitions to `approved`. Appends to `note_history`.
- `returnNote(agencyId, noteId, supervisorId, comment): Note` — supervisor sends back with comment; transitions to `returned`. Appends to `note_history`.
- `getNoteWithHistory(agencyId, noteId): NoteWithHistory` — full note with goal trials, history timeline, and author profile.
- `getNotesByHomeDay(agencyId, homeId, day): Note[]` — all notes for a home on a given day.
- `getNotesByClient(agencyId, clientId, dateRange): Note[]` — notes for a client over a date range.
- `getPendingReview(agencyId, supervisorId): Note[]` — notes in `submitted` status for homes the supervisor oversees.

**Depends on:**
- Auth (author identity, supervisor role check)
- Goal (goal data for `note_goals` — fetches active goals for the client)
- AI (Lomi draft generation — called before `createNote` when DSP requests AI assist)
- Notification (notify supervisor when note is signed; notify DSP when note is returned; notify caregiver when note is approved (note_approved))
- Audit (log all status transitions)

**Jobs:** None (AI drafting is triggered via AI Service's job queue).

---

### 4. Medication Service (Care Records pillar)

**Responsibility:** Medication profiles, MAR (Medication Administration Record) tracking, scheduled and PRN dose recording, refusal/hold documentation, medication change history. MAR entries are irrevocable per constitution — corrections are appended, never deleted.

**Owns tables:** `medications`, `medication_history`, `mar_records`, `controlled_counts`

**As built (controlled medications):** medications marked `controlled` keep a count book (`controlled_counts`): receipts, shift counts, waste and disposal, each witnessed per the agency's `controlled_rules` (state presets in `domain/controlled.ts`). Given doses come from `mar_records`, so the expected amount on hand is the last count plus receipts, minus given doses, waste and disposal. `recordCountEntry()` and `countersign()` are the service functions.

**Key functions:**
- `getMedsDue(agencyId, clientId, day): MedWithStatus[]` — list medications with their MAR status for the day; highlights overdue scheduled meds.
- `recordDose(agencyId, data): MarRecord` — record a dose as `given`, `refused`, or `held` for one dose slot (`scheduled_time`, one of the medication's `scheduled_times`; null for PRN). Requires `recorded_by` (med-certified staff). The unique index is per client+med+day+slot. When a second original arrives for the same slot (offline on two devices), it is stored with `conflict_with` and a `med_possible_double_dose` alert is sent instead of rejecting it.
- `amendDose(agencyId, originalId, correction): MarRecord` — create correction entry referencing original (never deletes).
- `acknowledgeAlert(agencyId, marId, userId): void` — supervisor acknowledges a refusal/hold alert.
- `getMedicationHistory(agencyId, medicationId): MedHistory[]` — full change log for a medication (dose changes, start/stop).
- `addMedication(agencyId, clientId, data): Medication` — add new medication to client profile.
- `stopMedication(agencyId, medId, userId): Medication` — set `stopped_at`; records in `medication_history`.
- `getMarSheet(agencyId, clientId, month): MarGrid` — full month MAR grid for printing/export.

**Depends on:**
- Auth (med certification check — only `med_certified` staff can record doses)
- Notification (alert supervisor on refusal/hold; alert on overdue scheduled med)
- Audit (log all MAR entries and medication changes)

**Jobs:** None.

---

### 5. Health Service (Care Records pillar)

**Responsibility:** Vitals logging (temp, pulse, BP), seizure tracking, illness records, appointment tracking. Automatically flags out-of-range values per domain constants (tempHi: 100.4, tempLo: 95, pulseHi: 100, pulseLo: 50, sysHi: 140, sysLo: 90, diaHi: 90, diaLo: 60).

**Owns tables:** `health_entries`

**Key functions:**
- `createEntry(agencyId, data): HealthEntry` — record a vitals/seizure/illness/appointment entry. Runs `checkFlags` automatically.
- `checkFlags(entry): string[]` — evaluate recorded data against vital limits; returns list of flag descriptions (e.g., "Temperature above 100.4F").
- `acknowledgeFlag(agencyId, entryId, userId): void` — supervisor acknowledges an out-of-range flag.
- `getEntriesByClient(agencyId, clientId, kind?, dateRange?): HealthEntry[]` — filtered health history.
- `getUnacknowledgedFlags(agencyId, homeId): HealthEntry[]` — entries with unacknowledged flags for a home.

**Depends on:**
- Auth (role check for acknowledgment)
- Notification (immediate alert to supervisor on out-of-range flags)
- Audit (log all entries)

**Jobs:** None.

---

### 6. Goal Service (Care Records pillar)

**Responsibility:** ISP goal definitions, goal lifecycle (start/stop), progress calculation from trial data, reusable goal templates.

**Owns tables:** `goals`, `goal_templates`

**Key functions:**
- `createGoal(agencyId, clientId, data): Goal` — create a new ISP goal with steps and frequency target.
- `stopGoal(agencyId, goalId, userId): Goal` — mark goal as stopped (sets `stopped_at`).
- `getActiveGoals(agencyId, clientId): Goal[]` — goals where `stopped_at` is null.
- `calculateProgress(agencyId, goalId, dateRange): ProgressReport` — aggregate trial data from `note_goals` to compute progress toward target.
- `getTemplates(agencyId): GoalTemplate[]` — list available templates (agency-specific and defaults).
- `createTemplate(agencyId, data): GoalTemplate` — create a reusable goal template.
- `createGoalFromTemplate(agencyId, clientId, templateId): Goal` — instantiate a goal from a template.

**Depends on:**
- Auth (role check)
- Charting (reads `note_goals` for progress calculation — the only cross-service read in the Care Records pillar)

**Jobs:** None.

---

### 7. Incident Service (Care Records pillar)

**Responsibility:** Incident reporting (seizure, medication error, injury, fall, elopement, behavioral, etc.), severity-based notification routing, review workflow, follow-up tracking.

**Owns tables:** `incidents`

**Key functions:**
- `createIncident(agencyId, data): Incident` — file an incident report. Triggers notification based on severity.
- `reviewIncident(agencyId, incidentId, supervisorId, followup): Incident` — supervisor reviews and adds follow-up notes.
- `getIncidentsByClient(agencyId, clientId, dateRange?): Incident[]` — incident history for a client.
- `getIncidentsByHome(agencyId, homeId, dateRange?): Incident[]` — all incidents at a home.
- `getOpenIncidents(agencyId): Incident[]` — incidents with status `open` awaiting review.
- `getNotificationRules(severity): NotificationRule[]` — determine who must be notified (e.g., `high` severity notifies admin + guardian + state).

**Depends on:**
- Auth (author identity)
- Notification (mandatory notifications by severity — high severity triggers immediate push + SMS to admin)
- Audit (log all incidents and status changes)

**Jobs:** None.

---

### 8. Attendance Service (Care Records pillar)

**Responsibility:** Daily client attendance and service tracking. Records which services each client received on a given day (in-home support, day program, community outing, etc.). Used for billing documentation and state reporting.

**Owns tables:** `attendance`

**Key functions:**
- `recordAttendance(agencyId, clientId, day, data): Attendance` — log services provided to a client on a given day.
- `updateAttendance(agencyId, attendanceId, data): Attendance` — update services or correct a record.
- `getAttendanceByDay(agencyId, homeId, day): Attendance[]` — all attendance records for a home on a day.
- `getAttendanceByClient(agencyId, clientId, dateRange): Attendance[]` — client attendance history.
- `getAttendanceSummary(agencyId, dateRange): AttendanceSummary` — aggregated service counts for billing/reporting.

**Depends on:**
- Auth (who recorded it)
- Audit (log all attendance records)

**Jobs:** None.

---

### 9. Schedule Service (Scheduling pillar)

**Responsibility:** Shift calendar management across all homes, slot assignment, and the Lomi coverage engine — the automated callout-to-coverage workflow. When a caregiver calls out (via SMS or app), Lomi identifies trained, available candidates nearby, texts them shift offers, and fills the slot when someone accepts. The scheduler retains final authority.

**Owns tables:** `schedule_slots`, `schedule_templates`, `coverage_requests`, `coverage_candidates`, `coverage_steps`

**Key functions:**
- `getWeekSchedule(agencyId, homeId, weekStart): ScheduleGrid` — 7-day x 3-shift grid with assigned staff and statuses.
- `getAllHomesSchedule(agencyId, weekStart): ScheduleGrid[]` — cross-home schedule view for supervisors.
- `setSlot(agencyId, homeId, day, shift, profileId): ScheduleSlot` — assign a caregiver to a slot.
- `removeSlot(agencyId, slotId): void` — unassign a caregiver from a slot.
- `postOpenShift(agencyId, homeId, day, shift): ScheduleSlot` — mark a slot as open and available for pickup.
- `processCallout(agencyId, homeId, day, shift, calledOutBy, reason): CoverageRequest` — initiate the Lomi coverage workflow: create coverage request, identify candidates, begin SMS outreach.
- `findCandidates(agencyId, coverageRequestId): CoverageCandidate[]` — identify eligible staff: trained for the home, not already scheduled, not over hours, nearby.
- `recordCandidateReply(agencyId, candidateId, reply): CoverageCandidate` — record accept/decline from SMS reply.
- `fillShift(agencyId, coverageRequestId, filledById): CoverageRequest` — mark shift as filled, update schedule slot, notify family.
- `getCoverageStatus(agencyId, coverageRequestId): CoverageRequest` — full coverage request with candidates and step log.
- `getMyShifts(agencyId, profileId, weekStart?, weeks?): ScheduleSlot[]` — returns the caller's own scheduled shifts. Defaults to current week, up to 4 weeks ahead.
- `copyScheduleWeek()`, `saveScheduleTemplate()`, `applyScheduleTemplate()`, `listScheduleTemplates()`, `deleteScheduleTemplate()` — fill a week's open slots from another week, from a saved template, or from reviewed suggestions (`suggestScheduleWeek()` / `applyScheduleSuggestions()`, the coverage eligibility checks) (a home's usual week by weekday, up to 20 per home); each copy goes through the `setSlot` checks (frontend-audit.md finding 17).

**Depends on:**
- Auth (staff home assignments, availability)
- Home (home list for cross-home view)
- Notification (SMS offers to candidates, push to scheduler on fill/escalation, notify family)
- Message (coverage announcements to home message board)
- Audit (log all schedule changes and coverage decisions)

**Jobs:**
- `CoverageTimeoutJob` — fires after configurable deadline (default: 60 min) if shift remains unfilled. Escalates to supervisor via push + SMS.
- `CoverageReminderJob` — sends reminder SMS to candidates who haven't replied after 15 minutes.

---

### 10. Clock Service (Timekeeping pillar)

**Responsibility:** Clock-in/out recording, GPS geolocation verification against home coordinates, missed punch detection, manual override workflow, payroll-ready timesheet generation.

**Owns tables:** `clock_records`

**Key functions:**
- `clockIn(agencyId, profileId, homeId, lat, lng): ClockRecord` — record clock-in with GPS coordinates. Automatically calculates distance to home and sets `verified` if within geofence radius.
- `clockOut(agencyId, clockId, lat?, lng?): ClockRecord` — record clock-out. Flags if no matching clock-in.
- `verifyLocation(lat, lng, home): { verified: boolean, distance: number }` — pure function: compare GPS to home lat/lng against configured radius (default 150m).
- `getTimesheets(agencyId, profileId?, dateRange): Timesheet[]` — aggregated hours by staff member, ready for payroll export.
- `getMissedPunches(agencyId, day): ClockRecord[]` — clock-ins without clock-outs (or vice versa) for a given day.
- `manualOverride(agencyId, clockId, supervisorId, data): ClockRecord` — supervisor corrects a clock record; sets `manual_override = true`.
- `acknowledgeOverride(agencyId, clockId, staffId): void` — staff acknowledges a manual correction.
- `exportPayroll(agencyId, dateRange, format): Buffer` — generate CSV/Excel export of timesheets.

**Depends on:**
- Auth (staff identity, supervisor role for overrides)
- Home (lat/lng/radius for geofence verification)
- Notification (alert supervisor on out-of-geofence clock-in; alert staff on missed punch)
- Audit (log all clock records and manual overrides)

**Jobs:**
- `MissedPunchCheckJob` — runs at end of each shift (15:00, 23:00, 07:00). Identifies staff who clocked in but didn't clock out and notifies supervisor.

---

### 11. Intake Service (Client Intake pillar)

**Responsibility:** Referral pipeline management, room availability tracking, client-home-caregiver matching. Covers the flow from initial inquiry through placement in the right home.

**Owns tables:** `referrals`, `referral_notes`, `rooms`

**Key functions:**
- `createReferral(agencyId, data): Referral` — log a new referral/inquiry with contact info and source.
- `updateReferralStatus(agencyId, referralId, status, notes?): Referral` — advance referral through pipeline (inquiry -> touring -> accepted | waitlist | declined -> placed; values per `referral_status` in schema.ts).
- `listReferrals(agencyId, status?): Referral[]` — filter referrals by status.
- `listAvailableRooms(agencyId): Room[]` — rooms with status `available` across all homes.
- `getRoomsByHome(agencyId, homeId): Room[]` — room inventory for a specific home.
- `assignRoom(agencyId, roomId, clientId): Room` — mark room as occupied, link to client.
- `releaseRoom(agencyId, roomId): Room` — mark room as available.
- `createRoom(agencyId, homeId, name, capacity, status): Room` — add a room to a home's inventory (supervisor). Names are unique ignoring case within a home. `capacity` is physical and informational: each room record holds at most one occupant, so availability counts rooms, not beds. Room name, capacity and availability (`available` / `reserved`) are edited through `updateRoom`, which also performs assign and release; rooms never move between homes.
- `matchToHome(agencyId, referralId): MatchSuggestion[]` — internal helper (not exposed via tRPC). Suggests homes based on open rooms, caregiver certifications, and client needs. Called by `convertToClient` to surface placement suggestions.
- `convertToClient(agencyId, referralId, homeId, name, roomId?): { clientId: uuid, referralId: uuid }` — converts an accepted referral into a client record. Transitions the referral status to `placed`, creates the Client and ClientHealthInfo records (via Client Service), and optionally assigns the specified room.

**Depends on:**
- Auth (role check)
- Home (home details for matching)
- Client (client creation when referral is converted)
- Notification (referral_status_change notifications)
- Audit (log referral status changes)

**Jobs:** None.

---

### 12. Client Service

**Responsibility:** Client master records, health profile info, case notes, client lifecycle management. Central entity that other Care Records services reference.

**Owns tables:** `clients`, `client_health_info`, `case_notes`

**Key functions:**
- `createClient(agencyId, data): Client` — create a new client record with home assignment.
- `updateClient(agencyId, clientId, data): Client` — update client info, home assignment, active status.
- `getClient(agencyId, clientId): Client` — basic client record.
- `getClientFull(agencyId, clientId): ClientFull` — client with health info, active goals, current medications, and home details.
- `listClientsByHome(agencyId, homeId): Client[]` — all clients in a home.
- `listAllClients(agencyId, active?): Client[]` — all agency clients with optional active filter.
- `updateHealthInfo(agencyId, clientId, data): ClientHealthInfo` — update allergies, conditions, diet, doctor, guardian, DOB.
- `addCaseNote(agencyId, clientId, data): CaseNote` — add a freeform case note (distinct from shift/behavior notes).
- `getCaseNotes(agencyId, clientId): CaseNote[]` — case note history.
- `deactivateClient(agencyId, clientId): Client` — soft-delete (sets `active = false`); never hard-deletes.

**Depends on:**
- Auth (role check, author identity for case notes)
- Home (home details for client record)
- Audit (log all client data changes — PHI mutations are always audited)

**Jobs:** None.

---

### 13. Home Service

**Responsibility:** Home (group home / residential facility) CRUD, location data for geofencing, home-scoped queries.

**Owns tables:** `homes`

**Key functions:**
- `getHome(agencyId, homeId): Home` — fetch home record with address and geofence config.
- `listHomes(agencyId): Home[]` — all homes for the agency.
- `createHome(agencyId, data): Home` — create a new home with address and geofence radius.
- `updateHome(agencyId, homeId, data): Home` — update home details, geofence coordinates/radius.
- `distanceTo(homeLat, homeLng, userLat, userLng): number` — Haversine distance in meters (pure function, used by Clock Service for verification).
- `archiveHome(agencyId, homeId, timeZone)` / `restoreHome(agencyId, homeId)` — a home that has closed. Refused while active people live there, staff are clocked in there, or shifts from today on are staffed or looking for cover. Archived homes keep every record, read-only. `requireOpenHome(home)` is the guard Clock, Schedule, Client, Intake, Message (the home board) and staff assignment call before adding work at a home. A missed punch or a board message written before the archive date can still be entered.

Homes are never deleted. Every foreign key to `homes` uses `ON DELETE RESTRICT`, so a home's records stay for the retention period: 6 years for HIPAA documentation (45 CFR 164.316(b)(2)) and up to 10 years under Medicaid managed-care contracts (42 CFR 438.3(u)), counted per person from their last service.

**Depends on:**
- Auth (admin role for create/update)
- Audit (log home changes)

**Jobs:** None.

---

### 14. AI Service (Lomi)

**Responsibility:** AI-powered note drafting via Claude on Vertex AI, audio transcription via Google Speech-to-Text, supervisor daily summaries. Lomi is stateless — it owns no tables. All AI output is labeled as AI-generated and enters the workflow as `draft` status requiring human review.

**Owns tables:** None (stateless processor).

**Key functions:**
- `draftNote(agencyId, context): NoteDraft` — generate a clinical note draft from structured input (activities, meals, mood, health observations). Returns content marked as `lomi_drafted`. Streams response for responsive UX.
- `transcribeAudio(agencyId, audioBlob): Transcript` — transcribe caregiver voice memo to text via Speech-to-Text (Chirp model). Used to pre-fill note content.
- `summarizeDay(agencyId, homeId, day): DaySummary` — generate a supervisor-facing summary of all notes, incidents, MAR entries, and coverage events for a home on a given day.
- `suggestGoalTrials(agencyId, goalText, observations): TrialSuggestion[]` — suggest prompt levels from observation text.

**Depends on:**
- Auth (rate limiting per user, agency-scoped context)
- Charting (reads note context for draft generation — passed as function argument, not direct DB query)

**Jobs:**
- `DraftJob` — background AI note draft generation. The primary draft flow is synchronous streaming via the `lomi.draft` tRPC procedure (returns content inline). DraftJob is used when the draft is queued for background processing (e.g., connection drop mid-stream, batch pre-generation). Result stored and user notified via push.
- `TranscribeJob` — background audio transcription. The primary transcription flow is synchronous via the `lomi.transcribe` tRPC procedure (returns text inline). TranscribeJob is used for background processing when needed. The result is stored on the draft note, which reaches the device through PowerSync sync.
- `SummarizeJob` — async daily summary generation. Triggered at configurable time (default: 07:00) for each home.

---

### 15. Notification Service

**Responsibility:** Multi-channel notification dispatch (FCM push, SMS via AWS End User Messaging, Amazon SES email), user preference management, escalation timers, delivery tracking.

**Owns tables:** `notifications`, `notification_preferences`

**Key functions:**
- `send(agencyId, profileId, type, payload): Notification` — dispatch a notification through the user's preferred channels. Creates `notifications` record for tracking.
- `sendBatch(agencyId, profileIds, type, payload): Notification[]` — dispatch to multiple users (e.g., all supervisors for a home).
- `sendSms(phone, message): void` — low-level SMS dispatch through AWS End User Messaging (no PHI in message body per constitution).
- `sendPush(profileId, title, body, data?): void` — FCM push to user's registered service worker.
- `sendEmail(email, subject, body): void` — SES transactional email.
- `getPreferences(agencyId, profileId): NotificationPreference[]` — user's channel preferences per notification type.
- `updatePreference(agencyId, profileId, type, channels): NotificationPreference` — update push/SMS/email toggles for a notification type.
- `markRead(agencyId, notificationIds: string[]): void` — mark one or more notifications as read (batch operation).
- `listNotifications(agencyId, profileId, unreadOnly?, limit?, offset?): Notification[]` — paginated notification list with optional unread-only filter.
- `getUnread(agencyId, profileId): Notification[]` — unread notifications for the in-app notification center (convenience wrapper around `listNotifications`).
- `announceMaintenance(agencyId, { id, startsAt, endsAt, impact }): { recipients, title, alreadySent }` — admin maintenance announcement to all active staff (notifications.md §2.18); wording from `domain/maintenance.ts`.

**Depends on:**
- Auth (user preferences lookup, FCM token resolution)

**Jobs (per-channel queues, see notifications.md for full architecture):**
- `PushJob` — async push notification dispatch via FCM. Queued on `notifications-push`.
- `SmsJob` — async SMS dispatch via AWS End User Messaging. Queued on `notifications-sms`. Rate-limited to 1 msg/s.
- `EmailJob` — async email dispatch via Amazon SES. Queued on `notifications-email`.
- `EscalationJob` — per-notification delayed job. Enqueued with a delay (e.g., 15 min, 60 min) when an escalatable notification is sent. On fire, checks `read_at` — if null, escalates to next recipient/channel. Queued on `notifications-escalation`.
- `DigestJob` — daily digest email for supervisors summarizing overnight activity. Queued on `notifications-digest`.

---

### 16. Message Service

**Responsibility:** Home-scoped message board for shift handoff communication and coverage announcements. New messages reach devices through PowerSync sync (typically within a few seconds while online).

**Owns tables:** `messages`, `message_reads`, `message_photos`

**Key functions:**
- `sendMessage(agencyId, homeId, fromUserId, body, clientId?, replyTo?, incidentId?): Message` — post a message to a home's board, optionally naming the person it is about (someone at the same home; Charting Service `findVisibleClient`), replying in a thread on the same board (stored against the thread's first message) or following up on an incident from the same home.
- `getMessages(agencyId, homeId, limit?, before?): Message[]` — paginated message history for a home.
- `uploadPhoto(agencyId, user, { id, homeId, data })` / `getPhoto(agencyId, user, id)` — board photos (JPEG only, metadata stripped, stored in `MEDIA_BUCKET`); each view is audited.
- `markRead(agencyId, user, { id, messageId, readAt? }): { created }` — record that the caller has seen a board message (idempotent per reader; none for the author). Written offline, applied through `sync.upload`.
- `postCoverageAnnouncement(agencyId, homeId, text): Message` — system-generated message about coverage changes (called by Schedule Service).

- Auth (sender identity, home access check)
- Charting (checks the person a message names is at the same home)
- Auth (sender identity, home access check)
- Audit (log messages for compliance)

**Jobs:** None.

---

### 17. Sync Service

**Upload path:** `upload(agencyId, userId, ops)` backs the `sync.upload` tRPC procedure. It dispatches each queued offline op, in order, to the owning service's normal function (charting, medication, health, clock, attendance, message, incident), so offline writes get the same validation, business rules, notifications and audit as online ones. Ops on tables that aren't writable offline are rejected with `RLS_DENIED`.

**`SyncWindowJob`** (nightly 03:00 agency time): sets `device_sync = false` on rows older than their device sync window (offline-sync.md §7) so PowerSync removes them from devices.

**Responsibility:** PowerSync bridge configuration, sync rule generation (what data each user can sync offline), checkpoint management for incremental sync.

**Owns tables:** `sync_checkpoints`

**Key functions:**
- `getSyncRules(agencyId, profileId): SyncRuleSet` — generate PowerSync sync rules scoped to user's agency, role, and home assignments. Caregivers sync only their assigned homes; supervisors sync all homes they oversee.
- `updateCheckpoint(agencyId, profileId, tableName, token): void` — record the last successful sync point for incremental sync.
- `getCheckpoint(agencyId, profileId, tableName): SyncCheckpoint` — fetch last checkpoint for a table.
- `resetSync(agencyId, profileId): void` — clear all checkpoints to force a full re-sync (used for troubleshooting).

**Depends on:**
- Auth (user's role and home assignments determine sync scope)

**Jobs:** None.

---

### 18. Report Service

**Responsibility:** CSV/PDF report generation, analytics computation, data exports for state reporting and EVV. Read-only cross-service aggregator — owns no tables.

**Owns tables:** None (reads across services).

**Key functions:**
- `generateReport(agencyId, reportType, params): ReportResult` — generate a report (MAR sheet, incident summary, attendance log, timesheet, goal progress, etc.).
- `exportCsv(agencyId, reportType, params): Buffer` — CSV export of any report.
- `exportPdf(agencyId, reportType, params): Buffer` — PDF export. As built: care reports (`report.exportClinical` with `format: 'pdf'`) and API reports render through `src/lib/server/pdf.ts` (pdfkit, Figtree embedded, Letter size, one labelled block per record, page footer). Latin-script text only: a report needing other characters is refused with a message pointing to CSV or HTML rather than printing blank boxes. Agency branding is not added yet.
- `computeAnalytics(agencyId, dateRange): AnalyticsDashboard` — aggregate metrics for the dashboard (notes submitted, incidents by severity, coverage fill rate, clock accuracy).
- `generateEvvExport(agencyId, dateRange): EvvPayload` — Electronic Visit Verification export formatted for state submission.
- `generateStateReport(agencyId, reportType, dateRange): StateReportPayload` — formatted data for state regulatory submissions.

**Depends on:** Multiple services (read-only access):
- Charting, Medication, Health, Goal, Incident (Care Records data)
- Schedule (coverage and shift data)
- Clock (timesheet data)
- Attendance (service delivery data)
- Client, Home (master data)

**Jobs:**
- `GenerateReportJob` — async report generation for large exports. Result stored in temporary secure storage and user notified via push.

---

### 19. Audit Service

**Responsibility:** Immutable append-only audit logging for all data mutations, PHI access tracking, compliance report generation. Audit records are never updated or deleted by application code. Seven-year minimum retention (exceeds HIPAA's 6-year requirement per security.md).

**Owns tables:** `audit_log`, `events`

**Key functions:**
- Row changes are recorded by the `audit_row_change` database trigger (rls.sql), not by service code, so they can't be skipped or forged.
- `logEvent(agencyId, action, detail, userId): void` — record an audited action that changes no row (exports with format/record count/filters, AI invocations with model/tokens/latency, report downloads).
- `logAccess(agencyId, tableName, recordId, userId): void` — record PHI read access (for sensitive tables: `clients`, `client_health_info`, `notes`, `incidents`, `mar_records`, `health_entries`).
- `emitEvent(agencyId, eventType, detail, homeId?): Event` — publish a domain event (e.g., `note.submitted`, `shift.filled`, `incident.created`). Used for analytics and cross-service side effects. Not synced to devices; supervisor views read events through tRPC.
- `getAuditTrail(agencyId, tableName, recordId): AuditEntry[]` — full history of changes to a specific record.
- `getAuditByUser(agencyId, userId, dateRange): AuditEntry[]` — all actions by a specific user.
- `getAuditReport(agencyId, dateRange): AuditReport` — compliance report for agency admins.

**As built:** `listAudit()` and `getAudit()` back `/dashboard/audit` (metadata in the list; one entry's values at a time, each view recorded), and `exportAudit()` downloads the list's metadata as CSV for up to 93 days, recorded as a `report_exports` entry (trpc-router.md `audit.export`).

**Depends on:**
- Auth (performer identity resolution)

**Jobs:** None. Audit writes are synchronous to guarantee they complete before the request returns.

### 20. Integration Service

**Responsibility:** The external API (openapi.yaml) for state EVV aggregators, data warehouses and other integrations: agency API keys, EVV visit records, bulk data export, webhook subscriptions with signed deliveries (`/api/v1/webhooks`, `integration/webhooks.ts`, SSRF-guarded by `domain/webhooks.ts`) and API report generation (`/api/v1/reports`).

**Owns tables:** `api_keys`, `webhooks`, `webhook_deliveries`, and `report_jobs` for API-requested reports

**Key functions:**
- `createApiKey`, `listApiKeys`, `revokeApiKey` (admins, through tRPC `apiKey.*`, as app_user so RLS applies).
- `authenticateKey(token)`: the key's agency, scope, time zone and plan features, or null. Updates `last_used_at` at most hourly.
- `listEvvVisits`, `getEvvVisit`, `evvSummary`; `exportData` (12 types, explicit column lists, never auth IDs or plan data).
- `logApiAccess`: one `audit_log` row per call (`table_name = 'api_access'`, `record_id` = key ID, operation, query parameters, status, record count, IP, user agent).

An API key acts for its agency, not a person, so its reads run as app_service and every query filters on the key's `agency_id`. The routes live under `src/routes/api/v1/` and share `src/lib/server/external-api.ts` (auth, rate limits, plan and scope checks, error bodies).

**Depends on:**
- Audit (access log)

**Jobs:** `webhook-sweep` (maintenance, every minute: audited changes on event tables become deliveries) and `webhook-deliver` (`webhooks` queue: one signed attempt; the handler queues its own retries after 1, 5, 30 and 120 minutes); `report-generate` (`reports` queue: builds an API report into private storage, `src/lib/server/storage.ts`) and `report-cleanup` (hourly: deletes report files past their 24 hours).

---

## Data Ownership Matrix

| Table Name | Owning Service | Read-Access Services |
|---|---|---|
| `agencies` | Agency | Auth, all services (agency config) |
| `profiles` | Auth | All services (user identity) |
| `homes` | Home | Schedule, Clock, Intake, Client, Message, Report |
| `clients` | Client | Charting, Medication, Health, Goal, Incident, Attendance, Intake, Report |
| `client_health_info` | Client | Health, Report |
| `case_notes` | Client | Report |
| `goals` | Goal | Charting (for note_goals), Report |
| `goal_templates` | Goal | Agency (seeding) |
| `medications` | Medication | Report |
| `medication_history` | Medication | Report |
| `mar_records` | Medication | Report |
| `health_entries` | Health | Report |
| `notes` | Charting | Goal (progress calc), AI (via function argument, not direct query), Report |
| `note_goals` | Charting | Goal (progress calc), Report |
| `note_history` | Charting | Report |
| `incidents` | Incident | Report |
| `attendance` | Attendance | Report |
| `schedule_slots` | Schedule | Report |
| `coverage_requests` | Schedule | Report |
| `coverage_candidates` | Schedule | Report |
| `coverage_steps` | Schedule | Report |
| `clock_records` | Clock | Report |
| `messages` | Message | — |
| `referrals` | Intake | Report |
| `rooms` | Intake | Report |
| `notifications` | Notification | — |
| `notification_preferences` | Notification | — |
| `sync_checkpoints` | Sync | — |
| `audit_log` | Audit | Report |
| `events` | Audit | — (read through tRPC by Analytics) |

---

## Dependency Graph

```
Legend: A --> B means "A depends on B (imports from B)"

                        ┌─────────┐
                        │  Auth   │  (foundational — no dependencies)
                        └────┬────┘
                             │
              ┌──────────────┼──────────────────────────────┐
              │              │                              │
         ┌────▼───┐    ┌─────▼────┐                   ┌─────▼────┐
         │ Agency │    │   Home   │                   │  Audit   │
         └──┬──┬──┘    └─────┬────┘                   └──────────┘
            │  │             │                              ▲
            │  │   ┌─────────┼──────────────┐               │
            │  │   │         │              │          (all services)
            │  │   │         │              │
         ┌──▼──▼───▼──┐  ┌──▼───┐   ┌──────▼──────┐
         │   Client   │  │ Sync │   │ Notification │
         └─────┬──────┘  └──────┘   └──────┬───────┘
               │                           │
    ┌──────────┼──────────────┬────────────┤
    │          │              │            │
┌───▼───┐ ┌───▼────┐  ┌──────▼──┐  ┌──────▼───┐
│ Goal* │ │ Intake │  │ Message │  │    AI    │
└───┬───┘ └────────┘  └─────────┘  └──────────┘
    │                                    │
    │   ┌────────────────────────────────┘
    │   │
┌───▼───▼───┐   ┌────────────┐   ┌───────────┐   ┌────────────┐
│ Charting  │   │ Medication │   │  Health   │   │  Incident  │
└───────────┘   └────────────┘   └───────────┘   └────────────┘

┌────────────┐   ┌────────────┐   ┌────────────┐
│ Attendance │   │  Schedule  │   │   Clock    │
└────────────┘   └──────┬─────┘   └────────────┘
                        │
                   (depends on:
                    Auth, Home,
                    Notification,
                    Message)

┌────────────┐
│   Report   │ ── reads from all services (read-only)
└────────────┘

* Agency depends on Goal for seeding default templates during provisioning.

Leaf services not drawn with edges above for readability:
- Medication, Health, Incident: depend on Auth, Notification, Audit
- Attendance: depends on Auth, Audit
- Clock: depends on Auth, Home, Notification, Audit
```

**Acyclicity guarantee:** Core dependencies form a DAG. The only apparent cycle risk is Notification being called by services that Notification might need to reference — this is resolved because Notification receives pre-computed payloads (title, body, channel, profileId) from callers. Notification never imports from Charting, Schedule, Incident, etc. It only imports from Auth (for preference lookups).

**Goal <-> Charting cross-read:** Goal reads `note_goals` to compute progress. This is the single allowed cross-service table read within Care Records. It is read-only and documented. An alternative would be for Charting to expose a `getTrialsByGoal()` function — either approach is acceptable; the direct read is simpler at monolith scale.

---

## Job Registry (Cloud Tasks / Cloud Scheduler)

Each queue below is a Cloud Tasks queue; jobs marked *cron* are Cloud Scheduler jobs that call the same handler. See infrastructure.md §5.

| Job Name | Queue | Service | Trigger | Retry Policy |
|---|---|---|---|---|
| `DraftJob` | `ai` | AI | DSP requests Lomi note draft | 2 retries, 10s backoff. On final failure, notify user draft unavailable. |
| `TranscribeJob` | `ai` | AI | DSP submits voice memo | 2 retries, 10s backoff. On final failure, notify user to type manually. |
| `SummarizeJob` | `ai` | AI | *cron* daily at 07:00 per home timezone | 1 retry, 30s backoff. Non-critical — supervisor can review manually. |
| `CoverageTimeoutJob` | `scheduling` | Schedule | Coverage request created (delayed: 60 min) | No retry (one-shot timer). On fire, escalate to supervisor. |
| `CoverageReminderJob` | `scheduling` | Schedule | Coverage request created (delayed: 15 min) | No retry. Sends reminder SMS to non-responsive candidates. |
| `MissedPunchCheckJob` | `timekeeping` | Clock | *cron* at shift boundaries (07:00, 15:00, 23:00) | 1 retry, 60s backoff. Idempotent — safe to re-run. |
| `PushJob` | `notifications-push` | Notification | Any service calls `send()` or `sendBatch()` with push channel | 3 retries, exponential backoff (5s, 15s, 45s). Stale FCM tokens removed on `NotRegistered` response. |
| `SmsJob` | `notifications-sms` | Notification | Any service calls `send()` or `sendBatch()` with SMS channel | 2 retries, exponential backoff (10s, 30s). Rate-limited to 1 msg/s (10DLC throughput). |
| `EmailJob` | `notifications-email` | Notification | Any service calls `send()` or `sendBatch()` with email channel | 3 retries, exponential backoff (10s, 30s, 90s). Bounced addresses auto-suppressed. |
| `EscalationJob` | `notifications-escalation` | Notification | Enqueued as a delayed job when an escalatable notification is sent | 1 attempt, no retry. Checks `read_at` on fire — skips if acknowledged. Per-notification delayed job, not a cron. |
| `DigestJob` | `notifications-digest` | Notification | *cron* daily at 06:00 per agency timezone | 1 retry, 60s backoff. Non-critical — can be manually triggered. |
| `GenerateReportJob` | `reports` | Report | User requests large export | 2 retries, 30s backoff. On final failure, notify user report generation failed. |
| `ShiftReminderJob` | `scheduling` | Schedule | Fires 1 hour before shift start | No retry (one-shot timer). Triggers `shift_reminder` notification. As built: `care-reminder-sweep` on `maintenance` every 15 minutes, once per slot, 20 to 60 minutes before the start (notifications.md §2.13). |
| `MedDueReminderJob` | `notifications-push` | Notification | Fires 30 min before scheduled medication time | No retry (one-shot timer). Triggers `med_due_reminder` notification. As built: `med-reminder-sweep` on `maintenance` every 5 minutes, which also sends `med_overdue` 30 minutes after an unrecorded dose (notifications.md §2.8). |
| `IncidentReviewCheckJob` | `notifications-escalation` | Notification | Daily cron or delayed job at incident creation + 24hr | 1 retry, 60s backoff. Triggers `incident_review_needed` notification if incident still open. As built: the same `care-reminder-sweep`, once per incident open 24 to 72 hours (notifications.md §2.12). |
| `AccessReviewJob` | `maintenance` | Notification | *cron* daily (14:00 UTC) | No retry; tomorrow's run catches up. As built: `access-review-sweep` sends admins the `access_review` alert (dormant accounts, stale home access) at most weekly per agency (security.md "Automated Detection", notifications.md §2.20). |

**Queue configuration:**
- `ai` queue: concurrency 3 (limited by Vertex AI and Speech-to-Text quotas).
- `scheduling` queue: concurrency 10 (coverage is time-sensitive).
- `timekeeping` queue: concurrency 5.
- `notifications-push` queue: concurrency 20 (high throughput, FCM batch API).
- `notifications-sms` queue: concurrency 5, max 1 dispatch/s (10DLC throughput).
- `notifications-email` queue: concurrency 10 (SES sending rate).
- `notifications-escalation` queue: concurrency 5 (delayed jobs, all high priority).
- `notifications-digest` queue: concurrency 3 (one job per agency).
- `reports` queue: concurrency 2 (memory-intensive for large exports).

Concurrency maps to the queue's `maxConcurrentDispatches`; retry policies map to its retry config. Task payloads never contain PHI: they carry record IDs only, and the handler fetches the data from Postgres. Handlers must be idempotent, because Cloud Tasks delivers at least once. Delayed one-shot jobs (timeouts, reminders, escalations) use deterministic task names so they can be cancelled when no longer needed (e.g. shift filled).
