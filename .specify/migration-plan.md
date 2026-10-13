# Guad Migration Plan: localStorage MVP to Supabase/Postgres

## 1. Current State

The MVP stores **all application data as a single JSON object** in the browser's `localStorage` under the key `guad-data-v1`. The `emptyState()` function in `src/store.js` defines the shape:

```
{
  version: 1,
  agency: null,           // { name }
  homes: [],              // { id, name, address, lat, lng, radius }
  staff: [],              // { id, name, ini, role, medCert, homeIds }
  clients: [],            // { id, homeId, name, first, ini, info, health:{dob, allergies, conditions, diet, doctor, guardian}, goals:[], behaviors:[], meds:[], medHistory:[], caseNotes:[] }
  schedule: {},           // { [homeId]: { [yyyy-mm-dd]: { am|pm|on: { staff, status, viaLomi } } } }
  notes: [],
  incidents: [],
  mar: [],
  health: [],
  attendance: {},         // { [yyyy-mm-dd]: { [clientId]: { services, by, at } } }
  msgs: [],               // { id, homeId, from, text, at }
  coverage: [],           // { id, homeId, day, shift, calledOut, reason, by, startedAt, status, filledBy, filledAt, cands, steps }
  clocks: [],             // { id, staffId, homeId, inAt, outAt, lat, lng, distance, verified, manual }
  events: [],             // append-only activity log
  session: { userId: null }
}
```

### Limitations

| Concern | Current State |
|---------|---------------|
| Authentication | None. Users select their name from a list. No passwords, no tokens. |
| Authorization | Role checked in JS (`isOffice()`). No enforcement at data layer. |
| PHI protection | All PHI stored as plaintext JSON in `localStorage`. Accessible to any JS on the page. |
| Multi-tenancy | Single-agency only. `agency` is a single object with just `{ name }`. |
| Audit trail | `events[]` array in the same JSON blob. No immutability guarantee. Easily deleted. |
| Data capacity | ~5 MB `localStorage` limit. No pagination. All data loaded into memory at once. |
| Offline sync | Not applicable -- data never leaves the browser. No sync, no conflict resolution. |
| Concurrent users | None. Each browser has its own isolated copy. No shared state. |
| Backup/recovery | None. Clearing browser data destroys everything. |
| ID generation | `Math.random().toString(36).slice(2,10)` -- not UUID, collision-prone. |

---

## 2. Target State

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | Supabase Postgres (minimum version tracked in `supabase/config.toml`) | 30 normalized tables, RLS, realtime subscriptions |
| Auth | Supabase Auth | Email/password, magic link, SSO, MFA, JWT with agency_id claim |
| ORM | Drizzle | Type-safe schema definition, migration generation |
| Internal API | tRPC | End-to-end typed frontend-to-backend communication |
| External API | OpenAPI 3.1 | EVV, state reporting, agency exports |
| Offline | PowerSync (wa-sqlite + OPFS) | Server-authoritative last-write-wins sync, encrypted local PHI cache |
| AI -- notes | AWS Bedrock Claude | HIPAA-eligible note drafting |
| AI -- voice | Azure OpenAI Whisper | HIPAA-eligible transcription |
| Jobs | BullMQ + Redis | Coverage workflows, notification dispatch |
| Notifications | FCM / Twilio / SES | Push, SMS, email |
| Frontend | SvelteKit 2 + Svelte 5 runes | PWA with service worker |

### Key Architectural Gains

- **Tenant isolation**: Every table has `agency_id` FK + RLS policy. Cross-tenant access is impossible at the Postgres level.
- **Real authentication**: Supabase Auth with JWT, session expiry, MFA for supervisor/admin.
- **Immutable audit log**: Append-only `audit_log` table. No UPDATE/DELETE by application code. 6-year retention.
- **Offline-first**: PowerSync syncs via server-authoritative last-write-wins. Writes persist locally in encrypted OPFS, sync on reconnect.
- **Normalized schema**: Client health, goals, medications, and case notes each in dedicated tables with proper FKs and indexes.
- **UUID primary keys**: `uuid_generate_v4()` -- no collisions.

---

## 3. Migration Strategy

### This is a greenfield deployment, not a data migration.

The MVP is a prototype containing only synthetic test data entered during development. There are no production users, no real patient records, and no continuity obligations. The migration strategy is:

1. **Build the new system alongside the MVP.** The MVP (`index.html` + vanilla JS) continues to serve as a reference implementation.
2. **Validate feature parity.** Every screen and workflow in the MVP must have a corresponding implementation in the SvelteKit app before the MVP is retired.
3. **Switch over.** Once validated, the MVP is archived. No data transfer occurs.

### Why NOT migrate data

| Reason | Detail |
|--------|--------|
| No real data exists | MVP contains only developer-entered test scenarios |
| Schema incompatibility | MVP uses nested JSON objects; production uses 30 normalized tables |
| ID format change | MVP uses 8-char random strings; production uses UUIDs |
| No auth mapping | MVP has no user accounts; production requires Supabase Auth UIDs |
| Compliance risk | Any automated data transfer from an unauthenticated plaintext store would create audit complications |

---

## 4. Schema Mapping

### 4.1 agency (single object) -> agencies (table)

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `agency.name` | string | `agencies.name` | text | Direct map |
| -- | -- | `agencies.id` | uuid | New PK |
| -- | -- | `agencies.slug` | text | New, URL-safe identifier |
| -- | -- | `agencies.charting_preset` | enum | New, `'therap'` or `'default'` |
| -- | -- | `agencies.settings` | jsonb | New, agency-level config |
| -- | -- | `agencies.subscription_tier` | text | New, feature gating |
| -- | -- | `agencies.enabled_features` | text[] | New, per-agency feature overrides (additive to tier baseline) |
| -- | -- | `agencies.timezone` | text | New, agency timezone (default 'America/New_York') |
| -- | -- | `agencies.created_at` | timestamptz | New |
| -- | -- | `agencies.updated_at` | timestamptz | New |

