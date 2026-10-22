# tRPC Router Specification

## Overview

tRPC provides end-to-end TypeScript type safety between the SvelteKit frontend and server. All internal application communication uses tRPC. External integrations (state reporting, EVV, data exports) use the separate OpenAPI 3.1 spec. No internal UI code calls OpenAPI endpoints.

tRPC procedures are organized into domain routers aligned with the four product pillars (Care Records, Scheduling, Timekeeping, Client Intake) plus cross-cutting concerns (auth, agency, analytics, Lomi AI).

## Context Shape

```typescript
interface TRPCContext {
  userId: string;       // profiles.id (UUID)
  agencyId: string;     // agencies.id (UUID) — injected into every query via RLS
  authUid: string;      // profiles.auth_uid (Identity Platform UID)
  role: 'caregiver' | 'supervisor' | 'admin';
  homeIds: string[];    // profiles.home_ids — homes the user is assigned to
  medCertified: boolean;
  db: DrizzleClient;    // Drizzle transaction opened by withUser(): role app_user + app.claims set
  agency?: {            // Populated by requireFeature middleware after agency lookup
    subscriptionTier: string;
    enabledFeatures: string[];
  };
}
```

## Middleware Stack

### 1. authMiddleware

Applied to every procedure. Verifies the Identity Platform session cookie with the Firebase Admin SDK (`verifySessionCookie(cookie, true)`, which also checks revocation), loads the `profiles` row by `auth_uid`, and attaches `userId`, `agencyId`, `authUid`, `role`, `homeIds`, and `medCertified` to context. It then opens the request transaction with `withUser()` (infrastructure.md §4), which sets `app.claims` from the profile row, never from token claims. Rejects with `UNAUTHORIZED` if the cookie is missing, expired or revoked, or the profile is `active = false`. Requests whose `Origin` isn't the app's own are rejected (CSRF, security.md T7).

### 2. roleMiddleware(minRole)

A factory that returns middleware enforcing a minimum role level. Role hierarchy: `caregiver < supervisor < admin`. Rejects with `FORBIDDEN` if the user's role is below `minRole`. Used as `.use(roleMiddleware('supervisor'))` on procedures that require elevated access.

### 3. auditMiddleware

Applied to all mutations. Sets `app.request` (client IP and user agent) on the database transaction, next to the `app.claims` set by authMiddleware, so the `audit_row_change` trigger in rls.sql can record `performed_by`, `ip_address` and `user_agent` for every row the mutation changes. The middleware never writes `audit_log` rows itself, and clients can't either. For actions that change no row (exports, AI calls), procedures call `audit.logEvent()`.

### 4. rateLimitMiddleware(limit, windowMs)

Applied to AI/transcription endpoints. Counts the caller's AI invocations in the window from `audit_log` (`table_name = 'ai_invocations'`, written by `audit.logEvent()` for every AI call), so limits hold across all Cloud Run instances without a separate store. General per-user throttling (100 req/min, security.md T4) is an in-memory token bucket per instance; it is approximate because each instance counts separately. Configured limits: 10 requests per hour for `lomi.draft`, 5 per hour for `lomi.summarize`, 20 per hour for `lomi.transcribe`. Rejects with `TOO_MANY_REQUESTS` and includes `Retry-After` in the error metadata.

### 5. requireFeature(feature)

A factory that returns middleware enforcing feature entitlement. Loads the agency's `subscription_tier` and `enabled_features`, caches them on context as `ctx.agency`, then checks whether the requested feature flag is included in the agency's tier or overrides. Rejects with `FORBIDDEN` if the feature is not available. Used as `.use(requireFeature('charting'))` on procedures gated by subscription tier.

**Middleware ordering:** auth -> requireFeature -> role -> audit.

See `entitlements.md` for the full feature registry and tier-to-feature mapping.

---

## Router Tree

### auth

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `auth.me` | query | none | `{ id, agencyId, email, phone, name, initials, role, homeIds, medCertified, mfaEnabled, avatarUrl, active, createdAt }` | caregiver | Returns the authenticated user's profile. Used on app init to hydrate the client-side user store. |
| `auth.updateProfile` | mutation | `{ name?: string, phone?: string, avatarUrl?: string }` | `{ id, name, phone, avatarUrl, updatedAt }` | caregiver | Updates the caller's own profile. Only the three listed fields are editable by the user. Role, homeIds, and medCertified are admin-only (see `staff` procedures). |
| `auth.setTheme` | mutation | `{ theme: 'light' | 'dark' | 'auto' }` | `{ theme }` | caregiver | Saves the caller's display theme in `user_settings.theme` (frontend-spec-1.md §10.1). The app reads it back from the synced `user_settings` row. Added with dark mode. |
| `auth.setDisclosure` | mutation | `{ onboardingDone?: boolean }` | `{ disclosure: { onboardingDone?: boolean } }` | caregiver | Saves progressive-disclosure flags in the caller's `user_settings.disclosure` (merged, other keys kept; unknown keys are rejected), so hiding the getting-started tips follows the person to other devices (frontend-spec-2.md §6.5). |

### agency

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `agency.get` | query | none | `{ id, name, slug, chartingPreset, settings, subscriptionTier, enabledFeatures, createdAt, updatedAt }` | caregiver | Returns the caller's agency record. Settings includes notification defaults, shift times, and feature flags. `subscriptionTier` defaults to `'starter'` when null. `enabledFeatures` is an array of per-agency feature flag overrides (see entitlements.md). |
| `agency.announceMaintenance` | mutation | `{ id: uuid, startsAt: timestamp, endsAt: timestamp, impact: 'unavailable' \| 'slow' \| 'sync_paused' }` | `{ recipients: number, title: string, alreadySent: boolean }` | admin | Sends the `system_maintenance` notification (notifications.md §2.18) to every active profile in the agency. The window must be in the future, end after it starts, last at most 12 hours and start within 60 days. `id` makes a retry a no-op. |
| `agency.update` | mutation | `{ name?: string, chartingPreset?: 'therap' \| 'default', settings?: jsonb }` | `{ id, name, chartingPreset, settings, updatedAt }` | admin | Updates agency-level configuration. Changing `chartingPreset` affects only UI labels and form ordering, never schema or API. |

### home

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `home.list` | query | none | `Array<{ id, name, address, lat, lng, radius, archivedAt, createdAt }>` | caregiver | Returns homes the caller has access to. Caregivers see only homes in their `homeIds`; supervisors and admins see all agency homes. |
| `home.get` | query | `{ id: uuid }` | `{ id, name, address, lat, lng, radius, createdAt, updatedAt }` | caregiver | Returns a single home. Rejects with `NOT_FOUND` if the home does not exist or is outside the caller's access. |
| `home.create` | mutation | `{ name: string, address?: string, lat?: number, lng?: number, radius?: number }` | `{ id, name, address, lat, lng, radius, createdAt }` | admin | Creates a new home. `radius` defaults to 150 meters (geofence for clock-in verification). |
| `home.update` | mutation | `{ id: uuid, name?: string, address?: string, lat?: number, lng?: number, radius?: number }` | `{ id, name, address, lat, lng, radius, updatedAt }` | admin | Updates home details. Changing `lat`/`lng`/`radius` affects future clock-in geofence validation. |

| `home.archive` | mutation | `{ id: uuid }` | `{ id, name, ..., archivedAt }` | admin | Archives a home that has closed. Rejects with `RULE_VIOLATION`, naming what to resolve first, while active people live there, anyone is clocked in there, or shifts from today on are staffed or looking for cover. Afterwards its records stay readable but no one can clock in, be scheduled, admitted, given a room or newly assigned there. A missed punch from before the archive date can still be added. Already archived is a no-op. |
| `home.restore` | mutation | `{ id: uuid }` | `{ id, name, ..., archivedAt: null }` | admin | Puts an archived home back in use. |

> **Note:** There is no `home.delete`. Homes are never deleted, and every foreign key to `homes` restricts deletes (services.md §13). `home.list` and `home.get` include `archivedAt`. Devices keep archived homes for reading history but leave them out of pickers; the top-bar home switcher lists them under "Archived" for supervisors.

