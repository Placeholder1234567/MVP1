# Notification System

## 1. Overview

Guad's notification system delivers time-sensitive alerts across three channels -- push (FCM), SMS (Twilio), and email (Amazon SES) -- using BullMQ + Redis for reliable, asynchronous job processing. Notification workers run as a separate Node.js process alongside the SvelteKit server to avoid blocking request handling with external API latency.

### Architecture Summary

```
Trigger (service call)
  |
  v
NotificationService.send() / .sendBatch()
  |
  v
Insert row(s) into `notifications` table (one row per channel, status: 'pending')
  |
  v
Enqueue job(s) to BullMQ queues based on channel preferences
  |
  +---> notifications:push    (FCM)
  +---> notifications:sms     (Twilio)
  +---> notifications:email   (SES)
  +---> notifications:escalation (delayed jobs for follow-up)
  +---> notifications:digest  (batched daily summaries)
  |
  v
Worker processes pick up jobs, dispatch via vendor API
  |
  v
Update `notifications.status` to 'sent' / 'failed'
Update `notifications.sent_at`
```

### Design Principles

- **One row per channel.** When a notification is sent via multiple channels (e.g., push + SMS), one `notifications` row is created per channel. This enables per-channel status tracking (`sent_at`, `read_at`, `status`). The escalation engine checks `read_at` on any row matching the same `(type, reference_id, profile_id)` tuple to determine acknowledgment.
- **PHI safety first.** SMS and email bodies never contain client names, DOBs, diagnoses, medications, or clinical content. Push notifications may include limited clinical context because they are delivered to an authenticated device session.
- **Reference by ID.** Job payloads carry record IDs, not PHI. Workers fetch needed data from Postgres at execution time. This keeps Redis free of protected health information.
- **Escalation by default.** High-priority notifications that go unacknowledged trigger automatic escalation via BullMQ delayed jobs.
- **User control with guardrails.** Users can customize channel preferences per notification type, but mandatory notifications (incidents, med refusals, high-severity alerts) cannot be disabled.
- **Tenant-scoped.** Every notification record carries `agency_id`. Notification preferences are per-user, per-agency.

---

## 2. Notification Types

### 2.1 coverage_offer

| Field | Value |
|-------|-------|
| **Trigger** | Coverage request created; eligible candidate identified by `findCandidates()` |
| **Recipients** | Each eligible caregiver (from `coverage_candidates` where `eligible = true`) |
| **Channels** | Push (primary) + SMS (primary) |
| **Priority** | High |
| **Template (Push)** | `"Coverage needed: {shiftLabel} shift at {homeName} on {dayFormatted}. Tap to accept or decline."` |
| **Template (SMS)** | `"Guad: Can you cover {shiftLabel} at {homeName} on {dayFormatted}? Reply YES or NO."` |
| **PHI Safety** | Safe on all channels. Contains only home name, shift, and date -- no client info. |
| **Deep Link** | `/coverage/{coverageRequestId}` |
| **Escalation** | If no reply after 15 min, send reminder SMS. Re-offering to the next batch at 30 min is handled by the Schedule Service via `CoverageTimeoutJob`, not the notification escalation engine. Max 3 coverage rounds before marking `coverage_unfilled`. |

### 2.2 coverage_accepted

| Field | Value |
|-------|-------|
| **Trigger** | `coverage_candidates.reply` set to `'accepted'`; `fillShift()` called |
| **Recipients** | Requesting supervisor + original callout staff + all other candidates who were offered |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"{staffName} accepted coverage for {shiftLabel} at {homeName} on {dayFormatted}."` |
| **Template (SMS)** | N/A (push only) |
| **PHI Safety** | Safe. Staff name and shift info only. |
| **Deep Link** | `/schedule?home={homeId}&week={weekStart}` |
| **Escalation** | None |

### 2.3 coverage_unfilled

| Field | Value |
|-------|-------|
| **Trigger** | All 3 coverage rounds exhausted with no acceptance, or deadline passed |
| **Recipients** | All supervisors for the home + agency admin |
| **Channels** | Push + SMS |
| **Priority** | Urgent |
| **Template (Push)** | `"URGENT: No one accepted {shiftLabel} at {homeName} on {dayFormatted}. Manual intervention required."` |
| **Template (SMS)** | `"Guad URGENT: {shiftLabel} at {homeName} on {dayFormatted} is unfilled. Please assign manually."` |
| **PHI Safety** | Safe. Shift info only. |
| **Deep Link** | `/coverage/{coverageRequestId}` |
| **Escalation** | Push immediately, SMS at 0 min. If not read within 30 min, SMS to agency admin. |

### 2.4 note_submitted

| Field | Value |
|-------|-------|
| **Trigger** | Note status transitions from `draft` to `submitted` via `signNote()` |
| **Recipients** | All supervisors assigned to the note's home |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"{authorName} submitted a {noteTypeLabel} for review ({homeName}, {dayFormatted})."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. Author name, note type, home, date -- no clinical content. |
| **Deep Link** | `/notes/{noteId}/review` |
| **Escalation** | If not read within 24 hours, push reminder to supervisor. |

### 2.5 note_approved

| Field | Value |
|-------|-------|
| **Trigger** | Note status transitions to `approved` via `approveNote()` |
| **Recipients** | Note author (caregiver) |
| **Channels** | Push |
| **Priority** | Low |
| **Template (Push)** | `"Your {noteTypeLabel} for {dayFormatted} at {homeName} has been approved."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. No clinical content. |
| **Deep Link** | `/notes/{noteId}` |
| **Escalation** | None |

### 2.6 note_sent_back

| Field | Value |
|-------|-------|
| **Trigger** | Note status transitions to `returned` via `returnNote()` |
| **Recipients** | Note author (caregiver) |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"Your {noteTypeLabel} for {dayFormatted} was sent back for revision. Tap to view supervisor feedback."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. Supervisor comment is NOT included in push body -- only visible after deep link tap into authenticated app. |
| **Deep Link** | `/notes/{noteId}/edit` |
| **Escalation** | If not read within 8 hours, push reminder. If not read within 24 hours, second push reminder. |

### 2.7 med_refusal