### 4.2 homes[] -> homes

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string (8 char) | `homes.id` | uuid | Format change |
| `name` | string | `homes.name` | text | Direct map |
| `address` | string | `homes.address` | text | Direct map |
| `lat` | number | `homes.lat` | real | Direct map |
| `lng` | number | `homes.lng` | real | Direct map |
| `radius` | number | `homes.radius` | integer | Direct map (default 150) |
| -- | -- | `homes.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `homes.created_at` | timestamptz | New |
| -- | -- | `homes.updated_at` | timestamptz | New |

### 4.3 staff[] -> profiles

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string (8 char) | `profiles.id` | uuid | Format change |
| `name` | string | `profiles.name` | text | Direct map |
| `ini` | string | `profiles.initials` | text | Renamed |
| `role` | string | `profiles.role` | enum (user_role) | Same values: caregiver, supervisor, admin |
| `medCert` | boolean | `profiles.med_certified` | boolean | Renamed |
| `homeIds` | string[] | `profiles.home_ids` | uuid[] | Type change (UUIDs). Note: PostgreSQL cannot enforce FK constraints on individual array elements. Application-level cleanup is required when a home is deleted to remove orphaned UUIDs from this array. Consider replacing with a `staff_homes` join table if referential integrity is critical. |
| -- | -- | `profiles.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `profiles.supabase_uid` | uuid | New, links to Supabase Auth |
| -- | -- | `profiles.email` | text | New, required for auth |
| -- | -- | `profiles.phone` | text | New, optional |
| -- | -- | `profiles.mfa_enabled` | boolean | New |
| -- | -- | `profiles.avatar_url` | text | New |
| -- | -- | `profiles.active` | boolean | New, soft delete |
| -- | -- | `profiles.created_at` | timestamptz | New |
| -- | -- | `profiles.updated_at` | timestamptz | New |

### 4.4 clients[] -> clients + client_health_info

#### clients base fields -> clients

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string (8 char) | `clients.id` | uuid | Format change |
| `homeId` | string | `clients.home_id` | uuid FK | Renamed, type change |
| `name` | string | `clients.name` | text | Direct map |
| `first` | string | `clients.first_name` | text | Renamed |
| `ini` | string | `clients.initials` | text | Renamed |
| `info` | string | `clients.info` | text | Direct map |
| `behaviors` | string[] | `clients.behaviors` | text[] | Direct map. Per-client behavior type list used for AI prompt construction and behavior note type selection. |
| -- | -- | `clients.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `clients.active` | boolean | New, soft delete |
| -- | -- | `clients.created_at` | timestamptz | New |
| -- | -- | `clients.updated_at` | timestamptz | New |

#### clients[].health -> client_health_info

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `health.allergies` | string | `client_health_info.allergies` | text | Direct map |
| `health.conditions` | string | `client_health_info.conditions` | text | Direct map |
| `health.diet` | string | `client_health_info.diet` | text | Direct map |
| `health.doctor` | string | `client_health_info.doctor` | text | Direct map |
| `health.guardian` | string | `client_health_info.guardian` | text | Direct map |
| -- | -- | `client_health_info.id` | uuid | New PK |
| -- | -- | `client_health_info.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `client_health_info.client_id` | uuid FK | New, links to clients |
| `health.dob` | string | `client_health_info.dob` | date | Type change (string to date) |
| -- | -- | `client_health_info.created_at` | timestamptz | New |
| -- | -- | `client_health_info.updated_at` | timestamptz | New |

### 4.5 clients[].goals[] -> goals

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `goals.id` | uuid | Format change |
| `area` | string | `goals.area` | text | Direct map (e.g., "Daily living") |
| `text` | string | `goals.text` | text | Direct map |
| `steps` | string[] | `goals.steps` | text[] | Direct map |
| `stopped` | boolean | `goals.stopped_at` | timestamptz | Changed from flag to timestamp |
| -- | -- | `goals.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `goals.client_id` | uuid FK | New, links to clients |
| -- | -- | `goals.frequency` | text | New |
| -- | -- | `goals.target` | text | New |
| -- | -- | `goals.started_at` | timestamptz | New |
| -- | -- | `goals.created_at` | timestamptz | New |
| -- | -- | `goals.updated_at` | timestamptz | New |

### 4.6 clients[].meds[] -> medications

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `medications.id` | uuid | Format change |
| `name` | string | `medications.name` | text | Direct map |
| `dose` | string | `medications.dose` | text | Direct map |
| `route` | string | `medications.route` | text | Direct map |
| `time` | string | `medications.scheduled_time` | time | Renamed |
| `prn` | boolean | `medications.prn_instructions` | text | Changed from flag to instructions text |
| `notes` | string | `medications.notes` | text | Direct map |
| `stopped` | boolean | `medications.stopped_at` | timestamptz | Changed from flag to timestamp |
| -- | -- | `medications.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `medications.client_id` | uuid FK | New, links to clients |
| -- | -- | `medications.started_at` | timestamptz | New |
| -- | -- | `medications.created_at` | timestamptz | New |
| -- | -- | `medications.updated_at` | timestamptz | New |

### 4.7 clients[].medHistory[] -> medication_history

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `action` | string | `medication_history.action` | enum (med_history_action) | Typed enum. Values: added, updated, stopped |
| `by` | string | `medication_history.changed_by` | uuid FK | Renamed, now FK to profiles |
| `at` | ISO string | `medication_history.changed_at` | timestamptz | Renamed, type change |
| -- | -- | `medication_history.id` | uuid | New PK |
| -- | -- | `medication_history.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `medication_history.medication_id` | uuid FK | New, links to medications |
| -- | -- | `medication_history.created_at` | timestamptz | New |
| -- | -- | `medication_history.updated_at` | timestamptz | New |

### 4.8 clients[].caseNotes[] -> case_notes

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `text` | string | `case_notes.body` | text | Renamed (MVP uses `text`, production uses `body`) |
| `by` | string | `case_notes.author_name` | text | Renamed |
| `at` | ISO string | `case_notes.created_at` | timestamptz | Mapped to created_at |
| -- | -- | `case_notes.id` | uuid | New PK |
| -- | -- | `case_notes.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `case_notes.client_id` | uuid FK | New, links to clients |
| -- | -- | `case_notes.author_id` | uuid FK | New, links to profiles |
| -- | -- | `case_notes.created_by` | uuid FK | New, audit |
| -- | -- | `case_notes.updated_at` | timestamptz | New |