### staff

**As built:** `staff.invite` creates the Identity Platform account with no password and emails the Admin SDK password-setup link after the profile commits. `staff.update` with `active: false` disables the account and revokes its sessions; `active: true` re-enables it. Admins can't demote or deactivate themselves. `agency.update` also takes `timezone`; settings are merged, not replaced, and the plan (tier, features) isn't editable here. Known settings are validated: `mfa_required_roles`, `session_minutes` (15 to 720; sign-in length for new sessions), and `incident_rules` (`{ guardianWhen, nurseTypes, nurseWhen, stateSeverities, stateTypes, stateWhen, abuseHotline?, guardianHours?, nurseHours?, stateHours? }`, deadlines up to 60 characters; the hours, 1 to 720 or null for none, drive `incident_contact_overdue` reminders), which drives `incident.create`'s `mustNotify` and the device's incident wizard.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `staff.list` | query | `{ homeId?: uuid, role?: user_role, active?: boolean }` | `Array<{ id, name, email, phone, initials, role, homeIds, medCertified, active }>` | supervisor | Lists staff members. Filterable by home assignment, role, and active status. |
| `staff.get` | query | `{ id: uuid }` | `{ id, name, email, phone, initials, role, homeIds, medCertified, mfaEnabled, active, createdAt }` | supervisor | Returns a single staff profile with full details. |
| `staff.invite` | mutation | `{ email: string, name: string, role: user_role, homeIds: uuid[], medCertified?: boolean }` | `{ id, email, name, role }` | admin | Creates an Identity Platform user and a profiles row. Sends an email invitation (password-setup link) via SES. |
| `staff.update` | mutation | `{ id: uuid, role?: user_role, homeIds?: uuid[], medCertified?: boolean, active?: boolean }` | `{ id, role, homeIds, medCertified, active, updatedAt }` | admin | Updates staff role, home assignments, med certification, or active status. Deactivating a staff member does not delete their data. |
| `staff.resetMfa` | mutation | `{ id: uuid }` | `{ id, mfaEnabled: false }` | admin | Lost authenticator: removes the person's second factors so they enroll again at next sign-in. Never on yourself (another admin must reset yours). Recorded in the audit log. |

### client

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `client.list` | query | `{ homeId?: uuid, active?: boolean }` | `Array<{ id, name, firstName, initials, homeId, active }>` | caregiver | Returns clients. Caregivers see only clients in their assigned homes. Supervisors/admins see all agency clients. |
| `client.get` | query | `{ id: uuid }` | `{ id, name, firstName, initials, homeId, info, active, healthInfo: { allergies, conditions, diet, doctor, guardian, dob }, goals: Array<Goal>, medications: Array<Medication> }` | caregiver | Returns a full client record with nested health info, active goals, and active medications. Nested data is feature-gated: `healthInfo` requires the `charting` feature, `goals` requires `goals`, `medications` requires `mar`. For agencies without these features (e.g., Starter tier), these fields return `null` or empty arrays. |
| `client.create` | mutation | `{ name: string, firstName?: string, homeId: uuid, info?: string, healthInfo?: { allergies?, conditions?, diet?, doctor?, guardian?, dob? } }` | `{ id, name, homeId, createdAt }` | supervisor | Creates a client and associated `client_health_info` row in a single transaction. |
| `client.update` | mutation | `{ id: uuid, name?: string, firstName?: string, homeId?: uuid, info?: string, active?: boolean }` | `{ id, name, homeId, active, updatedAt }` | supervisor | Updates client basic info. Moving a client to a different home (changing `homeId`) is logged in audit. |
| `client.updateHealth` | mutation | `{ clientId: uuid, allergies?: string, conditions?: string, diet?: string, doctor?: string, guardian?: string, dob?: string, vitalLimits?: { tempLo?, tempHi?, pulseLo?, pulseHi?, sysLo?, sysHi?, diaLo?, diaHi? } \| null }` | `{ id, clientId, allergies, conditions, diet, doctor, guardian, dob, vitalLimits, updatedAt }` | supervisor | Updates the `client_health_info` record for a client. `vitalLimits` is the person's own vital alert range, set by a nurse or supervisor. Any subset may be given. Each limit must be in its plausible range, and each low must be below its high. `null` clears them. Readings are flagged against these on the device and the server (`health.create`, health_alert); unset limits keep the defaults. |
| `client.archive` | mutation | `{ id: uuid }` | `{ id, active: false, updatedAt }` | admin | Sets `active = false`. Does not delete data. Archived clients are excluded from default list views. |

### note

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `note.create` | mutation | `{ clientId: uuid, homeId: uuid, day?: string, shift: 'am' \| 'pm' \| 'on', type: 'shift' \| 'behavior', content: jsonb, goals?: Array<{ goalId: uuid, trials: string[], notAttempted?: boolean, reason?: string }>, lomiDrafted?: boolean }` | `{ id, status: 'draft', createdAt }` | caregiver | Creates a note in `draft` status. `day` is an ISO date string for the shift's start date (an overnight note written at 2am uses the previous day); defaults to the start date of the caller's current shift. `shift` is the shift the note covers, so AM, PM and overnight staff each write their own note for the same person. Day and shift are immutable after creation (resubmissions via note.update preserve the original day). If `lomiDrafted` is true, the note is flagged as AI-generated. Also inserts `note_goals` rows and a `note_history` entry (action: 'created') in a single transaction. Content is a JSONB object with keys like `activities`, `meals`, `mood`, `health` for shift notes. |
| `note.get` | query | `{ id: uuid }` | `{ id, clientId, homeId, authorId, authorName, day, shift, type, content, status, supervisorComment, lomiDrafted, goals: Array<NoteGoal>, history: Array<NoteHistory>, createdAt, updatedAt }` | caregiver | Returns a full note with nested goal data and history timeline. |
| `note.list` | query | `{ homeId?: uuid, clientId?: uuid, day?: string, shift?: shift_key, status?: note_status, authorId?: uuid, limit?: number, offset?: number }` | `Array<{ id, clientId, clientName, authorName, day, shift, type, status, lomiDrafted, createdAt }>` | caregiver | Paginated, filterable note list. Caregivers see notes from their assigned homes only. |
| `note.update` | mutation | `{ id: uuid, content?: jsonb, goals?: Array<{ goalId: uuid, trials: string[], notAttempted?: boolean, reason?: string }> }` | `{ id, content, updatedAt }` | caregiver | Updates note content and goal data. Only the original author can update, and only while status is `draft` or `returned`. Inserts a `note_history` entry (action: 'edited'). |
| `note.sign` | mutation | `{ id: uuid }` | `{ id, status: 'submitted', updatedAt }` | caregiver | Transitions the note from `draft` to `submitted`. Only the author can sign. This is the human-signature step -- the client must confirm intent before calling this. Inserts a `note_history` entry (action: 'signed'). |
| `note.approve` | mutation | `{ id: uuid }` | `{ id, status: 'approved', updatedAt }` | supervisor | Approves a submitted note. Inserts a `note_history` entry (action: 'approved'). |
| `note.sendBack` | mutation | `{ id: uuid, comment: string }` | `{ id, status: 'returned', supervisorComment, updatedAt }` | supervisor | Returns a submitted note to the author with a comment explaining what needs correction. Inserts a `note_history` entry (action: 'returned'). |
| `note.versions` | mutation | `{ id: uuid }` | `{ versions: Array<{ number, at, by, status, content }> }` | supervisor | Each version of the note its author signed, rebuilt from the audit trail (`audit_log` rows of the notes table), so a supervisor can see what changed in a resubmitted note (frontend-audit.md finding 14). A mutation because the read is recorded as an `audit_views` entry. Needs a connection: the audit trail isn't synced. |