| Field | Value |
|-------|-------|
| **Trigger** | MAR record created with `status = 'refused'` or `status = 'held'` via `recordDose()` |
| **Recipients** | All supervisors for the client's home |
| **Channels** | Push (immediate) + SMS (if unacknowledged after 1 hour) |
| **Priority** | High |
| **Template (Push)** | `"Medication {refusedOrHeld} recorded at {homeName}. Tap to review and acknowledge."` |
| **Template (SMS)** | `"Guad: A medication was {refusedOrHeld} at {homeName}. Please review in the app."` |
| **PHI Safety** | CRITICAL: SMS and push must NEVER include client name, medication name, dose, or reason. Use only "a medication" generically. Push body may say "at {homeName}" but nothing more specific. Full details visible only after tapping deep link into authenticated app. |
| **Deep Link** | `/mar/{marRecordId}` |
| **Escalation** | Push at 0 min. If `acknowledged = false` after 1 hr, SMS to supervisor. If still unacknowledged after 2 hr, SMS to agency admin. |

### 2.8 med_due_reminder

| Field | Value |
|-------|-------|
| **Trigger** | Scheduled medication `scheduled_time` is approaching (30 min before) and no MAR record exists for today |
| **Recipients** | On-shift caregiver at the client's home (resolved from `schedule_slots` for current shift) |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"Medication administration due at {homeName} in 30 minutes."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. No client name, medication name, or dose in push body. Generic reminder only. |
| **Deep Link** | `/mar?home={homeId}&day={today}` |
| **Escalation** | If medication remains unadministered 30 min past scheduled time, push alert to supervisor with elevated priority. |

### 2.9 health_alert

| Field | Value |
|-------|-------|
| **Trigger** | `checkFlags()` returns non-empty array after `createEntry()` (vital reading out of range) |
| **Recipients** | All supervisors for the client's home |
| **Channels** | Push (immediate) + SMS (if unacknowledged after 1 hour) |
| **Priority** | High |
| **Template (Push)** | `"Health alert recorded at {homeName}. Tap to review flagged reading."` |
| **Template (SMS)** | `"Guad: Health alert at {homeName}. Please review in the app."` |
| **PHI Safety** | CRITICAL: Never include the specific vital reading, client name, or flag description in push or SMS. The flag details (e.g., "Temperature above 100.4F") are visible only inside the authenticated app. |
| **Deep Link** | `/health/{healthEntryId}` |
| **Escalation** | Push at 0 min. If `acknowledged = false` after 1 hr, SMS to supervisor. If still unacknowledged after 2 hr, SMS to agency admin. |

### 2.10 incident_reported

| Field | Value |
|-------|-------|
| **Trigger** | `createIncident()` called with any severity |
| **Recipients** | All supervisors for the incident's home |
| **Channels** | Push (primary). SMS fallback if push permission is denied (mandatory notification). |
| **Priority** | High |
| **Template (Push)** | `"New {incidentType} incident reported at {homeName}. Tap to review."` |
| **Template (SMS)** | `"Guad: New incident reported at {homeName}. Please review in the app."` (used only for push-denied fallback; incident type is omitted from SMS for PHI safety in small homes) |
| **PHI Safety** | Incident type (e.g., "Fall", "Seizure") is acceptable in push because it describes an event category, not a specific client. Client name is NEVER included. |
| **Deep Link** | `/incidents/{incidentId}` |
| **Escalation** | Severity-based. Low/medium: push only, no escalation. High: triggers `incident_high_severity` flow. |

### 2.11 incident_high_severity

| Field | Value |
|-------|-------|
| **Trigger** | `createIncident()` called with `severity = 'high'` |
| **Recipients** | All supervisors for the home + agency admin |
| **Channels** | Push + SMS (both immediate) |
| **Priority** | Urgent |
| **Template (Push)** | `"URGENT: High-severity {incidentType} incident at {homeName}. Immediate review required."` |
| **Template (SMS)** | `"Guad URGENT: High-severity incident at {homeName}. Review immediately in the app."` |
| **PHI Safety** | SMS contains incident severity and home name only. Incident type is acceptable in push but NOT in SMS. Client name, injury details, and description are NEVER included in any notification body. |
| **Deep Link** | `/incidents/{incidentId}` |
| **Escalation** | Push + SMS at 0 min. If `read_at` is null after 15 min, re-send SMS to supervisor. If still unread after 30 min, SMS to agency admin (if not already a recipient). Max 3 escalation levels. |

### 2.12 incident_review_needed

| Field | Value |
|-------|-------|
| **Trigger** | Incident with `status = 'open'` is older than 24 hours without supervisor review |
| **Recipients** | All supervisors for the home + agency admin |
| **Channels** | Push + SMS |
| **Priority** | High |
| **Template (Push)** | `"Incident at {homeName} from {dayFormatted} still awaiting review."` |
| **Template (SMS)** | `"Guad: Open incident at {homeName} from {dayFormatted} needs review."` |
| **PHI Safety** | Safe. Home name and date only. |
| **Deep Link** | `/incidents/{incidentId}` |
| **Escalation** | Repeats daily until incident status changes from `open`. Stops after 3 days -- marks `escalation_exhausted`. |

### 2.13 shift_reminder

| Field | Value |
|-------|-------|
| **Trigger** | 1 hour before scheduled shift start (resolved from `schedule_slots`) |
| **Recipients** | Assigned caregiver |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"Reminder: Your {shiftLabel} shift at {homeName} starts in 1 hour."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. Shift and home info only. |
| **Deep Link** | `/schedule?home={homeId}&week={weekStart}` |
| **Escalation** | None |

### 2.14 clock_anomaly