### 4.9 schedule{} -> schedule_slots

The MVP stores schedule as a deeply nested object: `{ [homeId]: { [yyyy-mm-dd]: { am|pm|on: { staff, status } } } }`. Production flattens this to rows.

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| key: homeId | string | `schedule_slots.home_id` | uuid FK | Promoted from object key to column |
| key: yyyy-mm-dd | string | `schedule_slots.day` | date | Promoted from object key to column |
| key: am/pm/on | string | `schedule_slots.shift` | enum (shift_key) | Promoted from object key to column |
| `staff` | string | `schedule_slots.assigned_to` | uuid FK | Renamed, now FK to profiles |
| `status` | string | `schedule_slots.status` | enum (slot_status) | Typed enum (open, filled, filling) |
| `viaLomi` | boolean | `schedule_slots.via_lomi` | boolean | Renamed |
| -- | -- | `schedule_slots.id` | uuid | New PK |
| -- | -- | `schedule_slots.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `schedule_slots.created_at` | timestamptz | New |
| -- | -- | `schedule_slots.updated_at` | timestamptz | New |

### 4.10 notes[] -> notes + note_goals + note_history

#### notes[] base -> notes

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `notes.id` | uuid | Format change |
| `clientId` | string | `notes.client_id` | uuid FK | Renamed |
| `homeId` | string | `notes.home_id` | uuid FK | Renamed |
| `by` | string | `notes.author_name` | text | Renamed |
| `day` | string | `notes.day` | date | Type change |
| `type` | string | `notes.type` | enum (note_type) | Same values: shift, behavior |
| `status` | string | `notes.status` | enum (note_status) | Expanded: draft, submitted, approved, returned |
| `activities` | string | `notes.content->activities` | jsonb field | Moved into content JSONB |
| `meals` | string | `notes.content->meals` | jsonb field | Moved into content JSONB |
| `mood` | string | `notes.content->mood` | jsonb field | Moved into content JSONB |
| `health` | string | `notes.content->health` | jsonb field | Moved into content JSONB |
| `before` | string | `notes.content->before` | jsonb field | Behavior note fields in content JSONB |
| `behavior` | string | `notes.content->behavior` | jsonb field | Behavior note fields in content JSONB |
| `response` | string | `notes.content->response` | jsonb field | Behavior note fields in content JSONB |
| `outcome` | string | `notes.content->outcome` | jsonb field | Behavior note fields in content JSONB |
| `duration` | string | `notes.content->duration` | jsonb field | Behavior note fields in content JSONB |
| `supervisorComment` | string | `notes.supervisor_comment` | text | Renamed |
| -- | -- | `notes.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `notes.author_id` | uuid FK | New, links to profiles |
| -- | -- | `notes.lomi_drafted` | boolean | New, AI labeling |
| -- | -- | `notes.created_by` | uuid FK | New, audit |
| -- | -- | `notes.created_at` | timestamptz | New |
| -- | -- | `notes.updated_at` | timestamptz | New |

#### notes[].goals[] -> note_goals

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` (goal ID) | string | `note_goals.goal_id` | uuid FK | Now FK to goals table |
| `trials` | string[] | `note_goals.trials` | text[] | Direct map (prompt levels) |
| `notAttempted` / `na` | boolean | `note_goals.not_attempted` | boolean | Renamed |
| `reason` | string | `note_goals.reason` | text | Direct map |
| -- | -- | `note_goals.id` | uuid | New PK |
| -- | -- | `note_goals.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `note_goals.note_id` | uuid FK | New, links to notes |
| -- | -- | `note_goals.created_at` | timestamptz | New |
| -- | -- | `note_goals.updated_at` | timestamptz | New |

#### notes[].history[] -> note_history

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `action` | string | `note_history.action` | text | Direct map |
| `byName` | string | `note_history.by_name` | text | Renamed |
| `at` | ISO string | `note_history.occurred_at` | timestamptz | Renamed, type change |
| -- | -- | `note_history.id` | uuid | New PK |
| -- | -- | `note_history.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `note_history.note_id` | uuid FK | New, links to notes |
| -- | -- | `note_history.created_at` | timestamptz | New |
| -- | -- | `note_history.updated_at` | timestamptz | New |

### 4.11 incidents[] -> incidents

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `incidents.id` | uuid | Format change |
| `clientId` | string | `incidents.client_id` | uuid FK | Renamed |
| `type` | string | `incidents.type` | enum (incident_type) | Typed enum |
| `severity` | string | `incidents.severity` | enum (incident_severity) | Typed enum (Low, Medium, High) |
| `description` | string | `incidents.description` | text | Direct map |
| `by` | string | `incidents.author_name` | text | Renamed |
| `at` | ISO string | `incidents.occurred_at` | timestamptz | Renamed |
| `location` | string | `incidents.location` | text | Direct map |
| `antecedent` | string | `incidents.antecedent` | text | Direct map |
| `injured` | string | `incidents.injured` | text | Direct map |
| `injuryDetail` | string | `incidents.injury_detail` | text | Renamed |
| `staffAction` | string | `incidents.staff_action` | text | Renamed |
| `medicalFollowup` | string | `incidents.medical_followup` | text | Renamed |
| `witnesses` | string | `incidents.witnesses` | text | Direct map |
| `notifiedParties` | string[] | `incidents.notified_parties` | text[] | Renamed |
| -- | -- | `incidents.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `incidents.home_id` | uuid FK | New, links to homes (denormalized from client for query performance) |
| -- | -- | `incidents.author_id` | uuid FK | New, links to profiles |
| -- | -- | `incidents.status` | enum (incident_status) | New. Values: open, reviewed, closed |
| -- | -- | `incidents.followup_notes` | text | New |
| -- | -- | `incidents.created_by` | uuid FK | New, audit |
| -- | -- | `incidents.created_at` | timestamptz | New |
| -- | -- | `incidents.updated_at` | timestamptz | New |