### incident

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `incident.create` | mutation | `{ clientId: uuid, type: incident_type, severity: incident_severity, occurredAt: timestamp, location?: string, description: string, antecedent?: string, injured?: string, injuryDetail?: string, staffAction?: string, medicalFollowup?: string, witnesses?: string, witnessList?: Array<{ name: string, role: 'Staff' \| 'Person supported' \| 'Family or visitor' \| 'Other' }>, notifiedParties?: string[], reportDetails?: ReportDetails }` | `{ id, status: 'open', createdAt }` | caregiver | Creates an incident report. `reportDetails` holds the optional state-reporting fields (`domain/incident-details.ts`); unknown keys and values are dropped, and a restraint other than None needs `restraintDetail`. `witnessList` keeps each witness's name and role (`incidents.witness_list`, at most 10, blank names dropped, unknown roles saved as Other); when `witnesses` is left out it is filled with "Name (Role); …" for older readers and exports. `type` is one of: Seizure, Medication error, Injury, Fall, Left without staff, Behavior with harm, Property damage, Suspected abuse or neglect, Suspected exploitation, Death, Other. High-severity incidents trigger a push notification to all supervisors of the home. |
| `incident.get` | query | `{ id: uuid }` | Full incident record with all fields | caregiver | Returns a single incident report. |
| `incident.list` | query | `{ homeId?: uuid, clientId?: uuid, status?: string, severity?: incident_severity, limit?: number, offset?: number }` | `Array<{ id, clientId, clientName, type, severity, occurredAt, status, authorName, createdAt }>` | caregiver | Paginated incident list. Filterable by home, client, status, and severity. Incidents can be filtered directly by `home_id` since the `incidents` table has a `home_id` column (FK to homes). |
| `incident.review` | mutation | `{ id: uuid, followupNotes: string }` | `{ id, followupNotes, status: 'reviewed', updatedAt }` | supervisor | Adds supervisor review notes and changes status to 'reviewed'. |
| `incident.markNotified` | mutation | `{ id: uuid, party: string }` | `{ id, notifiedParties, updatedAt }` | supervisor | Appends a party to the `notified_parties` array (e.g., 'guardian', 'case manager', 'state'). |

### mar (Medication Administration Record)

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `mar.record` | mutation | `{ clientId: uuid, medicationId: uuid, day: string, scheduledTime?: string, status: 'given' \| 'refused' \| 'held', reason?: string, isPrn?: boolean, amendsId?: uuid }` | `{ id, result: 'recorded' \| 'already-recorded' \| 'conflict', conflictWith?, otherName? }` | caregiver | Records a medication administration. `result: 'conflict'` means another record already answered this dose slot: the new record is kept with `conflict_with` and the home's supervisors get a `med_possible_double_dose` alert (same as `sync.upload`). `reason` is required when status is `refused` or `held`. For scheduled doses, `scheduledTime` (one of the medication's `scheduledTimes`) is required and identifies the dose slot; the unique constraint is per (client, medication, day, slot), so twice-daily meds get two records. Corrections are new records with `amendsId` set and don't conflict with the original; a correction must be for the same person and medication and keeps the original's slot (and as-needed flag), whatever the schedule is now. A dose uploaded offline whose `recorded_at` is before the medication was last changed is kept with its slot even if that time was since removed, so a dose really given is never lost to a schedule edit; new doses must use a current time. Recording the effect of an as-needed dose (`mar.recordEffect`) only succeeds while none is recorded, so two people recording at once can't replace each other's. Once recorded as `given`, this entry is irrevocable per constitution -- corrections require a new amend entry. Caller must be `medCertified`. |
| `mar.recordEffect` | mutation | `{ id: uuid, effect: string }` | `{ id, effect, updatedAt }` | caregiver | Records the observed effect of a PRN medication after administration, once. Only valid on given doses where `isPrn = true`. Caregivers can't update MAR rows under RLS, so the service checks the dose is in their homes and writes the effect as `app_service`; `mar_records_immutable` still allows only that column. |
| `mar.list` | query | `{ clientId: uuid, day?: string, dateRange?: { from: string, to: string } }` | `Array<{ id, clientId, medicationId, medicationName, dose, route, scheduledTime, day, status, amendsId, conflictWith, recordedAt, recordedByName, reason, effect, isPrn, acknowledged }>` | caregiver | Returns MAR entries with joined medication details. Default view is today's records for a client. |
| `mar.acknowledge` | mutation | `{ id: uuid }` | `{ id, acknowledged: true, updatedAt }` | supervisor | Supervisor acknowledgment of a MAR entry, especially for refused/held entries. |

### health

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `health.create` | mutation | `{ clientId: uuid, kind: 'vitals' \| 'seizure' \| 'illness' \| 'appointment' \| 'bowel', data: jsonb, recordedAt?: timestamp }` | `{ id, clientId, kind, data, recordedAt, createdAt }` | caregiver | Records a health entry. `data` shape varies by kind: vitals = `{ temp, pulse, systolic, diastolic, respiration, oxygen, glucose, weight }`, seizure = `{ duration, type, triggers, postIctal }`, illness = `{ symptoms, onset, actions }`, appointment = `{ provider, reason, outcome, nextVisit }`, bowel = `{ status: 'Observed' \| 'Not observed' \| 'Declined', time?: 'HH:mm', consistency?: string, notes?: string }` (consistency only when observed). Respiration is breaths/min, oxygen is SpO2 percent, glucose is mg/dL; no automatic alert thresholds are configured for these additional metrics or bowel tracking. Blanks are absent, never inferred zero. Vitals outside existing thresholds (temp >= 100.4 or < 95, pulse < 50 or > 100, systolic >= 140 or < 90, diastolic >= 90 or < 60; same operators as `vitalFlags()` in the MVP) auto-populate the `flags` array with the out-of-range metric names. |
| `health.list` | query | `{ clientId?: uuid, homeId?: uuid, kind?: health_entry_kind, dateRange?: { from: string, to: string }, limit?: number, offset?: number }` | `Array<{ id, clientId, clientName, kind, data, recordedAt, recordedByName, flags, acknowledged }>` | caregiver | Paginated health entries. Entries with non-empty `flags` are surfaced first. |
| `health.acknowledge` | mutation | `{ id: uuid }` | `{ id, acknowledged: true, updatedAt }` | supervisor | Supervisor acknowledgment of a flagged health entry. |

### goal

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `goal.create` | mutation | `{ clientId: uuid, area: string, text: string, steps?: string[], frequency?: string, target?: string, startedAt?: timestamp }` | `{ id, clientId, area, text, steps, frequency, target, startedAt, createdAt }` | supervisor | Creates an ISP goal for a client. `area` is a free-text category (e.g., 'Daily Living', 'Social Skills', 'Health'). |
| `goal.update` | mutation | `{ id: uuid, area?: string, text?: string, steps?: string[], frequency?: string, target?: string }` | `{ id, area, text, steps, frequency, target, updatedAt }` | supervisor | Updates goal details. Cannot update a stopped goal. |
| `goal.stop` | mutation | `{ id: uuid }` | `{ id, stoppedAt, updatedAt }` | supervisor | Sets `stopped_at` to now. Stopped goals are excluded from active note forms but remain visible in historical records. |
| `goal.list` | query | `{ clientId: uuid, includeStopped?: boolean }` | `Array<{ id, area, text, steps, frequency, target, startedAt, stoppedAt }>` | caregiver | Returns goals for a client. Defaults to active goals only. |
| `goal.listTemplates` | query | `{ area?: string }` | `Array<{ id, area, text, steps, isDefault }>` | supervisor | Returns goal templates for the agency. Templates with `isDefault = true` are system-provided; others are agency-created. |
| `goal.createTemplate` | mutation | `{ area: string, text: string, steps?: string[] }` | `{ id, area, text, steps, isDefault: false, createdAt }` | supervisor | Creates an agency-specific goal template. |