| Field | Value |
|-------|-------|
| **Trigger** | `clockIn()` records `verified = false` (distance exceeds home geofence radius) or `manual_override = true` |
| **Recipients** | All supervisors for the home |
| **Channels** | Push |
| **Priority** | Normal |
| **Template (Push)** | `"{staffName} clocked in at {homeName} outside the geofence ({distanceMeters}m away)."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. Staff name and location data only -- no client info. |
| **Deep Link** | `/timekeeping/{clockRecordId}` |
| **Escalation** | None |

### 2.15 clock_missed

| Field | Value |
|-------|-------|
| **Trigger** | `MissedPunchCheckJob` identifies clock-in without clock-out at shift boundary |
| **Recipients** | The caregiver who missed the punch + their supervisor |
| **Channels** | Push to caregiver, Push + SMS to supervisor |
| **Priority** | High (supervisor), Normal (caregiver) |
| **Template (Push, caregiver)** | `"You forgot to clock out at {homeName}. Please contact your supervisor for a manual correction."` |
| **Template (Push, supervisor)** | `"{staffName} missed clock-out at {homeName} for {shiftLabel} on {dayFormatted}."` |
| **Template (SMS, supervisor)** | `"Guad: {staffName} missed clock-out at {homeName} on {dayFormatted}. Review needed."` |
| **PHI Safety** | Safe. Staff name and shift info only. |
| **Deep Link** | `/timekeeping?home={homeId}&day={day}` |
| **Escalation** | None (the missed punch job itself is the escalation) |

### 2.16 daily_summary

| Field | Value |
|-------|-------|
| **Trigger** | `DigestJob` fires at 06:00 in the agency's timezone daily |
| **Recipients** | All supervisors + agency admins |
| **Channels** | Email (primary) + Push (badge) |
| **Priority** | Low |
| **Template (Push)** | `"Your daily summary for {dayFormatted} is ready. Check your email."` |
| **Template (Email)** | See Section 7 (SES Integration) for full layout. Subject: `"Guad Daily Summary - {agencyName} - {dayFormatted}"` |
| **PHI Safety** | Email body contains aggregated counts only -- no client names. Example: "3 notes pending review, 1 incident (medium severity), 2 med refusals." Links go to authenticated app screens. |
| **Deep Link** | `/dashboard` |
| **Escalation** | None |

### 2.17 referral_status_change

| Field | Value |
|-------|-------|
| **Trigger** | `updateReferralStatus()` transitions referral to a new status |
| **Recipients** | Agency admin + supervisors with intake access |
| **Channels** | Push |
| **Priority** | Low |
| **Template (Push)** | `"Referral status updated to '{newStatus}'. Tap to view details."` |
| **Template (SMS)** | N/A |
| **PHI Safety** | Safe. Referral status only. Referral client name is PHI and MUST NOT be included in the push body. |
| **Deep Link** | `/intake/referrals/{referralId}` |
| **Escalation** | None |

### 2.18 system_maintenance

| Field | Value |
|-------|-------|
| **Trigger** | Admin-initiated or automated deployment notification |
| **Recipients** | All active profiles in the agency (or all agencies for platform-wide) |
| **Channels** | Push + Email |
| **Priority** | Low |
| **Template (Push)** | `"Guad will undergo scheduled maintenance on {maintenanceDate} from {startTime} to {endTime}."` |
| **Template (Email)** | Subject: `"Scheduled Maintenance - {maintenanceDate}"`. Body includes timing, impact description, and instructions to complete offline sync before maintenance window. |
| **PHI Safety** | Safe. System info only. |
| **Deep Link** | None |
| **Escalation** | None |

### Notification Type Summary Table

| Type | Priority | Push | SMS | Email | Mandatory | Escalation |
|------|----------|------|-----|-------|-----------|------------|
| `coverage_offer` | High | Y | Y | N | N | 15 min reminder (re-offer via Schedule Service) |
| `coverage_accepted` | Normal | Y | N | N | N | None |
| `coverage_unfilled` | Urgent | Y | Y | N | Y | 30 min to admin |
| `note_submitted` | Normal | Y | N | N | N | 24 hr reminder |
| `note_approved` | Low | Y | N | N | N | None |
| `note_sent_back` | Normal | Y | N | N | N | 8 hr, 24 hr reminders |
| `med_refusal` | High | Y | Y* | N | Y | 1 hr SMS, 2 hr admin SMS |
| `med_due_reminder` | Normal | Y | N | N | N | 30 min overdue alert |
| `health_alert` | High | Y | Y* | N | Y | 1 hr SMS, 2 hr admin SMS |
| `incident_reported` | High | Y | Y** | N | Y | Severity-based |
| `incident_high_severity` | Urgent | Y | Y | N | Y | 15 min, 30 min SMS |
| `incident_review_needed` | High | Y | Y | N | Y | Daily for 3 days |
| `shift_reminder` | Normal | Y | N | N | N | None |
| `clock_anomaly` | Normal | Y | N | N | N | None |
| `clock_missed` | High | Y | Y | N | N | None |
| `daily_summary` | Low | Y | N | Y | N | None |
| `referral_status_change` | Low | Y | N | N | N | None |
| `system_maintenance` | Low | Y | N | Y | N | None |

`*` SMS sent only on escalation if push is unacknowledged, not on initial send. Exception: `clock_missed` sends SMS immediately to the supervisor (not escalation-only).

`**` SMS sent only as fallback when the user has denied push permission (mandatory notification delivery assurance).

---

## 3. BullMQ Queue Architecture

All queues use Redis as the backing store. Job payloads contain only record IDs and metadata -- never raw PHI. Workers fetch PHI from Postgres at execution time.

### 3.1 notifications:push

| Setting | Value |
|---------|-------|
| **Concurrency** | 20 |
| **Retry policy** | 3 attempts, exponential backoff: 5s, 15s, 45s |
| **Dead letter queue** | `notifications:push:dead` after 3 failures |
| **Priority levels** | 1 (urgent), 2 (high), 3 (normal), 4 (low) |
| **Stalled job interval** | 30 seconds |
| **Notes** | FCM batch API used when sending to multiple tokens. Stale tokens (FCM returns `NotRegistered`) are removed from preferences and logged. |

### 3.2 notifications:sms

| Setting | Value |
|---------|-------|
| **Concurrency** | 5 |
| **Retry policy** | 2 attempts, exponential backoff: 10s, 30s |
| **Dead letter queue** | `notifications:sms:dead` after 2 failures |
| **Priority levels** | 1 (urgent), 2 (high), 3 (normal) |
| **Rate limit** | 1 message per second (Twilio rate limit compliance) |
| **Notes** | Lower concurrency due to per-second Twilio rate limits and cost sensitivity. Failed SMS for urgent notifications trigger an immediate push fallback. |

### 3.3 notifications:email

| Setting | Value |
|---------|-------|
| **Concurrency** | 10 |
| **Retry policy** | 3 attempts, exponential backoff: 10s, 30s, 90s |
| **Dead letter queue** | `notifications:email:dead` after 3 failures |
| **Priority levels** | 1 (high), 2 (normal), 3 (low) |
| **Rate limit** | 14 messages per second (SES default sending rate) |
| **Notes** | Bounce and complaint webhooks update the suppression list. Hard bounces auto-disable email for the affected address. |

### 3.4 notifications:escalation

| Setting | Value |
|---------|-------|
| **Concurrency** | 5 |
| **Retry policy** | 1 attempt, no retry (escalation is time-critical; a failed escalation is logged and the admin is alerted directly) |
| **Dead letter queue** | `notifications:escalation:dead` |
| **Priority levels** | 1 only (all escalations are high priority) |
| **Job type** | Delayed jobs. Created with a `delay` value in milliseconds when the original notification is sent. |
| **Notes** | When the delayed job fires, the worker checks `notifications.read_at` for the original notification. If non-null, the escalation is skipped (no-op). If null, the next escalation level is triggered. |

### 3.5 notifications:digest

| Setting | Value |
|---------|-------|
| **Concurrency** | 3 |
| **Retry policy** | 1 attempt, 60s backoff |
| **Dead letter queue** | `notifications:digest:dead` |
| **Priority levels** | 1 only |
| **Schedule** | Repeatable job: `cron('0 6 * * *')` per agency timezone |
| **Notes** | Aggregates overnight activity into a single email per supervisor. One job per agency. |

---

## 4. Job Schemas

```typescript
// ── Base Job ────────────────────────────────────────────────────────────────