### 4.12 mar[] -> mar_records

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `mar_records.id` | uuid | Format change |
| `clientId` | string | `mar_records.client_id` | uuid FK | Renamed |
| `medId` | string | `mar_records.medication_id` | uuid FK | Renamed |
| `day` | string | `mar_records.day` | date | Type change |
| `status` | string | `mar_records.status` | enum (mar_status) | Typed enum (given, refused, held) |
| `byId` | string | `mar_records.recorded_by` | uuid FK | Renamed |
| `byName` | string | `mar_records.recorded_by_name` | text | Renamed |
| `at` | ISO string | `mar_records.recorded_at` | timestamptz | Renamed |
| `reason` | string | `mar_records.reason` | text | Direct map |
| `effect` | string | `mar_records.effect` | text | Direct map |
| `prn` | boolean | `mar_records.is_prn` | boolean | Renamed |
| -- | -- | `mar_records.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `mar_records.amends_id` | uuid FK (self) | New, self-referencing FK to mar_records.id for corrections/amendments |
| -- | -- | `mar_records.acknowledged` | boolean | New |
| -- | -- | `mar_records.created_by` | uuid FK | New, audit |
| -- | -- | `mar_records.created_at` | timestamptz | New |
| -- | -- | `mar_records.updated_at` | timestamptz | New |

**Constraint:** Unique index on `(client_id, medication_id, day) WHERE is_prn = false` prevents duplicate scheduled-dose recordings while allowing multiple PRN administrations per day.

### 4.13 health[] -> health_entries

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `health_entries.id` | uuid | Format change |
| `clientId` | string | `health_entries.client_id` | uuid FK | Renamed |
| `kind` | string | `health_entries.kind` | enum (health_entry_kind) | Typed enum (vitals, seizure, illness, appointment) |
| `temp`, `pulse`, `sys`, `dia`, etc. | various | `health_entries.data` | jsonb | All vital/seizure/illness fields stored in JSONB |
| `by` | string | `health_entries.recorded_by` | uuid FK | Renamed, now FK to profiles |
| `at` | ISO string | `health_entries.recorded_at` | timestamptz | Renamed |
| `flags` | string[] | `health_entries.flags` | text[] | Direct map (vital threshold alerts) |
| -- | -- | `health_entries.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `health_entries.acknowledged` | boolean | New |
| -- | -- | `health_entries.created_by` | uuid FK | New, audit |
| -- | -- | `health_entries.created_at` | timestamptz | New |
| -- | -- | `health_entries.updated_at` | timestamptz | New |

### 4.14 attendance{} -> attendance

The MVP stores attendance as a nested object: `{ [yyyy-mm-dd]: { [clientId]: { services, by, at } } }`. Production flattens to rows.

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| key: yyyy-mm-dd | string | `attendance.day` | date | Promoted from object key |
| key: clientId | string | `attendance.client_id` | uuid FK | Promoted from object key |
| `services` | string[] | `attendance.services` | text[] | Direct map |
| `by` | string | `attendance.recorded_by` | uuid FK | Renamed, now FK to profiles |
| `at` | ISO string | `attendance.recorded_at` | timestamptz | Renamed |
| -- | -- | `attendance.id` | uuid | New PK |
| -- | -- | `attendance.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `attendance.recorded_by_name` | text | New, denormalized for display |
| -- | -- | `attendance.created_by` | uuid FK | New, audit |
| -- | -- | `attendance.created_at` | timestamptz | New |
| -- | -- | `attendance.updated_at` | timestamptz | New |

### 4.15 msgs[] -> messages

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `messages.id` | uuid | Format change |
| `homeId` | string | `messages.home_id` | uuid FK | Renamed |
| `from` | string | `messages.from_name` | text | Renamed |
| `text` | string | `messages.body` | text | Renamed |
| `at` | ISO string | `messages.sent_at` | timestamptz | Renamed |
| -- | -- | `messages.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `messages.created_by` | uuid FK | New, links to profiles (null for Lomi messages) |
| -- | -- | `messages.created_at` | timestamptz | New |
| -- | -- | `messages.updated_at` | timestamptz | New |

### 4.16 coverage[] -> coverage_requests + coverage_candidates + coverage_steps