### medication

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `medication.list` | query | `{ clientId: uuid, includeStopped?: boolean }` | `Array<{ id, name, dose, route, scheduledTimes, prnInstructions, notes, startedAt, stoppedAt }>` | caregiver | Returns medications for a client. Defaults to active (not stopped) medications only. |
| `medication.create` | mutation | `{ clientId: uuid, name: string, dose?: string, route?: string, scheduledTimes?: string[], prnInstructions?: string, notes?: string, controlled?: boolean, controlledSchedule?: 'II' \| 'III' \| 'IV' \| 'V', unitsPerDose?: number, startedAt?: timestamp }` | `{ id, name, dose, route, scheduledTimes, createdAt }` | supervisor | Adds a new medication. Also inserts a `medication_history` entry (action: 'added'). |
| `medication.update` | mutation | `{ id: uuid, name?: string, dose?: string, route?: string, scheduledTimes?: string[], prnInstructions?: string, notes?: string, controlled?: boolean, controlledSchedule?: string, unitsPerDose?: number }` | `{ id, name, dose, updatedAt }` | supervisor | Updates medication details. Inserts a `medication_history` entry (action: 'updated') with before/after values. |
| `medication.countEntry` | mutation | `{ id: uuid, medicationId: uuid, kind: 'receipt' \| 'count' \| 'waste' \| 'disposal', quantity: number, reason?: string, witnessId?: uuid, witnessToken?: string, recordedAt?: timestamp }` | `{ created, expected: number \| null, discrepancy: boolean, witnessed: boolean }` | caregiver (med-certified) | Adds a count book entry for a controlled medication (`controlled_counts`, `domain/controlled.ts`). The agency's `controlled_rules` decide which kinds need a witness and who may witness (someone else, at this home, med-certified unless the rules say any staff). The server works out the expected count from earlier entries and MAR doses; a count that doesn't match alerts the home's supervisors (`controlled_count_discrepancy`). The named witness is asked to countersign (`controlled_countersign`), unless they signed in on this device: `witnessToken` is an Identity Platform ID token from that sign-in (a separate in-memory Firebase app on the device, `src/lib/auth/witness.ts`). The server accepts it only if it is from the last five minutes, belongs to the named witness, and passed their second factor when they have one; the entry is then saved as witnessed. The token is used once and never stored. Idempotent by `id`; also written offline through `sync.upload`. Entries are never edited or deleted. |
| `medication.countersign` | mutation | `{ id: uuid }` | `{ id, witnessedAt }` | the named witness | Confirms a pending count book entry. Online only; `NOT_FOUND` unless the caller is the named witness and it is still pending. |
| `medication.stop` | mutation | `{ id: uuid }` | `{ id, stoppedAt, updatedAt }` | supervisor | Sets `stopped_at` to now. Inserts a `medication_history` entry (action: 'stopped'). Stopped medications no longer appear on the daily MAR. |
| `medication.history` | query | `{ medicationId: uuid }` | `Array<{ id, action, changedBy, changedByName, changedAt }>` | supervisor | Returns the change history for a medication. |

### schedule

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `schedule.get` | query | `{ homeId: uuid, weekStart: string }` | `{ slots: Array<{ id, day, shift, assignedTo, assignedToName, status, viaLomi }> }` | caregiver | Returns the week's schedule for a home (7 days x 3 shifts). `weekStart` is an ISO date string for the Sunday that starts the week (matches the MVP's week grid). Caregivers see the full schedule for homes they are assigned to. |
| `schedule.setSlot` | mutation | `{ homeId: uuid, day: string, shift: 'am' \| 'pm' \| 'on', profileId: uuid, seen?: uuid \| null }` | `{ id, day, shift, assignedTo, status: 'filled', updatedAt }` | supervisor | Assigns a caregiver to a shift slot. Upserts into `schedule_slots` using the unique index on (agency_id, day, shift, home_id), so a slot has one assignee. Validates that the profile is assigned to the home and is active. The slot is locked first, like a coverage reply. `seen` is who the supervisor's screen showed on the shift (null for nobody); if that changed meanwhile (someone accepted it through coverage, say) the call is refused with `RULE_VIOLATION`, so an acceptance is never silently replaced. |
| `schedule.clearSlot` | mutation | `{ homeId: uuid, day: string, shift: 'am' \| 'pm' \| 'on', seen?: uuid \| null }` | `{ id, status: 'open', updatedAt }` | supervisor | Removes the assigned caregiver from a slot, setting status back to 'open'. `seen` as for `setSlot`. |
| `schedule.postOpen` | mutation | `{ homeId: uuid, day: string, shift: 'am' \| 'pm' \| 'on' }` | `{ id, status: 'open', updatedAt }` | supervisor | Marks a slot as open and triggers Lomi's coverage workflow: enqueues a Cloud Tasks job that identifies eligible caregivers (trained for the home, not already scheduled, within distance) and sends SMS offers via AWS End User Messaging. |
| `schedule.myShifts` | query | `{ weekStart?: string, weeks?: number }` | `Array<{ id, homeId, homeName, day, shift, status }>` | caregiver | Returns the caller's own scheduled shifts. Defaults to current week, up to 4 weeks ahead. |
| `schedule.copyWeek` | mutation | `{ homeId: uuid, fromWeek: string, toWeek: string }` | `{ copied: number, skipped: Array<{ day, shift, reason: 'already-assigned' \| 'finding-cover' \| 'started' \| 'unavailable' }> }` | supervisor | Copies each assignment of `fromWeek` to the same weekday and shift of `toWeek` (whole weeks apart) at one home. Only open slots are filled; shifts already started are skipped; each copy goes through the `setSlot` checks (active, trained for the home, not booked elsewhere), and one that fails is reported as `unavailable` instead of failing the week. Per frontend-audit.md finding 17. |
| `schedule.suggest` | query | `{ homeId: uuid, weekStart: string }` | `Array<{ day, shift, profileId: uuid \| null, reason }>` | supervisor | Suggested staff for each open shift of the week (not assigned, not being covered, not started), with the coverage eligibility checks (`domain/eligibility.ts`): caregivers trained at the home, free that day, under 40 hours, med-certified when a dose falls in the shift. Each suggestion counts toward that person's day and week, so suggestions never double-book; among eligible staff the one with the fewest shifts is suggested. A shift with no suggestion carries the most common reason. Nothing is assigned. |
| `schedule.applySuggestions` | mutation | `{ homeId: uuid, weekStart: string, picks: Array<{ day, shift, profileId }> (1-21) }` | same as `schedule.copyWeek` | supervisor | Assigns the suggestions the supervisor kept, with the same checks and skip reasons as `schedule.copyWeek` (a shift taken since is left as it is). Since the week may have changed, picks for shifts taken, being covered or started since are skipped first with that reason; the rest are checked again with the suggestion rules (`checkPicks()`: not already working that day, under 40 hours, med-certified when doses are due, counting each accepted pick), and a pick that no longer fits is skipped as `unavailable`. Picks must be in the week. |
| `schedule.templates` | query | `{ homeId: uuid }` | `Array<{ id, name, shifts: number, updatedAt }>` | supervisor | The home's saved weeks (`schedule_templates`), by name. |
| `schedule.saveTemplate` | mutation | `{ homeId: uuid, name: string (1-60), fromWeek: string }` | `{ id, name, shifts }` | supervisor | Saves the assignments of the week starting `fromWeek` as a template, by weekday and shift. The same name at the home is replaced; up to 20 per home; a week with no assignments is `VALIDATION_FAILED`. |
| `schedule.applyTemplate` | mutation | `{ id: uuid, toWeek: string }` | same as `schedule.copyWeek` | supervisor | Fills the open slots of the week starting `toWeek` from a template, with the same rules and skip reasons as `schedule.copyWeek`. |
| `schedule.deleteTemplate` | mutation | `{ id: uuid }` | `{ deleted: true }` | supervisor | Deletes a template; schedules it filled stay. |

### coverage