interface BaseNotificationJob {
  notificationId: string;    // UUID - references notifications.id
  agencyId: string;          // UUID - tenant isolation
  profileId: string;         // UUID - recipient
  type: NotificationType;    // one of the 18 notification types
  priority: 1 | 2 | 3 | 4;  // 1=urgent, 2=high, 3=normal, 4=low
  referenceId?: string;      // UUID - the triggering record (note, incident, etc.)
  referenceType?: string;    // table name of the triggering record
  createdAt: string;         // ISO 8601 timestamp
}

// ── Push Job ────────────────────────────────────────────────────────────────

interface PushJob extends BaseNotificationJob {
  channel: 'push';
  fcmTokens: string[];       // one or more device tokens for the recipient
  title: string;             // rendered notification title (no PHI)
  body: string;              // rendered notification body (no PHI in SMS-safe types)
  icon?: string;             // URL to notification icon
  badge?: number;            // unread count for badge update
  clickAction: string;       // deep link path (e.g., "/incidents/abc-123")
  data?: Record<string, string>; // additional key-value pairs for client handling
  collapseKey?: string;      // group related notifications (e.g., "coverage_{requestId}")
  ttl?: number;              // time-to-live in seconds (default: 86400 = 24hr)
}

// ── SMS Job ─────────────────────────────────────────────────────────────────

interface SmsJob extends BaseNotificationJob {
  channel: 'sms';
  phone: string;             // E.164 format (e.g., "+15551234567")
  message: string;           // rendered SMS body, max 160 chars, NO PHI
  fromNumber?: string;       // override sender (default: env TWILIO_FROM_NUMBER)
  statusCallbackUrl?: string; // Twilio delivery webhook URL
}

// ── Email Job ───────────────────────────────────────────────────────────────

interface EmailJob extends BaseNotificationJob {
  channel: 'email';
  to: string;                // recipient email address
  subject: string;           // email subject line
  templateId: string;        // SES template name
  templateData: Record<string, string>; // merge fields for the template
  replyTo?: string;          // reply-to address (default: noreply@guad.app)
}

// ── Escalation Job ──────────────────────────────────────────────────────────

interface EscalationJob {
  originalNotificationId: string;  // UUID - the notification being escalated
  agencyId: string;
  type: NotificationType;
  escalationLevel: 1 | 2 | 3;     // current escalation depth
  nextRecipientProfileId: string;  // UUID - who to escalate to
  nextChannel: 'push' | 'sms';    // escalation channel
  delayMs: number;                 // delay before this job fires
  maxLevel: 1 | 2 | 3;              // per-type escalation depth (hard cap: 3)
  createdAt: string;
}

// ── Digest Job ──────────────────────────────────────────────────────────────

interface DigestJob {
  agencyId: string;
  recipientProfileId: string;    // UUID - supervisor or admin
  recipientEmail: string;
  periodStart: string;           // ISO 8601 (previous day 06:00)
  periodEnd: string;             // ISO 8601 (current day 06:00)
  agencyTimezone: string;        // IANA timezone (e.g., "America/Chicago")
  sections: DigestSection[];
}

interface DigestSection {
  label: string;                 // e.g., "Notes Pending Review"
  count: number;
  deepLink: string;              // app path for "View All"
  items?: DigestItem[];          // optional individual items (max 5)
}

interface DigestItem {
  summary: string;               // one-line summary, NO PHI (e.g., "Shift note at Elm House")
  deepLink: string;
}

// ── Notification Type Union ─────────────────────────────────────────────────

type NotificationType =
  | 'coverage_offer'
  | 'coverage_accepted'
  | 'coverage_unfilled'
  | 'note_submitted'
  | 'note_approved'
  | 'note_sent_back'
  | 'med_refusal'
  | 'med_due_reminder'
  | 'health_alert'
  | 'incident_reported'
  | 'incident_high_severity'
  | 'incident_review_needed'
  | 'shift_reminder'
  | 'clock_anomaly'
  | 'clock_missed'
  | 'daily_summary'
  | 'referral_status_change'
  | 'system_maintenance';