#### coverage[] base -> coverage_requests

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `coverage_requests.id` | uuid | Format change |
| `homeId` | string | `coverage_requests.home_id` | uuid FK | Renamed |
| `day` | string | `coverage_requests.day` | date | Type change |
| `shift` | string | `coverage_requests.shift` | enum (shift_key) | Typed enum |
| `calledOut` | string | `coverage_requests.called_out_by` | uuid FK | Renamed, now FK to profiles |
| `reason` | string | `coverage_requests.reason` | text | Direct map |
| `status` | string | `coverage_requests.status` | enum (coverage_status) | Typed enum |
| `filledBy` | string | `coverage_requests.filled_by` | uuid FK | Renamed, now FK to profiles |
| `startedAt` | ISO string | `coverage_requests.started_at` | timestamptz | Renamed. Records when the coverage workflow begins. Used with `filled_at` to compute resolution time in minutes. |
| `filledAt` | ISO string | `coverage_requests.filled_at` | timestamptz | Renamed. Records when the shift is filled. Used with `started_at` to compute resolution time: `Math.round((filledAt - startedAt) / 60000)`. |
| `by` | string | `coverage_requests.created_by` | uuid FK | Renamed, now FK to profiles |
| -- | -- | `coverage_requests.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `coverage_requests.created_at` | timestamptz | New |
| -- | -- | `coverage_requests.updated_at` | timestamptz | New |

#### coverage[].cands[] -> coverage_candidates

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` (staff ID) | string | `coverage_candidates.profile_id` | uuid FK | Renamed, now FK to profiles |
| `ok` | boolean | `coverage_candidates.eligible` | boolean | Renamed |
| `why` | string | `coverage_candidates.eligibility_reason` | text | Renamed |
| `reply` | string | `coverage_candidates.reply` | enum (candidate_reply) | Typed enum. Values: pending, accepted, declined |
| -- | -- | `coverage_candidates.id` | uuid | New PK |
| -- | -- | `coverage_candidates.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `coverage_candidates.coverage_request_id` | uuid FK | New, links to coverage_requests |
| -- | -- | `coverage_candidates.replied_at` | timestamptz | New |
| -- | -- | `coverage_candidates.created_at` | timestamptz | New |
| -- | -- | `coverage_candidates.updated_at` | timestamptz | New |

#### coverage[].steps[] -> coverage_steps

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `text` | string | `coverage_steps.description` | text | Renamed |
| `at` | ISO string | `coverage_steps.occurred_at` | timestamptz | Renamed |
| -- | -- | `coverage_steps.id` | uuid | New PK |
| -- | -- | `coverage_steps.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `coverage_steps.coverage_request_id` | uuid FK | New, links to coverage_requests |
| -- | -- | `coverage_steps.created_at` | timestamptz | New |
| -- | -- | `coverage_steps.updated_at` | timestamptz | New |