**As built:** the coverage screens read requests and steps from the synced local database (PowerSync: `coverage_requests`, `coverage_steps`, offline-sync.md §4), so `coverage.list` is not built. Candidates are never synced (offline-sync.md), so `coverage.get` (supervisor, `coverage` feature, online) returns `{ id, status, candidates: Array<{ profileId, name, eligible, reason, reply, repliedAt }> }` for the activity log's "Who was offered"; `reason` is the eligibility code (`ELIGIBILITY_REASON_LABEL` in `domain/eligibility.ts` has the wording) and steps stay on the device. `coverage.offers` (query, no input, `coverage` feature) returns the caller's own open offers for the Today screen; accepting and declining still need a connection.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `coverage.callout` | mutation | `{ homeId: uuid, day: string, shift: 'am' \| 'pm' \| 'on', reason?: string }` | `{ id, status: 'searching', createdAt }` | caregiver | Caregiver calls out from a shift. Only the assigned caregiver can call out from their own shift. Creates a `coverage_requests` row, clears the schedule slot, and enqueues Lomi's coverage search (Cloud Tasks job). Inserts `coverage_steps` entries as the search progresses. |
| `coverage.list` | query | `{ homeId?: uuid, status?: coverage_status, day?: string, limit?: number, offset?: number }` | `Array<{ id, homeId, homeName, day, shift, calledOutByName, reason, status, filledByName, createdAt }>` | caregiver | Lists coverage requests. Caregivers see only requests for their homes. Supervisors see all. |
| `coverage.get` | query | `{ id: uuid }` | Full coverage request with `candidates: Array<{ profileName, eligible, eligibilityReason, reply, repliedAt }>` and `steps: Array<{ description, occurredAt }>` | supervisor | Returns a coverage request with full candidate and step audit trail. |
| `coverage.accept` | mutation | `{ id: uuid }` | `{ id, status: 'filled', filledBy, updatedAt }` | caregiver | Caregiver accepts an offered shift. Requires connectivity (first acceptance wins, so it can't be queued offline). Runs as `app_service` (via `withService()`) because caregivers have no direct UPDATE on `coverage_candidates`. Must be one of the eligible candidates. Updates the `coverage_requests` status to 'filled', updates the `schedule_slots` entry with the new assignment (marked `viaLomi = true`), and sends notifications to the home supervisor and the family (if configured). |
| `coverage.decline` | mutation | `{ id: uuid }` | `{ candidateId, reply: 'declined', repliedAt }` | caregiver | Caregiver declines an offered shift. Updates their `coverage_candidates` row. If all candidates have declined, the coverage request status moves to 'unfilled' and the supervisor is notified. |

### clock

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `clock.clockIn` | mutation | `{ homeId: uuid, lat?: number, lng?: number }` | `{ id, homeId, clockInAt, verified, distanceMeters }` | caregiver | Records a clock-in. If `lat`/`lng` are provided, calculates distance from the home's coordinates using the Haversine formula. Coordinates and GPS accuracy are stored (`clock_in_lat`, `clock_in_lng`, `accuracy`) for EVV. `distance_meters` and `verified` are always computed on the server by the `clock_records_verify` trigger from the home's coordinates; values sent by the client are ignored. `verified` is set to `true` if `distance_meters <= home.radius` (default 150m). If location is unavailable (offline), `verified` remains `false` and must be manually acknowledged by a supervisor. Only one active (no clock-out) record per caregiver allowed. |
| `clock.clockOut` | mutation | `{ lat?: number, lng?: number }` | `{ id, clockOutAt, updatedAt }` | caregiver | Closes the caller's active clock record. Optionally captures clock-out location for EVV compliance. Rejects with `NOT_FOUND` if no active clock-in exists. |
| `clock.list` | query | `{ homeId?: uuid, profileId?: uuid, dateRange?: { from: string, to: string }, verified?: boolean, limit?: number, offset?: number }` | `Array<{ id, profileId, profileName, homeId, homeName, clockInAt, clockOutAt, verified, manualOverride, distanceMeters, acknowledged }>` | caregiver | Paginated clock records. Caregivers see only their own records. Supervisors see all records for their homes. Filterable by verification status to find missed/failed punches. |
| `clock.manualEntry` | mutation | `{ profileId: uuid, homeId: uuid, clockInAt: timestamp, clockOutAt: timestamp, reason: string }` | `{ id, manualOverride: true, acknowledged: false, createdAt }` | supervisor | Creates a manual clock entry for missed punches. Marked as `manual_override = true` and requires separate acknowledgment. The required `reason` is stored in `clock_records.reason`, and the change is audited. Refused when it overlaps another of the person's clock records. |
| `clock.correctClockOut` | mutation | `{ id: uuid, clockOutAt: timestamp, reason: string }` | the clock record | supervisor | Sets when a shift really ended, for a forgotten clock-out (an open record) or a wrong one. The time must be after the clock-in, not in the future, and not overlap the person's other records. Sets `manual_override = true` and `acknowledged = false`, stores the reason, and is audited by the row trigger. On Timesheets as "Set clock-out" / "Correct clock-out". |
| `clock.acknowledge` | mutation | `{ id: uuid }` | `{ id, acknowledged: true, updatedAt }` | supervisor | Acknowledges a manual or unverified clock entry for payroll purposes. |
| `clock.timesheet` | query | `{ profileId?: uuid, homeId?: uuid, dateRange: { from: string, to: string } }` | `{ entries: Array<ClockRecord>, totalHours: number, verifiedHours: number, unverifiedHours: number, manualHours: number }` | supervisor | Aggregated timesheet view. Breaks down hours by verification status. Used for payroll export. |

### message

**As built:** messages are synced rows, not tRPC calls. The home's messages arrive through PowerSync (`messages`, `messaging` feature) and a new message is written locally and uploaded through `sync.upload`, so it can be written offline. `message.send` and `message.list` are not built. Read receipts work the same way: showing the board writes a `message_reads` row for each unseen message, uploaded through `sync.upload` (`markRead` in the Message Service; one receipt per reader per message, none for the author). A message may name the person it is about (`client_id`, someone at the same home; the server and the `messages_insert` policy refuse anyone else); it then also shows on that person's page. Threads: a message may reply to another on the same board (`reply_to`; a reply to a reply joins the same thread, so `reply_to` always names the first message) and a thread may follow up on an incident from the same home (`incident_id`, from "Discuss with the team" on the incident).

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `message.send` | mutation | `{ homeId: uuid, text: string }` | `{ id, homeId, fromName, body, sentAt }` | caregiver | Sends a message to the home's message board. The `from_name` is auto-populated from the caller's profile. Other devices in the same home receive the message through PowerSync sync. |
| `message.list` | query | `{ homeId: uuid, limit?: number, before?: timestamp }` | `Array<{ id, fromName, body, sentAt }>` | caregiver | Returns messages for a home, ordered by `sent_at` descending. Cursor-based pagination using `before` timestamp. |
| `message.uploadPhoto` | mutation | `{ id: uuid, homeId: uuid, data: base64 JPEG (≤ 1.5 MB), width?: number, height?: number }` | `{ id, bytes }` | caregiver (own homes) | Stores a photo for a home's board (`message_photos`, schema.ts table 44; the image in `MEDIA_BUCKET`, or `.data/media` locally). The device shrinks it to 1600 px and re-encodes it as JPEG; the server keeps only JPEGs and drops their metadata segments (EXIF, XMP, comments), so no camera location is stored. Idempotent by `id`. Limited to 30 an hour per person (`TOO_MANY_REQUESTS`; on top of the general 100 a minute) so storage use stays bounded. Online only; the message that shows it is a synced row with `photo_id`, which only the uploader can set, on the same board. `messaging` feature. |
| `message.photo` | query | `{ id: uuid }` | `{ contentType: 'image/jpeg', data: base64 }` | caregiver (that board) | Returns a board photo to someone who can read that board; `NOT_FOUND` otherwise. Each view is recorded as a `photo_views` audit entry. Photos aren't synced to devices. |

### attendance

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `attendance.save` | mutation | `{ clientId: uuid, day: string, services: string[] }` | `{ id, clientId, day, services, recordedAt }` | caregiver | Records or updates daily attendance/services for a client. Services are from the domain constant list (In-home support, Day program, Community outing, etc.). Upserts on (client_id, day). Backed by the unique index on (client_id, day). If a record already exists, services are merged (union) rather than replaced. |
| `attendance.list` | query | `{ clientId?: uuid, homeId?: uuid, dateRange?: { from: string, to: string } }` | `Array<{ id, clientId, clientName, day, services, recordedAt, recordedByName }>` | caregiver | Lists attendance records. Used for daily program billing and service verification. |

### caseNote

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `caseNote.create` | mutation | `{ clientId: uuid, body: string, category?: 'care_coordination' \| 'isp_meeting' \| 'family_contact' \| 'other' }` (default `'other'`) | `{ id, clientId, authorName, body, category, createdAt }` | supervisor | Creates a case management note (distinct from shift/behavior notes). Used for care coordination, ISP meetings, family communication logs. |
| `caseNote.list` | query | `{ clientId: uuid, limit?: number, offset?: number }` | `Array<{ id, authorName, body, category, createdAt }>` (`category` is null on notes written before categories) | supervisor | Returns case notes for a client, newest first. |

### lomi

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `lomi.capabilities` | query | none | `{ draft: boolean, voice: boolean }` | caregiver | Whether the AI model and Speech-to-Text are configured on this server, so the UI offers the rules-based draft and hides voice when they aren't. |
| `lomi.draft` | mutation | `{ clientId: uuid, type: 'shift' \| 'behavior', prompt: string, goals?: Array<{ id: uuid, text: string }>, behaviors?: string[] }` | `{ content: jsonb, goals?: Array<{ goalId: uuid, trials: string[] }> }` | caregiver | Sends structured input to Claude on Vertex AI to generate a note draft. The prompt includes the client's active goals and known behaviors for context. The response is a `content` JSONB object matching the note schema. Output is always labeled as AI-generated. Rate-limited: 10 drafts/hour per user. |
| `lomi.summarize` | mutation | `{ homeId: uuid, day?: string }` | `{ summary: string, highlights: Array<{ type: string, detail: string }> }` | supervisor | Generates a daily summary for a home: notes submitted, incidents reported, MAR completeness, missed clock-ins. Uses Claude on Vertex AI. Rate-limited: 5 summaries/hour per user. As built (ai-pipeline.md "Task: summary" shape): returns `{ summary, highlights: Array<{ text }>, recommendations: Array<{ text }>, fallback, snapshot: DaySnapshot }`; `day` must not be in the future; supervisors only for their homes. Without the model, `summary` is written by rules from the snapshot (`fallback: true`). |
| `lomi.edit` | mutation | `{ clientId: uuid, section: 'activities' \| 'meals' \| 'mood' \| 'health' \| 'before' \| 'behavior' \| 'response' \| 'outcome' \| 'duration', current: string, input: string }` | `{ text: string, fallback: boolean }` | caregiver | Per-section proposal, explicitly reviewed before use. Current text max 6000, additional observations max 2000 characters. Rate-limited: 60/hour per user. |
| `lomi.route` | mutation | `{ clientId: uuid, message: string, current: { activities, meals, mood, health } }` | `{ updates: Array<{ section, text }>, fallback: boolean }` | caregiver | Follow-up shift observations produce complete section replacement proposals for explicit review. Combined current text and message max 8000 characters; message max 2000. No automatic goal scores. Rate-limited: 30/hour per user. |
| `lomi.transcribe` | mutation | `{ audio: string, mimeType: string }` | `{ text: string, durationMs: number }` | caregiver | Sends audio (base64-encoded) to Google Speech-to-Text (Chirp model) for transcription. Returns plain text. Used to dictate note content on mobile. Max 5 minutes of audio for a brain dump, 30 seconds for per-section and chat recordings (see ai-pipeline.md). Rate-limited: 60 transcriptions/hour per user (as built, each request is one segment of at most 55 s; a 5-minute brain dump is up to 6 requests, split on the device at pauses, see ai-pipeline.md). `mimeType` must be one of: `audio/webm`, `audio/mp4`, `audio/wav`. |

### analytics

**As built:** one procedure, `analytics.weekly({ homeId?, weeks = 4 })`, returns every weekly series the analytics screen draws (frontend-spec-3.md §4.4): coverage (needing cover, fill rate, minutes to fill), documentation (notes signed, drafted with Lomi, hours from signing to approval, sent back), care (doses given, refused or held, incidents) and goal progress (independent rate per goal). Weeks start Monday in the agency's time zone. Supervisors and admins on plans with `analytics`. The four procedures below are not built separately.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `analytics.overview` | query | `{ homeId?: uuid, dateRange?: { from: string, to: string } }` | `{ notesCount, notesApproved, notesPending, incidentCount, incidentsBySeverity, marCompletionRate, clockVerificationRate, coverageFillRate }` | supervisor | Dashboard overview metrics. If `homeId` is omitted, returns agency-wide aggregates. |
| `analytics.documentation` | query | `{ homeId?: uuid, dateRange?: { from: string, to: string } }` | `{ notesByDay: Array<{ day, count, approved, pending }>, avgApprovalTimeHours: number, lomiDraftRate: number, returnRate: number }` | supervisor | Documentation completeness and quality metrics over time. |
| `analytics.coverage` | query | `{ homeId?: uuid, weeks?: number }` | `{ calloutsByWeek: Array<{ week, count }>, fillRate: number, avgFillTimeMinutes: number, topCalloutReasons: Array<{ reason, count }> }` | supervisor | Shift coverage analytics. Shows callout trends, fill rates, and common callout reasons. |
| `analytics.care` | query | `{ homeId?: uuid, clientId?: uuid, dateRange?: { from: string, to: string } }` | `{ goalProgress: Array<{ goalId, text, trialsCount, completionRate }>, vitalsAlerts: number, seizureCount: number, incidentTrend: Array<{ week, count }> }` | supervisor | Clinical care metrics. Goal tracking progress, vitals alerts, and incident trends. |

### report

`report.exportCoverage` is a POST mutation with strict `{homeId, expectedProfileId, fromDay, toDay, format: 'csv'|'json'}` input. It requires coverage and supervisor/admin access with reports_basic for CSV or reports for CSV/JSON, then rechecks active account/auth/role/plan and current assigned-home access (admins agency-wide) under RLS. It exports at most 1,000 total request/candidate/activity/visible legacy notification/prospective offer-evidence rows, 93 inclusive agency-calendar shift-start days and 8 MiB, without partial output. Personal notification visibility remains existing admin-or-own RLS. The content-free append-only evidence table is separately home-scoped to assigned supervisors/admins and starts at migration with no backfill; it distinguishes queued, provider-accepted, delivery-reported and terminal outcomes. Eligibility is not send evidence, provider acceptance is not device delivery, absent evidence is unknown and names are current labels. Audits contain metadata only. This is separate from the clinical source enum, queued Care jobs and external API. See docs/coverage-export.md.

**As built:** immediate reports use audited POST mutations: `report.exportClinical` (`notes`, `mar`, `health`, `incidents`, `attendance`, `goals`; up to 93 agency-calendar days, 1,000 source records and 8 MB; CSV/JSON/HTML/PDF) and `report.exportTimesheet` (bounded CSV/JSON payroll). The account-owned queued Care workflow is also implemented through POST-only `report.requestBackground`, `report.backgroundStatus`, `report.recentBackground` and `report.downloadBackground`. Inputs bind the expected current profile; supervisors are restricted to currently assigned homes, admins to agency homes, and status/download recheck current ownership and person/home membership. CSV/JSON/HTML permit 10,000 source records, PDF 2,000, all within 93 agency-calendar days and 8 MB. Generation expires after 15 minutes; prepared private files after 24 hours. Completion never downloads automatically. Recent recovery returns up to 20 accessible home jobs from the account's latest 50 requests. API callers cannot retrieve these account-owned jobs. Local in-process timers do not survive restart. See docs/report-exports.md and docs/queued-care-reports.md.

The legacy `report.generate`/`status`/`download` procedure names in the target table below are not mounted on the in-app router. External API report jobs are a separate interface, not an alternate way to access account-owned Care jobs.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `report.generate` | mutation | `{ type: 'incidents' \| 'notes' \| 'mar' \| 'goals' \| 'attendance' \| 'timesheets' \| 'audit', homeId?: uuid, clientId?: uuid, dateRange: { from: string, to: string }, format?: 'csv' \| 'pdf' }` | `{ reportId: uuid, status: 'queued' }` | supervisor | Enqueues a report generation job via Cloud Tasks. Returns immediately with a report ID. Reports are generated asynchronously and stored in a private Cloud Storage bucket for 24 hours, downloaded through a short-lived signed URL. |
| `report.status` | query | `{ reportId: uuid }` | `{ reportId, status: 'queued' \| 'processing' \| 'ready' \| 'failed', readyAt?: timestamp }` | supervisor | Polls report generation status. |
| `report.download` | query | `{ reportId: uuid }` | Binary stream (CSV or PDF) | supervisor | Downloads a completed report. Returns the file as a streaming response with appropriate content-type headers. Rejects if status is not 'ready' or if the report has expired. |

### intake

Implemented placement extension: create/update accept optional strict `placementNeeds: { medicationCertifiedStaff: 'unknown' | 'required' | 'not_required' }`. Omission on create defaults unknown; omission on update preserves the recorded value. Full referral responses include `placement_needs` plus `placement: { complete, homes: [{ homeId, homeName, availableRooms, certifiedCaregivers, guidance }] }`. Guidance is `review_candidate`, `needs_review`, `certification_gap` or `no_available_room`, never clinical eligibility. `getReferral`/`updateReferral` load current caller-visible facts, and admission returns a freshly computed `placement` alongside its IDs. There is no separate matching procedure or automatic assignment. The comparison is bounded and marks truncation incomplete; refresh is explicit in the UI. See services.md for fact limits and human review requirements.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `intake.createReferral` | mutation | `{ contactName?: string, contactPhone?: string, contactEmail?: string, clientName?: string, source?: string, notes?: string }` | `{ id, status: 'inquiry', createdAt }` | supervisor | Creates a new referral/inquiry record. `source` tracks where the referral came from (e.g., 'case manager', 'family', 'state agency'). |
| `intake.listReferrals` | query | `{ status?: string, limit?: number, offset?: number }` | `Array<{ id, contactName, clientName, source, status, assignedHomeName, createdAt }>` | supervisor | Lists referrals with optional status filter. Statuses: 'inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed' (per referral_status enum in schema.ts). |
| `intake.getReferral` | query | `{ id: uuid }` | Full referral record with all fields | supervisor | Returns a single referral with full details. |
| `intake.updateReferral` | mutation | `{ id: uuid, status?: string, assignedHomeId?: uuid, contactName?: string, contactPhone?: string, contactEmail?: string, notes?: string }` | `{ id, status, assignedHomeId, updatedAt }` | supervisor | Updates referral status and details. Status must be one of: 'inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed'. When status changes to 'accepted', the referral can be converted to a client record. |
| `intake.addReferralNote` | mutation | `{ referralId: uuid, body: string }` | `{ id, status, body, authorName, createdAt }` | supervisor | Adds a note at the referral's current stage (US-29): a call, a tour, why it was declined. `status` is the stage when it was written. Append-only (`referral_notes`). |
| `intake.listReferralNotes` | query | `{ referralId: uuid }` | `Array<{ id, status, body, authorName, createdAt }>` | supervisor | A referral's stage notes, oldest first. |
| `intake.convertToClient` | mutation | `{ referralId: uuid, homeId: uuid, name: string, firstName?: string, roomId?: uuid }` | `{ clientId: uuid, referralId: uuid }` | supervisor | Converts an accepted referral into a client record. Optionally assigns a room. Updates the referral status to 'placed'. Creates the client and client_health_info rows. |
| `intake.listRooms` | query | `{ homeId?: uuid, status?: 'available' \| 'occupied' \| 'reserved' }` | `Array<{ id, homeId, homeName, name, capacity, occupiedByName, status }>` | supervisor | Returns room availability across homes. Counts available room records, never beds; reserved or occupied rooms cannot be admitted into. |
| `intake.createRoom` | mutation | `{ homeId: uuid, name: string, capacity?: number, status?: 'available' \| 'reserved' }` | Room record | supervisor | Creates a room in an accessible agency home. Names are trimmed, at most 100 characters, and unique ignoring case within a home. Capacity is an integer from 1 to 20, default 1, and is informational: one room record tracks one occupant. New rooms cannot start occupied. |
| `intake.updateRoom` | mutation | `{ id: uuid, name?: string, capacity?: number, status?: string, occupiedBy?: uuid \| null }` | Room record | supervisor | Updates name, physical capacity, status and occupancy. A room cannot move between homes. Only an active client in the same home without another room may be assigned. Release and save before replacing an occupant. Home-row locks serialize configuration, duplicate-name checks, assignments and admission. Capacity never creates additional assignable beds. |

### sync

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `sync.upload` | mutation | `{ transactionId: number, ops: Array<{ op: 'PUT' \| 'PATCH' \| 'DELETE', table: string, id: uuid, data?: jsonb }> }` | `{ applied: uuid[], rejected: Array<{ id: uuid, table: string, code: string, message: string }>, notices: Array<{ id: uuid, table: string, code: 'MAR_CONFLICT', message: string }> }` | caregiver | The only path for offline writes (offline-sync.md §3). Each op runs in its own savepoint, so a rejected op is undone on its own; later ops still run (ones that depend on it then fail by themselves). Identity columns sent by the device (author, recorder, agency, home) are ignored; services set them from the session. Writable today: `notes` PUT/PATCH, `mar_records` PUT (corrections via `amends_id`), `messages` PUT, `message_reads` PUT, `controlled_counts` PUT; everything else is `NOT_ALLOWED_OFFLINE` until its service exists. `notices` are applied ops the user should hear about (a dose slot also recorded by someone else). Each op is dispatched, in order, to the same service function its online procedure uses, with the same Zod validation, role and feature checks, business rules, notifications and audit. Ops on tables that aren't writable offline are rejected. Idempotent: ops are keyed by record ID, so a retried transaction doesn't duplicate rows. A duplicate MAR dose slot is stored as a conflict record rather than rejected. `code` values are in offline-sync.md Appendix B. Messages never contain PHI. |

### device

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `device.key` | mutation | `{ deviceId: uuid }` | `{ key: string }` (base64url) | caregiver | Issues this device's local database encryption key (offline-sync.md "Local Database Encryption Key"); the same key for the same device until it is revoked, then `FORBIDDEN`. The client keeps it only wrapped with the PIN. |

### notification

Implemented own-account settings procedures (all require the notifications entitlement): `get` returns one of the caller's notifications `{ id: uuid }` for the inbox detail view; `pushConfiguration` returns `{ enabled }`, true only when the server sends real push (`PUSH_DRIVER=fcm`); `quietHours` reads `{ start, end, timeZone }`, and `setQuietHours` saves `{ start: HH:MM, end: HH:MM }` after validating a 4–10 hour period. `pushDevices` returns only `{ id, platform, lastSeenAt, createdAt }`; `registerPushDevice` accepts `{ token, platform: 'web' | 'ios' | 'android' }` and returns `{ id }` only when FCM registration is configured; `removePushDevice` accepts `{ id: uuid }` and returns `{ removed: boolean }`. Every target profile comes from the authenticated caller. Registration is limited to ten devices, never transfers another profile's token, and does not call providers. Browser-side push provisioning remains separate work.

| Procedure | Type | Input | Output | Min Role | Description |
|---|---|---|---|---|---|
| `notification.list` | query | `{ unreadOnly?: boolean, limit?: number, offset?: number }` | `Array<{ id, type, title, body, channel, status, sentAt, readAt, referenceId, referenceType }>` | caregiver | Returns the caller's notifications, newest first. |
| `notification.markRead` | mutation | `{ ids: uuid[] }` | `{ updated: number }` | caregiver | Marks one or more notifications as read. |
| `notification.updatePreferences` | mutation | `{ preferences: Array<{ notificationType: NotificationType, pushEnabled?: boolean, smsEnabled?: boolean, emailEnabled?: boolean }> }` | `{ updated: number }` | caregiver | Updates notification channel preferences. `notificationType` must be one of the 19 canonical types defined in notifications.md: `coverage_offer`, `coverage_accepted`, `coverage_unfilled`, `note_submitted`, `note_approved`, `note_sent_back`, `med_refusal`, `med_possible_double_dose`, `med_due_reminder`, `health_alert`, `incident_reported`, `incident_high_severity`, `incident_review_needed`, `shift_reminder`, `clock_anomaly`, `clock_missed`, `daily_summary`, `referral_status_change`, `system_maintenance`. Mandatory notification types (med_refusal, med_possible_double_dose, health_alert, incident_reported, incident_high_severity, coverage_unfilled) cannot be fully disabled. |

> **Note:** Notification preferences are read from the local PowerSync database rather than via a dedicated tRPC query. The `notification_preferences` table syncs to the client for the authenticated user's profile, so a `notification.getPreferences` query is not needed.

Development-only `/dev/notifications/api` uses a separate router (not `appRouter`):
`recent({ scope?: 'mine' | 'agency' }?)` returns the latest 50 notifications in
the chosen scope (default own account, current agency only); `preview({ type })`
accepts only a known notification type and returns synthetic rendered delivery
previews for that caller without rows, jobs or providers. Both require an active
admin and the guarded loopback demo environment described in notifications.md.
`sendTest({ type, confirm: true })` queues fixed synthetic content for the caller
and returns `{ deliveriesQueued }`, not a delivery confirmation. It runs normal
delivery/escalation rules and rejects extra recipient, agency or text fields.
`pendingTasks()` lists up to 100 current-agency synthetic notification escalation
tasks as `{ id, job, type, step, scheduledAt }` without raw payloads.
`fireTask({ id, confirm: true })` rechecks event ownership and the synthetic marker
before claiming the local timer. Unknown, unmarked or foreign tasks return
NOT_FOUND. The adapter rechecks the safe development environment and only accepts
notification escalation jobs; it never fires report or maintenance jobs.
The HTTP endpoint returns 404 outside an actual development build.

### audit

**As built:** `audit.list` returns metadata only (who, what, when; no `oldValues`, `newValues`, IP or user agent), so the old and new values, which can hold client data, are shown one entry at a time through `audit.get`, and each `audit.get` is recorded as an `audit_views` entry. Admins only, as this table says; security.md "Access" also mentions supervisors, and RLS allows them, but the procedures follow this table. The screen is `/dashboard/audit`.

The audit screen discards late list, detail and CSV responses after account/role/plan/privacy changes, navigation start or disposal. Separate operation controllers prevent older detail selections from replacing newer ones; Close also cancels a pending detail view. Locking clears loaded entries and record values; filters remain for an explicit reload after unlock. Offline retains already loaded same-context data for reading but does not open new entries or download. These UI guards preserve the existing agency-wide admin procedures, append-only audit behavior and metadata-only CSV contract.


| Procedure | Type | Input | Output | Min Role | Feature Gate | Description |
|---|---|---|---|---|---|---|
| `audit.list` | query | `{ dateRange?: { from: string, to: string }, tableName?: string, recordId?: uuid, performedBy?: uuid, action?: 'INSERT' \| 'UPDATE' \| 'DELETE', limit?: number, offset?: number }` | `Array<{ id, tableName, recordId, action, oldValues, newValues, performedBy, performedByName, ipAddress, userAgent, createdAt }>` | admin | audit_log | Returns paginated audit log entries. Filterable by date range, entity (table + record), actor, and action type. |
| `audit.export` | mutation | `{ dateRange: { from: string, to: string }, tableName?: string, performedBy?: uuid, action?: 'INSERT' \| 'UPDATE' \| 'DELETE' }` | `{ filename, contentType: 'text/csv', content, rows }` | admin | audit_log | CSV of the same metadata `audit.list` returns (time, action, record type and ID, who), never old or new values. At most 93 days and 10,000 entries (`VALIDATION_FAILED` beyond that, nothing partial). Each download is recorded as a `report_exports` audit entry (`type: 'audit_log'`). |
| `audit.get` | query | `{ id: uuid }` | `{ id, tableName, recordId, action, oldValues, newValues, performedBy, performedByName, ipAddress, userAgent, createdAt }` | admin | audit_log | Returns a single audit log entry by ID. |

### apiKey

API keys for the external API (openapi.yaml). Not in the original router list; added with the Integration Service (services.md §20). The screen is `/dashboard/api-keys`. The mounted view drops late responses and clears one-time plaintext keys after account/role/feature/privacy changes, hidden/offline transitions, navigation or disposal; online visible unlocked access and explicit refresh are required. Response cancellation does not undo server changes: an interrupted creation may have completed, so refresh the list and revoke unused keys before creating replacements. Hash-only storage, one-time creation responses and existing admin agency-wide scope remain unchanged.

| Procedure | Type | Input | Output | Min Role | Feature Gate | Description |
|---|---|---|---|---|---|---|
| `apiKey.list` | query | none | `Array<{ id, name, prefix, scope, lastUsedAt, revokedAt, createdAt }>` | admin | none | The agency's keys, newest first. Never returns the key or its hash. |
| `apiKey.create` | mutation | `{ name: string (1-80), scope?: 'read' | 'write' }` | `{ id, name, prefix, scope, createdAt, key }` | admin | none | Creates a key. `key` (`guad_` + 43 base64url characters) is returned only here; only its SHA-256 is stored. |
| `apiKey.revoke` | mutation | `{ id: uuid }` | `{ revoked: true }` | admin | none | Revokes a key at once. Keys are never deleted, so access history stays auditable. The webhooks the key registered (`webhooks.created_by_key_id`) are stopped too, and the sweep skips any whose key is revoked. |
| `apiKey.webhooks` | query | none | `Webhook[]` (openapi.yaml view, no secret) | admin | none | The agency's webhooks, on the API keys page, so ones registered through the API can be seen without a key. |
| `apiKey.deleteWebhook` | mutation | `{ id: uuid }` | `{ deleted: true }` | admin | none | Removes a webhook and its delivery log. |

---

## Error Codes

All tRPC errors use standard tRPC error codes with additional `cause` metadata:

| Code | Usage |
|---|---|
| `UNAUTHORIZED` | Missing, expired or revoked session cookie |
| `FORBIDDEN` | Insufficient role or accessing data outside assigned homes |
| `NOT_FOUND` | Record does not exist or is outside the caller's tenant/home scope |
| `BAD_REQUEST` | Input validation failure (Zod) or business rule violation |
| `CONFLICT` | Duplicate record (e.g., MAR already recorded for this med/day) |
| `TOO_MANY_REQUESTS` | Rate limit exceeded on AI/transcription endpoints |
| `INTERNAL_SERVER_ERROR` | Unhandled server error (no PHI in error message) |

## Live Updates

tRPC subscriptions are not used, and there is no separate realtime service. Live updates come from PowerSync: when a row changes in Postgres, PowerSync streams it to every device whose sync rules include it, typically within a few seconds. Screens use PowerSync watched queries, so they re-render on their own:

- messages in a home (`messages`)
- schedule slot changes (`schedule_slots`)
- coverage request status (`coverage_requests`, `coverage_steps`)
- per-user notifications (`notifications`)

Online-only data (audit log, analytics, case notes) is fetched through tRPC queries and refreshed on focus.

> **Note on events table:** The `events` table (schema.ts) stores domain events (e.g., `note.submitted`, `shift.filled`, `incident.created`) and is written server-side by the Audit Service's `emitEvent()` function. It has no corresponding tRPC procedures. Events are not synced to devices; analytics procedures read them server-side.

## Pagination Convention

List queries that can return large result sets accept `limit` (default 50, max 200) and `offset` (default 0). Responses include the array of items directly. The client tracks whether more items exist by checking if `items.length === limit`.

Exception: `message.list` uses cursor-based pagination (`before` timestamp) for efficient real-time message loading.

## Offline Behavior

All mutations are designed to be idempotent where possible (upserts on natural keys, UUID primary keys generated client-side). When the app is offline, PowerSync queues mutations locally. On reconnect, the queue is sent in order to `sync.upload`, which applies each op through the owning service. The server resolves conflicts using last-write-wins with server timestamps, with two exceptions: attendance merges service lists, and a duplicate MAR dose slot is kept as a conflict record and the supervisor is alerted (offline-sync.md §5).