```

---

## 5. FCM Integration (Web Push)

### Service Worker Registration

The SvelteKit service worker (`src/service-worker.ts`) registers for push notifications during the PWA install flow. Registration happens after the user grants notification permission and authenticates.

```
1. User logs in -> App checks Notification.permission
2. If 'default', prompt with in-app explainer before calling Notification.requestPermission()
3. On 'granted': call firebase.messaging().getToken({ vapidKey })
4. Store FCM token in the `device_tokens` table (or `profiles.fcm_tokens`) for the user's profile
5. Service worker listens for 'push' events and displays notifications
6. Service worker listens for 'notificationclick' events for deep linking
```

### Token Refresh

- FCM tokens can expire or rotate. The `onTokenRefresh` callback in the client updates the server via `trpc.notification.updateFcmToken.mutate()`.
- On every app launch, compare the stored token with `getToken()`. If different, update the server.
- When FCM returns `messaging/registration-token-not-registered` during send, remove the stale token from `device_tokens` (or `profiles.fcm_tokens`) and log the event.

### Payload Structure

```typescript
// FCM message sent by the push worker
{
  token: "fcm-device-token-here",
  notification: {
    title: "Medication held at Elm House",
    body: "Tap to review and acknowledge.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png"
  },
  data: {
    notificationId: "uuid",
    type: "med_refusal",
    clickAction: "/mar/uuid",
    agencyId: "uuid"
  },
  webpush: {
    fcmOptions: {
      link: "https://app.guad.app/mar/uuid"
    },
    headers: {
      TTL: "86400",
      Urgency: "high"
    }
  }
}
```

### Click Handling

The service worker `notificationclick` handler:
1. Close the notification.
2. Extract `clickAction` from `event.notification.data`.
3. Check if the app is already open in a `WindowClient`. If yes, focus it and navigate to the deep link.
4. If no open window, open a new window at the deep link URL.
5. Send a `markRead` mutation for the `notificationId`.

### Badge Management

- On each push received, increment the PWA badge count using `navigator.setAppBadge(count)`.
- When the user opens the notification center or taps a notification, recalculate the unread count via `trpc.notification.getUnreadCount.query()` and update the badge.
- On `visibilitychange` to `visible`, refresh the badge count.

### iOS PWA Push (Safari 16.4+)

- iOS PWA push is supported on Safari 16.4+ (iOS 16.4+). The same FCM integration works.
- Requires the PWA to be added to the home screen (not available in Safari browser tab).
- The `web-push` VAPID key flow is identical to Android/desktop.
- Limitation: no badge API on iOS -- the badge count is managed via the notification center only.
- Fallback for older iOS: notifications are not available. Display an in-app notification center with a visible badge count in the nav bar. Poll for new notifications every 60 seconds when the app is in the foreground.

### Permission Denied Fallback

If the user denies push permission or is on an unsupported platform:
- The in-app notification center (`/notifications`) becomes the primary channel.
- A red badge appears on the bell icon in the nav bar showing unread count.
- Polling interval: every 60 seconds while app is in foreground.
- All mandatory notifications (med_refusal, incident_high_severity, incident_reported, health_alert, coverage_unfilled) fall back to SMS if the user has a phone number on file.

---

## 6. Twilio Integration (SMS)

### Message Templates

All SMS messages must be under 160 characters to avoid multi-segment billing. Templates are pre-approved and stored server-side.

| Type | Template | Char Count |
|------|----------|------------|
| `coverage_offer` | `Guad: Can you cover {shift} at {home} on {date}? Reply YES or NO.` | ~65 |
| `coverage_unfilled` | `Guad URGENT: {shift} at {home} on {date} is unfilled. Assign manually.` | ~72 |
| `med_refusal` | `Guad: A medication was {status} at {home}. Please review in the app.` | ~65 |
| `health_alert` | `Guad: Health alert at {home}. Please review in the app.` | ~55 |
| `incident_reported` | `Guad: New incident reported at {home}. Please review in the app.` | ~60 |
| `incident_high_severity` | `Guad URGENT: High-severity incident at {home}. Review immediately.` | ~65 |
| `incident_review_needed` | `Guad: Open incident at {home} from {date} needs review.` | ~57 |
| `clock_missed` | `Guad: {staff} missed clock-out at {home} on {date}. Review needed.` | ~67 |

### Sender Configuration

- Default sender: `TWILIO_FROM_NUMBER` environment variable.
- All messages are sent from a single number per Guad deployment.
- Twilio Messaging Service SID can be used for multi-number sending with automatic carrier compliance.

### Opt-Out (STOP Keyword)

- Twilio automatically handles STOP/START/HELP keywords for US/Canada numbers.
- When a user texts STOP, Twilio blocks further messages to that number.
- The `statusCallbackUrl` webhook receives an `opt-out` event. The worker updates `notification_preferences.sms_enabled = false` for the matching profile.
- When a user texts START, the webhook re-enables SMS: `notification_preferences.sms_enabled = true`.
- Admin UI shows which users have opted out of SMS.

### Delivery Webhooks

- `statusCallbackUrl` is set on every outbound message.
- Webhook events: `queued`, `sent`, `delivered`, `undelivered`, `failed`.
- On `delivered`: update `notifications.status = 'sent'`, `notifications.sent_at = now()`.
- On `undelivered` or `failed`: update `notifications.status = 'failed'`, log the error code. If the notification is urgent, trigger push fallback.

### Cost Tracking

- Each SMS send logs the Twilio message SID and segment count.
- A `sms_usage` counter per agency per month is maintained in Redis (INCR with EXPIRE at month end).
- Admin dashboard shows monthly SMS usage and estimated cost.
- Alert agency admin when usage exceeds 80% of the plan's included SMS volume.

### Twilio Incoming Webhook (SMS Replies)

The `coverage_offer` SMS template (Section 2.1) instructs candidates to "Reply YES or NO." Inbound replies are handled via a Twilio incoming message webhook:

- **Webhook URL:** `/api/webhooks/twilio/incoming`
- **Reply matching:** Look up the most recent pending `coverage_offer` SMS sent to the `From` number. Match via the `notifications` table (type = `coverage_offer`, channel = `sms`, phone = From number, status = `sent`).
- **Reply normalization:**
  - `YES`, `Y`, `SURE`, `OK`, `YEP` -> `accepted`
  - `NO`, `N`, `NOPE`, `CANT`, `CAN'T` -> `declined`
  - Anything else -> reply with `"Guad: Sorry, we didn't understand. Reply YES to accept or NO to decline."`
- **Race condition handling:** If the coverage request `status` is already `filled` when the reply arrives, respond with `"Guad: This shift has already been filled. Thank you!"` and skip processing.
- **On acceptance:** Call `recordCandidateReply(agencyId, candidateId, 'accepted')` followed by `fillShift()`. Trigger `coverage_accepted` notification.
- **On decline:** Call `recordCandidateReply(agencyId, candidateId, 'declined')`.
- **Security:** Validate the Twilio request signature (`X-Twilio-Signature` header) against the configured `TWILIO_AUTH_TOKEN` to prevent spoofed webhooks.

### HIPAA Rules for SMS Content