### 4.17 clocks[] -> clock_records

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `id` | string | `clock_records.id` | uuid | Format change |
| `staffId` | string | `clock_records.profile_id` | uuid FK | Renamed |
| `homeId` | string | `clock_records.home_id` | uuid FK | Renamed |
| `inAt` | ISO string | `clock_records.clock_in_at` | timestamptz | Renamed |
| `outAt` | ISO string | `clock_records.clock_out_at` | timestamptz | Renamed |
| `verified` | boolean | `clock_records.verified` | boolean | Direct map |
| `manual` | boolean | `clock_records.manual_override` | boolean | Renamed |
| `distance` | number | `clock_records.distance_meters` | real | Renamed |
| `lat` | number | `clock_records.clock_in_lat` | real | Renamed. GPS coordinates persisted for EVV compliance. |
| `lng` | number | `clock_records.clock_in_lng` | real | Renamed. GPS coordinates persisted for EVV compliance. |
| -- | -- | `clock_records.clock_out_lat` | real | New, clock-out GPS latitude |
| -- | -- | `clock_records.clock_out_lng` | real | New, clock-out GPS longitude |
| -- | -- | `clock_records.accuracy` | real | New, GPS accuracy in meters |
| -- | -- | `clock_records.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `clock_records.acknowledged` | boolean | New |
| -- | -- | `clock_records.created_at` | timestamptz | New |
| -- | -- | `clock_records.updated_at` | timestamptz | New |

### 4.18 events[] -> events

| MVP Field | MVP Type | Postgres Column | Postgres Type | Notes |
|-----------|----------|-----------------|---------------|-------|
| `type` | string | `events.event_type` | text | Renamed |
| `at` | ISO string | `events.created_at` | timestamptz | Mapped to created_at |
| `homeId` | string | `events.home_id` | uuid FK | Type change |
| remaining fields | various | `events.detail` | jsonb | All extra event data moved to JSONB |
| -- | -- | `events.id` | uuid | New PK |
| -- | -- | `events.agency_id` | uuid FK | New, tenant isolation |
| -- | -- | `events.table_name` | text | New, for cross-referencing |
| -- | -- | `events.record_id` | uuid | New, for cross-referencing |
| -- | -- | `events.updated_at` | timestamptz | New |

### 4.19 session -> Supabase Auth

| MVP Field | MVP Type | Replacement | Notes |
|-----------|----------|------------|-------|
| `session.userId` | string | Supabase Auth JWT | No longer stored in app data. Auth state managed by Supabase client SDK. |

---

## 5. Column Renames

Complete table of every field that was renamed between the MVP and the production schema.

| MVP Field | MVP Location | Postgres Column | Postgres Table | Rename Reason |
|-----------|-------------|-----------------|----------------|---------------|
| `ini` | staff[] | `initials` | profiles | Clarity |
| `medCert` | staff[] | `med_certified` | profiles | snake_case convention |
| `homeIds` | staff[] | `home_ids` | profiles | snake_case convention |
| `ini` | clients[] | `initials` | clients | Clarity |
| `first` | clients[] | `first_name` | clients | Clarity |
| `homeId` | clients[] | `home_id` | clients | snake_case convention |
| `medId` | mar[] | `medication_id` | mar_records | Clarity + snake_case |
| `byId` | mar[] | `recorded_by` | mar_records | Clarity |
| `byName` | mar[] | `recorded_by_name` | mar_records | snake_case convention |
| `at` | mar[] | `recorded_at` | mar_records | Clarity |
| `prn` | mar[] | `is_prn` | mar_records | Boolean naming convention |
| `by` | health[] | `recorded_by` | health_entries | Clarity |
| `at` | health[] | `recorded_at` | health_entries | Clarity |
| `clientId` | notes[] | `client_id` | notes | snake_case convention |
| `homeId` | notes[] | `home_id` | notes | snake_case convention |
| `by` | notes[] | `author_name` | notes | Clarity |
| `supervisorComment` | notes[] | `supervisor_comment` | notes | snake_case convention |
| `notAttempted` | note goals | `not_attempted` | note_goals | snake_case convention |
| `byName` | note history | `by_name` | note_history | snake_case convention |
| `clientId` | incidents[] | `client_id` | incidents | snake_case convention |
| `injuryDetail` | incidents[] | `injury_detail` | incidents | snake_case convention |
| `staffAction` | incidents[] | `staff_action` | incidents | snake_case convention |
| `medicalFollowup` | incidents[] | `medical_followup` | incidents | snake_case convention |
| `notifiedParties` | incidents[] | `notified_parties` | incidents | snake_case convention |
| `from` | msgs[] | `from_name` | messages | Clarity (from is reserved word) |
| `text` | msgs[] | `body` | messages | Clarity |
| `at` | msgs[] | `sent_at` | messages | Clarity |
| `homeId` | msgs[] | `home_id` | messages | snake_case convention |
| `calledOut` | coverage[] | `called_out_by` | coverage_requests | Clarity |
| `startedAt` | coverage[] | `started_at` | coverage_requests | snake_case convention |
| `filledAt` | coverage[] | `filled_at` | coverage_requests | snake_case convention |
| `filledBy` | coverage[] | `filled_by` | coverage_requests | snake_case convention |
| `ok` | coverage cands | `eligible` | coverage_candidates | Clarity |
| `why` | coverage cands | `eligibility_reason` | coverage_candidates | Clarity |
| `text` | coverage steps | `description` | coverage_steps | Clarity |
| `at` | coverage steps | `occurred_at` | coverage_steps | Clarity |
| `staffId` | clocks[] | `profile_id` | clock_records | Consistency (profiles table) |
| `homeId` | clocks[] | `home_id` | clock_records | snake_case convention |
| `inAt` | clocks[] | `clock_in_at` | clock_records | Clarity |
| `outAt` | clocks[] | `clock_out_at` | clock_records | Clarity |
| `manual` | clocks[] | `manual_override` | clock_records | Clarity |
| `distance` | clocks[] | `distance_meters` | clock_records | Units in name |
| `type` | events[] | `event_type` | events | Avoid reserved word |
| `viaLomi` | schedule | `via_lomi` | schedule_slots | snake_case convention |
| `time` | client meds | `scheduled_time` | medications | Clarity |
| `prn` | client meds | `prn_instructions` | medications | Changed from boolean to text |
| `stopped` | client meds | `stopped_at` | medications | Changed from boolean to timestamp |
| `stopped` | client goals | `stopped_at` | goals | Changed from boolean to timestamp |
| `text` | client caseNotes | `body` | case_notes | Clarity |
| `dob` | client health | `dob` | client_health_info | Type change (string to date) |

---

## 6. New Tables

Tables in the production schema that have no standalone equivalent in the MVP (were either absent or stored as nested sub-objects/arrays within other entities).

| Table | Purpose | Why It Did Not Exist in MVP |
|-------|---------|----------------------------|
| `agencies` | Multi-tenant root. Every row in every other table references an agency. Stores name, slug, charting preset, subscription tier, settings. | MVP was single-agency with a bare `{ name }` object. |
| `audit_log` | HIPAA-required immutable record of every data mutation. Captures table, record ID, action (INSERT/UPDATE/DELETE), old values, new values, user, IP, user agent. 6-year retention. | MVP had `events[]` for analytics but no structured audit trail and no immutability. |
| `notifications` | Tracks every notification (push, SMS, email) sent to a user. Status lifecycle: pending, sent, delivered, read. Links to triggering record (incident, coverage request, etc.). | MVP had no notification system. Coverage messages were posted inline as chat messages. |
| `notification_preferences` | Per-user, per-notification-type channel preferences (push, SMS, email toggles). | MVP had no user preferences. |
| `sync_checkpoints` | PowerSync offline sync state per user per table. Stores last sync timestamp and checkpoint token for incremental sync. | MVP had no sync -- all data local only. |
| `goal_templates` | Agency-level goal template library. Seeded from `TEMPLATES` constant in `app-core.js` but now editable by supervisors. `is_default` flag for system templates. | MVP hardcoded templates in JS: `TEMPLATES = {"Daily living":[...], "Community":[...], ...}`. |
| `referrals` | Client intake pipeline. Tracks inquiries from referral sources through admission. Status: inquiry, touring, accepted, waitlist, declined, placed (per `referral_status` enum in schema.ts). | MVP had no intake workflow. |
| `rooms` | Physical rooms within homes. Tracks capacity and current occupant. Used by intake to show availability. | MVP had no room tracking. |
| `coverage_candidates` | Normalized from `coverage[].cands[]` inline array. Each candidate is a row with eligibility status, reason, and reply. Enables querying and reporting. | MVP stored candidates as a nested array within the coverage object. |
| `coverage_steps` | Normalized from `coverage[].steps[]` inline array. Each step is a timestamped row. Provides structured audit trail for coverage workflows. | MVP stored steps as a nested array within the coverage object. |
| `note_history` | Normalized from inline note history. Tracks every status change (draft, submitted, returned, approved) with actor and timestamp. | MVP stored history inline within note objects. |
| `medication_history` | Normalized from `clients[].medHistory[]` inline array. Tracks medication changes (added, dose changed, stopped) with actor and timestamp. | MVP stored med history as a nested array within client objects. |
| `client_health_info` | Extracted from `clients[].health` nested object. One row per client with allergies, conditions, diet, doctor, guardian, DOB. | MVP stored health info as a nested object within each client. |
| `case_notes` | Extracted from `clients[].caseNotes[]` inline array. Supervisor-authored clinical case notes, separate from shift/behavior notes. | MVP stored case notes as a nested array within client objects. |

---

## 7. Implementation Steps

### Phase 1: Foundation (Weeks 1-2)

| Task | Detail | Deliverable |
|------|--------|-------------|
| SvelteKit project init | `npm create svelte@latest`, Svelte 5 runes mode, TypeScript strict, Vite | Repo with `src/`, `static/`, `svelte.config.js` |
| Supabase project setup | Create project, enable Auth (email/password + magic link), configure JWT claims for `agency_id` | Supabase dashboard configured, env vars set |
| Drizzle ORM setup | Install `drizzle-orm` + `drizzle-kit`, copy `schema.ts` from `.specify/`, configure `drizzle.config.ts` | `npx drizzle-kit push` succeeds |
| Schema push | Push all 30 tables to local Supabase Postgres | All tables created with indexes |
| RLS policies | Apply all policies from `.specify/rls.sql` | `SELECT * FROM pg_policies` shows complete coverage |
| Auth integration | Supabase Auth client in SvelteKit hooks, session management, role extraction from JWT | Login/logout works, roles propagate |
| Seed script | Faker.js-based seed (see Section 8) | `npm run db:seed` populates dev database |
| CI pipeline | GitHub Actions: lint, type-check, unit test, Drizzle schema validation | Green CI on every push |

### Phase 2: Core Services (Weeks 3-4)

| Task | Detail | Deliverable |
|------|--------|-------------|
| tRPC setup | `@trpc/server` + `@trpc/client`, SvelteKit adapter, auth middleware, role middleware, audit middleware | `src/lib/server/trpc/` directory, context with agency_id |
| Charting service | Notes CRUD, goal tracking (note_goals), note lifecycle (draft -> submitted -> approved/returned), note history | `note.*` tRPC procedures passing integration tests |
| MAR service | Medication admin records, PRN handling, immutable `given` entries, amendments | `mar.*` tRPC procedures, "no delete" rule enforced |
| Health service | Vitals logging, seizure tracking, vital threshold alerts, health entry CRUD | `health.*` tRPC procedures |
| Incident service | Incident reporting, severity classification, notification rules | `incident.*` tRPC procedures |
| Attendance service | Daily service attendance tracking per client | `attendance.*` tRPC procedures |
| PowerSync setup | PowerSync instance, sync rules per table, OPFS configuration, conflict resolution | Offline writes sync on reconnect |

### Phase 3: UI Migration (Weeks 5-6)

| Task | Detail | Deliverable |
|------|--------|-------------|
| Layout + navigation | SvelteKit layout with role-based nav, home selector, sync status indicator | Shell renders, routes resolve |
| Caregiver dashboard | Today's tasks, meds due, active shift note, clock-in status | Feature parity with MVP caregiver view |
| Shift note editor | Content fields, goal trials (prompt levels), AI draft button, signature flow | Notes created and submitted |
| Behavior note editor | ABC fields (antecedent, behavior, consequence), behavior type selector | Behavior notes created |
| Supervisor dashboard | Pending reviews, home overview, staff status, coverage status | Feature parity with MVP supervisor view |
| Note review flow | Approve/return with comments, signature capture | Supervisor can review and approve |
| Lomi AI integration | AWS Bedrock Claude for note drafting, streaming response, `lomi_drafted` flag | AI drafts rendered with label |
| Voice transcription | Azure OpenAI Whisper, recording UI, transcript insertion | Voice-to-text in note editor |

### Phase 4a: Scheduling & Timekeeping (Weeks 7-8)

| Task | Detail | Deliverable |
|------|--------|-------------|
| Schedule manager | Weekly grid by home, shift assignment, open shift detection | Schedule view with drag-and-fill |
| Coverage engine | Lomi coverage workflow: callout -> eligibility check -> offer -> accept/decline -> fill | Coverage fills automatically via Lomi |
| BullMQ integration | Redis + BullMQ for coverage jobs, notification dispatch, coverage timeout | Background jobs process reliably |
| Clock-in system | Geofence verification, GPS distance check, missed punch detection, manual override | Clock-in/out with location verification |

### Phase 4b: Notifications & Intake (Weeks 9-10)

| Task | Detail | Deliverable |
|------|--------|-------------|
| Twilio SMS | Shift offers sent via SMS, reply handling (accept/decline by text) | SMS coverage flow end-to-end |
| Timesheet export | Payroll-ready CSV/PDF export, supervisor approval | Exportable timesheets |
| Notification system | FCM push, Twilio SMS, SES email, notification preferences per user | Notifications delivered by channel |
| Client intake | Referral pipeline, room availability, client admission flow | Intake workflow operational |

### Phase 5: Production Readiness (Weeks 11-13)

**Note:** BAA (Business Associate Agreement) execution with subprocessors (Supabase, AWS, Azure, Twilio) should begin as a parallel legal/compliance workstream starting in Phase 1. BAA negotiations typically take 4-12 weeks and involve legal review, security questionnaires, and procurement processes outside the engineering team's control. Supabase, AWS, and Azure all have standard BAA templates that can accelerate this process, but Twilio's HIPAA offering requires ISV program enrollment.

| Task | Detail | Deliverable |
|------|--------|-------------|
| PWA configuration | Service worker, manifest.json, Add to Home Screen, offline caching strategy | Installable PWA, works offline |
| Feature entitlements | `subscription_tier` + `enabled_features` gating in middleware and UI | Features gated by tier |
| E2E tests | Playwright: login, create note, submit, approve, MAR, clock-in, coverage | Full critical path coverage |
| Security audit | OWASP checklist, RLS verification, PHI leak scan, penetration test | Audit report with zero critical findings |
| HIPAA compliance | BAA portfolio verification (started in Phase 1), privacy policy, breach response plan | BAA portfolio complete |
| Performance optimization | Lighthouse audit, bundle analysis, 3G performance target verification | All performance targets met (see constitution) |
| Deployment | Vercel (app) + Supabase (DB) production projects, DNS, SSL, monitoring | Production URL live |
| Charting preset validation | Verify `therap` and `default` presets produce identical data, different labels | Both presets tested end-to-end |

---

## 8. Test Data Seeding

The seed script (`src/lib/server/seed.ts`) creates a realistic development dataset using **Faker.js synthetic data only**.

**CRITICAL: Never use real patient names, real employee names, real addresses, real health data, or any data from production systems. Using real data for testing is a compliance and legal violation.**

### Seed Data Inventory

| Entity | Count | Details |
|--------|-------|---------|
| Agency | 1 | Name: "Nticare" (fictional), slug: `nticare`, preset: `default`, tier: `professional` |
| Homes | 3 | Faker-generated addresses, fictional names (e.g., "Maple House", "Cedar Home", "Birch Place"), coordinates near a test metro area |
| Staff (profiles) | 8 | 4 caregivers, 2 supervisors, 2 admins. Faker names, emails (`@nticare-test.example`), randomized `med_certified` flags, assigned to homes |
| Clients | 12 | 4 per home. Faker names, generated health info (allergies, conditions, diet, doctor, guardian, DOB) |
| Goals | 36 | 3 per client. Drawn from `TEMPLATES` constant (Daily living, Community, Health, Social categories) |
| Medications | 24 | 2 per client. Faker drug names with realistic doses, routes, scheduled times. Mix of scheduled and PRN |
| Health entries | 48 | 4 per client (2 weeks of vitals). Realistic ranges, some with threshold flags |
| Notes | 60 | ~5 per client over 2 weeks. Mix of shift and behavior notes. Statuses: draft, submitted, approved |
| Note goals | 108 | 3 per shift note (matching client goals). Randomized trial data with prompt levels |
| Incidents | 6 | Spread across homes. Mix of types and severities |
| MAR records | 168 | 14 days x 12 clients (for scheduled meds). Mix of given, refused, held |
| Attendance | 84 | 14 days x ~6 clients/day active. Randomized services from `SERVICES` constant |
| Schedule slots | 126 | 14 days x 3 homes x 3 shifts. Most filled, some open |
| Clock records | 84 | Matching filled schedule slots. Realistic in/out times, distances |
| Coverage requests | 4 | 2 filled, 1 searching, 1 unfilled. With candidates and steps |
| Messages | 30 | Mix of staff and Lomi messages across homes |
| Goal templates | 14 | Seeded from `TEMPLATES` constant in `app-core.js` |
| Rooms | 12 | 4 per home. Mix of occupied and available |
| Referrals | 3 | Various stages: inquiry, touring, accepted |
| Audit log | -- | Auto-generated via audit middleware during seeding operations |
| Notification preferences | 8 | 1 per staff member, default channel preferences (push + email enabled, SMS disabled) |
| Note history | ~120 | 1-3 per note, matching status transitions (created, submitted, approved/returned) |
| Medication history | ~24 | 1-2 per medication (initial 'added' entry, some with 'updated' or 'stopped') |
| Case notes | ~12 | 1-2 per client, supervisor-authored clinical observations |
| Events | 200+ | Generated from above actions. Types match MVP event types |

### Seed Script Structure

```
src/lib/server/seed.ts
  - createAgency()           // Nticare with settings
  - createHomes(agencyId)    // 3 homes with rooms
  - createStaff(agencyId)    // 8 profiles with Supabase Auth test accounts
  - createClients(agencyId)  // 12 clients with health info, goals, meds
  - createSchedule(agencyId) // 2 weeks of schedule slots
  - createNotes(agencyId)    // Notes with goal tracking data
  - createMAR(agencyId)      // 2 weeks of medication records
  - createHealth(agencyId)   // Vitals and health entries
  - createIncidents(agencyId)
  - createCoverage(agencyId) // Coverage requests with candidates and steps
  - createClocks(agencyId)   // Clock records matching schedule
  - createMessages(agencyId)
  - createAttendance(agencyId)
  - createReferrals(agencyId)
  - createCaseNotes(agencyId)  // 1-2 per client, supervisor observations
  - createNotificationPrefs(agencyId)  // Default preferences per staff
  // Note: audit_log, note_history, and medication_history records
  // are auto-generated by audit middleware during the above operations