Per `security.md` and `constitution.md`, SMS bodies must NEVER contain:
- Client names (first, last, full, or initials)
- Client dates of birth
- Diagnoses or health conditions
- Medication names, doses, or routes
- Clinical note content
- Injury details or incident descriptions
- Any information that could identify a specific client

SMS may contain:
- Home names (group home facility names are not PHI)
- Staff names (staff are workforce members, not patients)
- Shift labels (AM/PM/ON) and dates
- Generic event descriptions ("a medication was refused", "health alert")
- Action instructions ("Review in the app", "Reply YES or NO")

---

## 7. Amazon SES Integration (Email)

### Templates

SES templates are stored in AWS and referenced by `templateId` in the `EmailJob`. All templates use responsive HTML with inline CSS for broad email client compatibility.

| Template ID | Usage | Subject Line |
|-------------|-------|-------------|
| `guad-daily-summary` | Daily digest for supervisors | `Guad Daily Summary - {agencyName} - {date}` |
| `guad-system-maintenance` | Planned maintenance alerts | `Scheduled Maintenance - {date}` |
| `guad-welcome` | New user onboarding | `Welcome to Guad - {agencyName}` |
| `guad-password-reset` | Password reset (via Supabase, but branded) | `Reset Your Guad Password` |

### Domain Verification

- Primary sender domain: `guad.app` (or agency custom domain if configured).
- **SPF**: TXT record authorizing SES sending IPs.
- **DKIM**: 2048-bit DKIM signing via SES-provided CNAME records (3 records).
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@guad.app; pct=100`.
- Custom `Return-Path` domain for bounce handling.

### Bounce Handling

- SES SNS topic receives bounce notifications.
- **Hard bounce** (permanent failure): add email to suppression list, set `notification_preferences.email_enabled = false` for the profile, log the event.
- **Soft bounce** (temporary failure): retry via BullMQ retry policy. After 3 soft bounces in 24 hours, treat as hard bounce.
- **Complaint** (user marks as spam): immediately suppress, set `email_enabled = false`, alert agency admin.

### Suppression List

- Canonical suppression data is persisted in the `email_suppressions` Postgres table (columns: `id`, `agency_id`, `email`, `reason`, `suppressed_at`). This ensures suppression state survives Redis restarts and flushes.
- A Redis set (`email_suppression:{agencyId}`) acts as a read-through cache for fast lookups during sends. On cache miss, the worker queries Postgres and populates Redis.
- Checked before every email send. If the address is suppressed, the job completes without sending and logs a skip event.
- Admin can manually remove addresses from suppression (e.g., after the user confirms a new valid address).

### Daily Summary Email Layout

```
Subject: Guad Daily Summary - Sunrise Care - Oct 10, 2026

Header: Guad logo + agency name + date

Section 1: Notes Pending Review
  - 3 notes awaiting review [View All ->]
  - Elm House: 2 shift notes
  - Oak House: 1 behavior note

Section 2: Incidents
  - 1 open incident (medium severity) [View All ->]

Section 3: Medication Alerts
  - 2 medication refusals acknowledged [View All ->]
  - 0 unacknowledged

Section 4: Coverage
  - 1 shift filled by coverage [View All ->]
  - 0 unfilled shifts

Section 5: Clock Anomalies
  - 1 missed clock-out [View All ->]

Footer: "You're receiving this because you're a supervisor at {agencyName}.
         Manage preferences: [Notification Settings]
         Guad - guad.app"
```

All "View All" links point to authenticated app screens. No PHI (client names, health details) appears in the email body -- only aggregate counts and home names.

---

## 8. Escalation Engine

### How It Works

The escalation engine uses BullMQ delayed jobs. When a notification is sent for a type that has escalation rules, an `EscalationJob` is simultaneously enqueued with the appropriate delay. When the delayed job fires:

1. Query `notifications` for the `originalNotificationId`.
2. Check `read_at`. If non-null, the notification was acknowledged -- skip (no-op).
3. If `read_at` is null, determine the next escalation action from the escalation chain.
4. Send the escalated notification to the next recipient via the specified channel.
5. If another escalation level exists, enqueue the next `EscalationJob` with the next delay.
6. If `escalationLevel >= maxLevel`, mark the notification as `escalation_exhausted` in the `notifications` table and stop.

### Escalation Chains by Type

| Type | Level 1 | Level 2 | Level 3 |
|------|---------|---------|---------|
| `incident_high_severity` | Push to supervisor at 0 min + SMS at 0 min | Re-send SMS to supervisor at 15 min | SMS to agency admin at 30 min |
| `med_refusal` | Push to supervisor at 0 min | SMS to supervisor at 60 min | SMS to agency admin at 120 min |
| `health_alert` | Push to supervisor at 0 min | SMS to supervisor at 60 min | SMS to agency admin at 120 min |
| `coverage_offer` | Push + SMS to candidate at 0 min | Reminder SMS at 15 min | -- (max 2 levels; re-offering to next batch is owned by Schedule Service via `CoverageTimeoutJob`) |
| `coverage_unfilled` | Push + SMS to supervisor at 0 min | SMS to agency admin at 30 min | -- (max 2 levels) |
| `note_submitted` | Push to supervisor at 0 min | Push reminder at 24 hr | -- (max 2 levels) |
| `note_sent_back` | Push to caregiver at 0 min | Push reminder at 8 hr | Push reminder at 24 hr |
| `incident_review_needed` | Push + SMS at 0 hr | Repeat daily | Stop after 3 days (escalation_exhausted) |
| `med_due_reminder` | Push to caregiver at -30 min | Push to supervisor at +30 min (overdue) | -- (max 2 levels) |

### Escalation State Tracking

The `notifications` table tracks delivery and escalation state via the `status` column. The canonical set of status values (should be enforced as a pgEnum `notification_status` in schema.ts):

| Status | Meaning |
|--------|---------|
| `pending` | Initial send queued, not yet dispatched |
| `sent` | Delivered to at least one channel |
| `read` | User tapped/opened (`read_at` set) |
| `failed` | Delivery failed after all retries exhausted |
| `escalated` | At least one escalation level triggered |
| `escalation_exhausted` | Max escalation depth reached without acknowledgment |
| `rate_limited` | Notification dropped due to per-user or per-type rate limit |

### Max Depth

Hard limit: 3 escalation levels. No notification may trigger more than 3 follow-up actions. This prevents notification storms and respects user attention.

### Suppressing Duplicate Escalations

Before sending any escalation, the worker checks:
1. Has `read_at` been set since the escalation was enqueued? If yes, skip.
2. Has another escalation at the same level already been sent for this notification? If yes, skip.
3. Is the recipient the same as the original? If yes and the channel is the same, skip (do not re-send push if push was the original channel -- escalate to SMS instead).

---

## 9. User Preferences

### Storage Requirements

- **Unique constraint:** The `notification_preferences` table must have a unique index on `(profile_id, notification_type)` to prevent duplicate preference rows for the same user and notification type. Schema.ts should include: `uniqueIndex('notification_prefs_profile_type_idx').on(t.profile_id, t.notification_type)`.
- **Agency timezone:** Digest scheduling (Section 3.5) and quiet hours (below) depend on the agency's IANA timezone. This is stored as `timezone: text('timezone').notNull().default('America/New_York')` on the `agencies` table in schema.ts. The `DigestJob` reads `agencyTimezone` from this column.
- **FCM tokens:** FCM device tokens are per-device, not per-notification-type. They should be stored in a dedicated `device_tokens` table (columns: `id`, `agency_id`, `profile_id`, `token`, `platform`, `created_at`, `updated_at`) or as an `fcm_tokens text[]` column on the `profiles` table -- not in `notification_preferences`.
- **Priority column:** The `notifications` table in schema.ts must include a `priority: integer('priority').notNull().default(3)` column to support quiet hours filtering, rate limit bypass for urgent notifications, and BullMQ job priority levels.

### Default Preferences by Role

When a profile is created, default notification preferences are seeded based on role:

| Type | Caregiver Push | Caregiver SMS | Caregiver Email | Supervisor Push | Supervisor SMS | Supervisor Email | Admin Push | Admin SMS | Admin Email |
|------|---------------|---------------|-----------------|-----------------|----------------|------------------|------------|-----------|-------------|
| `coverage_offer` | Y | Y | N | N | N | N | N | N | N |
| `coverage_accepted` | Y | N | N | Y | N | N | Y | N | N |
| `coverage_unfilled` | N | N | N | Y | Y | N | Y | Y | N |
| `note_submitted` | N | N | N | Y | N | N | N | N | N |
| `note_approved` | Y | N | N | N | N | N | N | N | N |
| `note_sent_back` | Y | N | N | N | N | N | N | N | N |
| `med_refusal` | N | N | N | Y | N | N | Y | N | N |
| `med_due_reminder` | Y | N | N | N | N | N | N | N | N |
| `health_alert` | N | N | N | Y | N | N | Y | N | N |
| `incident_reported` | N | N | N | Y | N | N | Y | N | N |
| `incident_high_severity` | N | N | N | Y | Y | N | Y | Y | N |
| `incident_review_needed` | N | N | N | Y | N | N | Y | N | N |
| `shift_reminder` | Y | N | N | N | N | N | N | N | N |
| `clock_anomaly` | N | N | N | Y | N | N | N | N | N |
| `clock_missed` | Y | N | N | Y | N | N | N | N | N |
| `daily_summary` | N | N | N | Y | N | Y | Y | N | Y |
| `referral_status_change` | N | N | N | N | N | N | Y | N | N |
| `system_maintenance` | Y | N | N | Y | N | Y | Y | N | Y |

### Mandatory Notifications (Cannot Be Disabled)

The following notifications are always sent regardless of user preferences. The `notification_preferences` row may exist but is ignored for these types:

| Type | Reason |
|------|--------|
| `med_refusal` | Clinical safety -- supervisor must acknowledge medication refusals/holds |
| `health_alert` | Clinical safety -- out-of-range vitals require review |
| `incident_reported` | Regulatory compliance -- all incidents must be reviewed |
| `incident_high_severity` | Regulatory compliance + safety -- immediate review required |
| `coverage_unfilled` | Operational safety -- an unfilled shift means clients may lack care |

For mandatory notifications, the system always sends via push. SMS escalation still follows the escalation chain timing.

### Quiet Hours

- Default quiet hours: **23:00 to 06:00** in the user's timezone (derived from agency timezone).
- During quiet hours, **normal** and **low** priority notifications are held and delivered at 06:00 as a batch.
- **High** and **urgent** priority notifications are delivered immediately regardless of quiet hours.
- Users can customize quiet hours start/end within a minimum window of 4 hours and maximum of 10 hours. Per-user quiet hours are stored in a `user_notification_settings` table (columns: `profile_id`, `quiet_hours_start time`, `quiet_hours_end time`) or as columns on the `profiles` table. These are per-user, not per-notification-type.
- Quiet hours apply to push and SMS only. Email delivery is not affected by quiet hours.

### Per-Agency Admin Overrides

Agency admins can set organization-wide defaults that override the role-based defaults:

- Force SMS enabled for specific notification types across all supervisors.
- Disable specific non-mandatory notification types agency-wide.
- Set custom quiet hours for the entire agency.
- Require email delivery for daily summaries.

Admin overrides are stored in `agencies.settings` under the `notification_overrides` key. User preferences that conflict with admin overrides are silently overridden at send time.

---

## 10. Rate Limiting

Rate limits protect users from notification fatigue and control SMS costs.

### Per-User Daily Limits

| Channel | Limit | Window | Behavior on Limit |
|---------|-------|--------|-------------------|
| Push | 50 per user per day | Rolling 24-hour window | Notifications are queued but not delivered. `status = 'rate_limited'`. Urgent priority bypasses the limit. |
| SMS | 10 per user per day | Rolling 24-hour window | SMS is dropped. Push fallback is attempted. `status = 'rate_limited'`. Urgent priority bypasses the limit (but still counts toward limit). |
| Email | 20 per user per day | Rolling 24-hour window | Email is dropped silently. `status = 'rate_limited'`. |
| Escalation | 3 per notification | Per-notification lifetime | After 3 escalations, mark `escalation_exhausted`. No further follow-up. |

### Per-Notification Type Limits

| Type | Special Limit |
|------|--------------|
| `coverage_offer` | Max 3 rounds of offers per coverage request. Each round may notify up to 10 candidates. |
| `shift_reminder` | Max 1 per shift per user (deduplicated by schedule_slot_id). |
| `med_due_reminder` | Max 1 per medication per day (deduplicated by medication_id + day). |
| `daily_summary` | Exactly 1 per user per day. |
| `note_sent_back` | Max 2 reminders per note (the initial + 2 escalation reminders). |

### Implementation

Rate limiting is implemented using Redis sorted sets:
- Key: `ratelimit:{channel}:{profileId}`
- Members: notification IDs with scores as Unix timestamps.
- Before sending, count members with scores in the last 24 hours.
- If count >= limit, reject (unless urgent priority).
- Expired entries are pruned on each check using `ZREMRANGEBYSCORE`.

---

## 11. Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Delivery success rate (push)** | % of push jobs that result in FCM `success` response | < 95% over 1 hour |
| **Delivery success rate (SMS)** | % of SMS jobs that result in Twilio `delivered` status | < 90% over 1 hour |
| **Delivery success rate (email)** | % of email jobs that result in SES delivery (no bounce) | < 95% over 1 hour |
| **Escalation trigger rate** | % of escalatable notifications that reach level 2+ | > 30% over 24 hours (indicates users are not responding) |
| **Mean time to acknowledge** | Average time from `sent_at` to `read_at` for high/urgent notifications | > 30 minutes for urgent, > 2 hours for high |
| **SMS cost per agency per month** | Total SMS segments sent x cost per segment | > $50/agency/month (alert admin) |
| **Dead letter queue depth** | Number of jobs in any dead letter queue | > 0 (any failed job requires investigation) |
| **Queue latency** | Time from job creation to job processing start | > 30 seconds for urgent, > 5 minutes for normal |
| **FCM token staleness** | % of stored FCM tokens that return `NotRegistered` | > 20% (indicates token refresh issue) |
| **Rate limit hit rate** | % of notifications dropped due to rate limiting | > 5% for any user (possible notification storm) |

### Dashboard Queries

Monitoring data is derived from the `notifications` table and Redis counters:

- **Delivery funnel**: `pending` -> `sent` -> `read` conversion rates by notification type.
- **Escalation funnel**: notifications that triggered escalation level 1, 2, 3, and `escalation_exhausted` counts.
- **Channel distribution**: pie chart of notifications sent by channel (push/SMS/email) over time.
- **Top notification types**: bar chart of notification volume by type over 7/30 days.

### Alerting

Alerts are sent to the engineering team (not agency users) via the platform's own notification system or an external monitoring tool:

- Dead letter queue non-empty: immediate alert.
- Delivery success rate drops below threshold: alert after 15 minutes sustained.
- SMS cost exceeds agency budget: daily digest to agency admin.
- Queue processing stalled (no jobs completed in 5 minutes while queue is non-empty): immediate alert.

---

## 12. Testing Strategy

### Development Environment

- **Console logger**: In development (`NODE_ENV=development`), all notification sends are intercepted and logged to the server console instead of dispatching to FCM/Twilio/SES. Log output includes: recipient, channel, type, rendered title/body, and deep link.
- **In-app dev panel**: A `/dev/notifications` route (dev only) shows all queued and sent notifications with their payloads, escalation state, and delivery status. Includes a "Send Test Notification" button for each of the 18 types.
- **BullMQ Board**: Bull Board UI available at `/dev/bull` in development for inspecting queues, retrying failed jobs, and draining queues.

### Staging Environment

- **Test phone numbers**: Twilio test credentials and magic numbers are used in staging. No real SMS is sent. Twilio test numbers return predictable delivery statuses.
- **SES sandbox**: Staging uses SES in sandbox mode, which only delivers to verified email addresses. All team members' emails are verified.
- **FCM test**: Staging uses a separate Firebase project with its own VAPID key. Push notifications are delivered to real devices but only for team members.
- **Escalation timing**: Staging uses accelerated escalation timers (minutes instead of hours) to enable end-to-end escalation testing without waiting.

### Preview Mode

- A `preview` flag can be set on any notification send call: `send(agencyId, profileId, type, payload, { preview: true })`.
- In preview mode, the notification is fully rendered (templates resolved, PHI safety checked, channels determined) but NOT dispatched. The rendered result is returned to the caller for inspection.
- Used by the admin notification settings UI to show "This is what the notification would look like" previews.

### Automated Tests

| Test Category | What Is Tested | Runner |
|---------------|----------------|--------|
| Unit: template rendering | Each of the 18 types renders correctly with sample data; no PHI leaks into SMS templates | Vitest |
| Unit: PHI safety | SMS and email bodies are checked against a regex blocklist of PHI patterns (names, DOBs, med names from fixture data) | Vitest |
| Unit: rate limiting | Rate limiter correctly blocks at threshold and allows urgent bypass | Vitest |
| Unit: escalation logic | Escalation skips when `read_at` is set; fires when null; respects max depth | Vitest |
| Unit: preference resolution | Mandatory overrides work; admin overrides supersede user preferences; quiet hours apply correctly | Vitest |
| Integration: BullMQ flow | Job is enqueued, picked up by worker, notification record updated | Vitest + Redis testcontainer |
| Integration: FCM mock | Push worker sends correct payload to FCM mock server; stale token removal works | Vitest + nock |
| Integration: Twilio mock | SMS worker sends correct payload; opt-out webhook updates preferences | Vitest + nock |
| Integration: SES mock | Email worker sends correct template; bounce webhook suppresses address | Vitest + nock |
| E2E: notification flow | Create incident -> notification appears in notification center -> tap -> deep link works | Playwright |
| E2E: escalation flow | Create high-severity incident -> wait for escalation timer -> verify SMS sent (staging) | Playwright + accelerated timers |

### PHI Safety Test Suite

A dedicated test suite validates that no notification type leaks PHI into external channels:

```
For each of the 18 notification types:
  1. Create a notification with fixture data containing known PHI strings
     (client name: "Jane Doe", DOB: "1990-01-15", med: "Lisinopril 10mg")
  2. Render the SMS template
  3. Assert: SMS body does NOT contain "Jane", "Doe", "1990", "Lisinopril", "10mg"
  4. Render the email template
  5. Assert: email body does NOT contain any PHI strings
  6. Render the push template
  7. Assert: push body does NOT contain client name or DOB
     (push MAY contain generic clinical terms like "medication refused")
```

This suite runs on every CI build and blocks deployment if any assertion fails.