```

### Test Auth Accounts

| Email | Password | Role | Name |
|-------|----------|------|------|
| `admin@nticare-test.example` | `Test1234!` | admin | (Faker-generated) |
| `admin2@nticare-test.example` | `Test1234!` | admin | (Faker-generated) |
| `super1@nticare-test.example` | `Test1234!` | supervisor | (Faker-generated) |
| `super2@nticare-test.example` | `Test1234!` | supervisor | (Faker-generated) |
| `cg1@nticare-test.example` | `Test1234!` | caregiver | (Faker-generated) |
| `cg2@nticare-test.example` | `Test1234!` | caregiver | (Faker-generated) |
| `cg3@nticare-test.example` | `Test1234!` | caregiver | (Faker-generated) |
| `cg4@nticare-test.example` | `Test1234!` | caregiver | (Faker-generated) |

### Running the Seed

```bash
# Seed local dev database
npm run db:seed

# Reset and re-seed
npm run db:reset && npm run db:seed
```

---

## 9. Rollback Plan

This is a greenfield deployment. The MVP and the production system are entirely separate applications with separate data stores.

| Scenario | Action | Data Impact |
|----------|--------|-------------|
| Production system has critical bugs during internal testing | Continue using MVP for demos. Fix bugs in production system. | None. MVP data is test data. Production data is seed data. |
| Production system fails after agency onboarding | Revert agency to MVP (if before real data entry) or fix production bugs. | If agency entered real data in production, that data is in Supabase and unaffected by MVP revert. |
| Supabase outage | PowerSync offline mode keeps the app functional. Data syncs when Supabase recovers. | No data loss. PowerSync queues writes locally. |
| Schema needs breaking changes post-launch | Drizzle migration with data backfill. Never destructive -- always additive migrations with backfill scripts. | Data preserved via migration. |
| Need to roll back a deployment | Vercel instant rollback to previous deployment. Database migrations are forward-only. | App code reverts. Database schema stays current (backward-compatible migrations only). |
| PowerSync OPFS corruption | App falls back to online-only mode (direct Supabase queries). OPFS database is cleared and re-synced from server. | No data loss. PowerSync is a cache of server-authoritative data. Unsynced writes in the corrupted OPFS may be lost; this is an accepted risk mitigated by frequent sync intervals. |

### Key Principle

There is no "migration back to MVP" scenario because:
1. The MVP contains no real data worth preserving.
2. The MVP architecture (localStorage, no auth, no encryption) is fundamentally incompatible with production requirements.
3. Once real agencies onboard, their data exists only in Supabase -- there is no MVP equivalent.

The rollback strategy is standard deployment rollback (Vercel revert + database forward-compatibility), not a return to the MVP architecture.
