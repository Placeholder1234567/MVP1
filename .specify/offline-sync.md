# Offline Sync Architecture

## Device readiness checks

The PIN gates and Me install card check a secure context, WebCrypto PBKDF2/AES-GCM operations, and a write to a unique disposable OPFS file containing one synthetic byte. The probe removes only its own file; it never lists or reads saved records. Missing or blocked storage produces recovery guidance without clearing existing data. Passing this probe does not prove that the encrypted SQLite worker will open: PIN unlock still performs the real database initialization and handles failure separately.

The install card reports service-worker registration and storage persistence separately. `persisted()` checks status; `persist()` is called only when the caregiver explicitly chooses **Ask browser to keep saved data**. A denial or unsupported API keeps the current workspace intact. Persistent storage reduces browser eviction risk, but it is not a backup or a guarantee against user clearing or device loss. See [MDN StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

Install instructions describe browser menus and Safari Share → Add to Home Screen, following [Apple's web app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios). The installed icon must be opened online and signed in separately where browser storage is isolated. No automated capability check establishes native iOS/Android compatibility; physical-device installation, storage-pressure behavior and actual encrypted database recovery still require device testing.

## 1. Overview

Guad uses [PowerSync](https://www.powersync.com/) to deliver offline-first functionality for IDD residential care charting. The architecture has three tiers:

```
Cloud SQL Postgres 16        PowerSync Service          Client (PWA)
 (source of truth)       (self-hosted, Cloud Run)  (wa-sqlite via OPFS)
 ┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
 │              │  WAL    │              │  delta   │  wa-sqlite DB    │
 │  38 tables   │────────>│  Sync Rules  │────────> │  (encrypted,     │
 │  RLS-enforced│         │  (YAML)      │         │   OPFS-backed)   │
 │              │         │  Bucket      │         │  Write Queue     │
 │              │         │  routing     │         │  (FIFO)          │
 │              │         └──────────────┘         │                  │
 │              │<──── writes: tRPC sync.upload ───│                  │
 └──────────────┘      (app server, Cloud Run)     └──────────────────┘
```

### How It Works

1. **Server to client (read path):** PowerSync tails the Postgres WAL (Write-Ahead Log) and evaluates sync rules to determine which rows belong to which user. Changed rows are streamed to clients as compact deltas over a persistent WebSocket connection (WSS).

2. **Client to server (write path):** Local mutations are written to the wa-sqlite database immediately (sub-20ms) and queued in a FIFO write queue. When connectivity is available, the queue is uploaded through the **`sync.upload` tRPC procedure** -- never straight to the database. `sync.upload` runs each operation through the owning service (the same code path as the online procedures), so Zod validation, role and feature checks, business rules (note signing, med certification, vital flags, clock verification), notifications and the audit trail all apply to offline writes too. Postgres RLS and the integrity triggers in `rls.sql` are the backstop. The server is authoritative -- if a write is rejected, the client is told why (section 6).

3. **Conflict resolution:** Server-authoritative, last-write-wins using server timestamps. The server state always takes precedence over local state on conflict. See section 5 for per-operation details.

### Why OPFS Over IndexedDB

| Factor | OPFS | IndexedDB |
|--------|------|-----------|
| **Storage model** | File-system-like, optimized for SQLite | Key-value store, poor for relational queries |
| **Performance** | Synchronous access via `FileSystemSyncAccessHandle`; sub-ms reads | Async transactions with event loop overhead; 2-10ms reads |
| **Concurrency** | Exclusive file locks managed by the origin private FS | Transaction locking can deadlock under heavy write load |
| **Encryption** | SQLite3MultipleCiphers works on OPFS file handles | Encryption requires wrapping every IDB transaction |
| **Size limits** | Browser-managed quota (typically 50%+ of disk) | Often limited to 50-100MB by browser heuristics |
| **Compatibility** | Chrome 102+, Firefox 111+, Safari 15.4+ | Universal but with divergent implementations |
| **PHI safety** | Encrypted at rest via SQLite3MultipleCiphers (ChaCha20-Poly1305); not inspectable via DevTools Application tab | Plaintext by default; visible in DevTools; requires manual encryption layer |

OPFS is the only permitted client-side PHI storage per the constitution (principle 2). See "Local database encryption key" below for how the database is encrypted.

### Local Database Encryption Key

The key is **not** derived from the session token: access tokens rotate hourly and a device can be offline for a whole shift, so a token-derived key would lock the caregiver out of their own unsynced work.

1. On first sign-in on a device, the server generates a random 256-bit database key for that user and device, stores it in `device_keys` (schema.ts #38: AES-256-GCM under `DEVICE_KEY_KEK`, RLS with no policies so no user session can read it), and returns it over TLS through `device.key`. The device generates its own random device ID once.
2. The client keeps the key in memory only, and also stores a copy **wrapped** with a key derived from the user's device PIN (PBKDF2-SHA256, 600k iterations, random salt, AES-256-GCM) in one small OPFS file, `guad-device.json`, next to the device ID (`src/lib/sync/device-key.ts`). Only the wrapped copy touches disk.
3. Opening the app (online or offline) asks for the PIN, unwraps the key, and opens the database. After 5 wrong PINs the wrapped key is deleted; the database can then only be reopened by signing in online, which fetches the key from the server again.
4. Deactivating a user or device on the server deletes the server copy, so a stolen device can't be re-keyed.

> **Verified (Oct 2026, `@powersync/web` 2.4.2, Chromium):** the database opens with `database: { vfs: WASQLiteVFS.OPFSCoopSyncVFS, encryptionKey }` and is encrypted with SQLite3MultipleCiphers (ChaCha20). The OPFS file has no SQLite header and none of the synced text appears in its bytes. **Still to verify:** Safari and Firefox on real phones, which the PWA must support. `vfs` must be set explicitly, because the SDK can default to IndexedDB.

### How PowerSync Differs from Traditional Sync

Traditional approaches (service worker API caching, custom IndexedDB replication) require the developer to build conflict resolution, delta tracking, queue management, and reconnection logic. PowerSync provides all of this as infrastructure:

- **No API response caching** -- PowerSync replicates the database itself, not API responses. Queries against the local wa-sqlite database return the same results whether online or offline.
- **No manual change tracking** -- The Postgres WAL feeds PowerSync automatically. Adding a column or table to sync requires only updating sync rules, not building new replication logic.
- **No custom conflict resolution code** -- PowerSync's server-authoritative model resolves conflicts at the sync layer. The application code writes to the local database identically whether online or offline.

---

## 2. Offline-First Principle

From `constitution.md`, Principle 3:

> **Principle 3:** Offline-first, server-authoritative. Every feature must function offline. Writes are stored locally via PowerSync (wa-sqlite + OPFS) and sync via server-authoritative last-write-wins on reconnect. On conflict, the server's state is authoritative. The app must never show a spinner or error when the network is unavailable — it degrades gracefully. A feature is not shipped until it handles: (a) creation while offline, (b) modification while offline, (c) conflict resolution on reconnect, and (d) UI indication of sync status. There are no "online-only" features in the caregiver-facing documentation workflows. Features that require server-side processing (supervisor approval, AI drafting, coverage offers, report generation) degrade gracefully offline with clear user messaging.

### What "Works Offline" Means Concretely

For a feature to be considered offline-capable, all of the following must be true:

1. **Reads work instantly.** All data the user needs is pre-synced to the local wa-sqlite database. No network requests are made for reads. Local queries return in under 10ms.

2. **Writes persist locally.** Mutations are written to wa-sqlite immediately (under 20ms). The user sees the result of their action without waiting for a server round-trip.

3. **No spinners or errors.** When the network is unavailable, the UI does not show loading indicators, error toasts, or "no connection" modals. The user may not even realize they are offline.

4. **Sync is automatic.** When connectivity returns, queued writes replay automatically in FIFO order. No user action is required to "sync."

5. **Conflicts are handled.** If the same record was modified both offline and on the server (or another device), the conflict is resolved automatically per the rules in section 5.

6. **Sync status is visible.** A small, non-intrusive indicator shows whether the device is synced, syncing, or has pending writes (section 9).

### What Works Offline

| Feature | Offline Capability |
|---------|-------------------|
| Creating/editing shift and behavior notes | Full -- write to local DB, queue for sync |
| Recording MAR entries (scheduled and PRN) | Full -- write locally, server enforces unique constraint on sync |
| Logging health entries (vitals, seizures) | Full -- write locally, flags computed locally from domain constants |
| Recording attendance | Full -- write locally |
| Creating incident reports | Full -- write locally |
| Clocking in/out | Full -- GPS captured locally, distance calculated locally, verified on sync |
| Reading client info, goals, medications | Full -- pre-synced to device within sync window |
| Browsing schedule | Full -- schedule_slots pre-synced |
| Sending home messages | Full -- write locally, delivered on sync |
| Read receipts on home messages | Full -- recorded locally when the board shows a message, uploaded on sync |

> **Two connections, not one.** Reads stream from PowerSync; queued writes go to the app server (`sync.upload`). A device can upload while PowerSync is down, and can read saved data while the app server is down. "Offline" in the UI means PowerSync isn't connected; the upload count shows what hasn't reached the app server yet.
| Viewing recent history (notes, incidents, MAR) | Full -- 30-day window synced |

### What Requires Connectivity

| Feature | Reason | Offline Fallback |
|---------|--------|------------------|
| AI note drafting (Lomi) | Requires Vertex AI call | Show "Lomi unavailable offline" banner; DSP types manually or drafts from structured input |
| Voice transcription | Requires Speech-to-Text API | Show "Transcription unavailable offline" banner; DSP types manually |
| Supervisor note approval | Requires authoritative status transition and audit trail integrity | Note remains in `submitted` status; supervisor sees it when back online |
| Real-time messaging | Requires the PowerSync connection | Messages queue locally and deliver on sync; no real-time indication |
| Report generation | Server-side aggregation, PDF/CSV rendering | Show "Reports require connectivity" message |
| Coverage offers | Time-sensitive SMS/push notifications | Coverage requests queue but are only useful in real-time; show "Coverage requires connectivity" |
| Calling out sick | Coverage request triggers SMS notification pipeline | Show "Callout requires connectivity" message; suggest calling supervisor directly |
| Notification delivery | FCM, SMS and email require network | Notifications queue server-side and deliver when user reconnects |

---

## 3. PowerSync Client Setup

### SvelteKit Integration

PowerSync initializes in the SvelteKit client hook (`src/hooks.client.ts`) so it is available before any route loads. The PowerSync instance is a singleton shared across the app via Svelte context.

```typescript
// src/hooks.client.ts (pseudocode)
import { PowerSyncDatabase } from '@powersync/web';
import { GuadConnector } from '#lib/sync/connector';
import { appSchema } from '#lib/sync/schema';

const connector = new GuadConnector();

export const powerSync = new PowerSyncDatabase({
  schema: appSchema,
  database: {
    dbFilename: 'guad.db'
  },
  flags: {
    enableMultiTabs: false  // OPFS requires single-tab exclusive lock
  }
});

await powerSync.init();
await powerSync.connect(connector);
```

### Connection Management

```typescript
// src/lib/sync/connector.ts (pseudocode)
import type {
  PowerSyncBackendConnector,
  AbstractPowerSyncDatabase
} from '@powersync/web';
import { auth } from '#lib/auth/firebase';   // Firebase Auth SDK, inMemoryPersistence
import { signInWithCustomToken } from 'firebase/auth';

export class GuadConnector implements PowerSyncBackendConnector {
  /**
   * Called by PowerSync to obtain an auth token for the sync connection.
   * Returns a token held in memory only: an Identity Platform ID token in
   * production (PowerSync verifies it against Google's JWKS), or a dev-only
   * PowerSync token with the local Auth emulator. It carries only the user
   * ID; the sync streams look up the profile live (section 4).
   */
  async fetchCredentials() {
    if (!auth.currentUser) {
      // After a reload: the HttpOnly session cookie proves the session, and
      // the server returns a Firebase custom token (infrastructure.md §3).
      const res = await fetch('/auth/sync-token', { method: 'POST' });
      if (!res.ok) throw new Error('No active session');
      await signInWithCustomToken(auth, (await res.json()).customToken);
    }
    const result = await auth.currentUser!.getIdTokenResult();

    return {
      endpoint: PUBLIC_POWERSYNC_URL,   // from '$env/static/public'
      token: result.token,
      expiresAt: new Date(result.expirationTime)
    };
  }

  /**
   * Called by PowerSync to upload local mutations to the server.
   * Sends the whole transaction to the sync.upload tRPC procedure, which
   * applies each operation through the owning service (validation, business
   * rules, notifications, audit). Devices have no direct database access.
   * Operations stay in FIFO order to preserve dependent write ordering.
   */
  async uploadData(database: AbstractPowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) return;

    try {
      const result = await trpc.sync.upload.mutate({
        transactionId: transaction.transactionId,
        ops: transaction.crud.map((op) => ({
          op: op.op,          // 'PUT' | 'PATCH' | 'DELETE'
          table: op.table,
          id: op.id,
          data: op.opData,
        })),
      });

      // Rejected ops come back with a code (Appendix B); accepted ops are applied.
      for (const rejected of result.rejected) reportFailedWrite(rejected);
      await transaction.complete();
    } catch (error) {
      // Only network/5xx errors reach here: the transaction stays in the
      // queue and PowerSync retries with backoff (section 6).
      throw error;
    }
  }
}
```

### Auth Token Provider Flow

```
User signs in via Identity Platform (Firebase Auth SDK)
         │
         v
Server creates the HttpOnly session cookie (/auth/session)
         │
         v
PowerSync connector calls /auth/sync-token (the cookie proves who it is):
  production: Firebase custom token -> signInWithCustomToken -> 1-hour ID token
  local dev:  1-hour PowerSync token signed with the dev-only key
         │
         v
PowerSync verifies the token
  production: jwks_uri = Google securetoken JWKS, audience = project ID
  local dev:  static HS256 key in powersync/service.yaml, audience guad-local
         │
         v
Sync streams look up the caller's active profile by auth_uid = auth.user_id()
and pick agency-, home- and user-scoped rows from it (section 4)
         │
         v
PowerSync streams matching rows to client wa-sqlite
```

### Client Schema Definition

The PowerSync client schema mirrors the server Drizzle schema for synced tables. This schema defines the local wa-sqlite table structure.

```typescript
// src/lib/sync/schema.ts (pseudocode -- one entry per synced table)
import { column, Schema, Table } from '@powersync/web';

const agencies = new Table({ name: column.text, slug: column.text, /* ... */ });
const homes = new Table({ name: column.text, address: column.text, /* ... */ });
const clients = new Table({ name: column.text, home_id: column.text, /* ... */ });
const notes = new Table({ content: column.text, status: column.text, /* ... */ });
// ... all synced tables

export const appSchema = new Schema({
  agencies, homes, clients, notes, /* ... all synced tables */
});
```

---

## 4. Sync Streams (powersync/sync-config.yaml)

Sync Streams define which rows each signed-in user receives. This section is the source of truth: `npm run sync:rules` copies the YAML below into `powersync/sync-config.yaml`, and CI fails if the two differ.

**How access is decided.** The token PowerSync verifies carries only the user's ID (`auth.user_id()`, the Identity Platform UID). Every stream looks up the caller's `profiles` row live, with `auth_uid = auth.user_id() AND active = true`, and reads the agency, role and homes from it. So:

- **Deactivation takes effect within seconds.** Setting `profiles.active = false` empties every stream for that user, and PowerSync removes the rows from the device on its next sync. Nothing waits for a token to expire. (Measured locally: about 3 seconds.)
- **Role and home changes apply immediately** for the same reason. No custom claims, no token refresh.
- **Caregivers** get home-scoped data for the homes in their `home_ids`. **Supervisors and admins** get every home in their agency. This mirrors the RLS policies in rls.sql.

Synced to everyone in the agency (reference data, small): the agency, its homes, goal templates and staff profiles. `mfa_enabled` is deliberately not synced.

Time windows: tables with `device_sync = true` filters are windowed by `SyncWindowJob` (section 7); clinical data keeps 30 days on the device, transient data 7.

PowerSync's older "Sync Rules" format (bucket definitions with `token_parameters`) is deprecated and can't expand an array column such as `home_ids`, which is why this uses Sync Streams (PowerSync Service 1.24+; we pin 1.26.1).

```yaml
config:
  edition: 3

streams:
  agencies:
    auto_subscribe: true
    query: >-
      SELECT id, name, slug, charting_preset, settings, subscription_tier, created_at, updated_at FROM agencies
      WHERE id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true)
  homes:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, name, address, lat, lng, radius, created_at, updated_at FROM homes
      WHERE agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true)
  goal_templates:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, area, text, steps, is_default, created_at, updated_at FROM goal_templates
      WHERE agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true) AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'goals')
  profiles:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, auth_uid, email, phone, name, initials, role, home_ids, med_certified, avatar_url, active, created_at, updated_at FROM profiles
      WHERE agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true)
  clients:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, name, first_name, initials, info, behaviors, active, created_at, updated_at FROM clients
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin')))
  client_health_info:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, allergies, conditions, diet, doctor, guardian, dob, created_at, updated_at FROM client_health_info
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'charting')
  goals:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, area, text, steps, frequency, target, started_at, stopped_at, created_at, updated_at FROM goals
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'goals')
  medications:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, name, dose, route, scheduled_times, prn_instructions, notes, controlled, controlled_schedule, units_per_dose, started_at, stopped_at, created_at, updated_at FROM medications
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'mar')
  schedule_slots:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, day, shift, assigned_to, status, via_lomi, created_at, updated_at FROM schedule_slots
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true
  messages:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, from_name, body, sent_at, created_by, created_at, updated_at FROM messages
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true
  message_reads:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, message_id, profile_id, reader_name, read_at, created_at, updated_at FROM message_reads
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true
  notes:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, author_id, author_name, day, shift, type, content, status, supervisor_comment, lomi_drafted, created_by, created_at, updated_at FROM notes
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'charting')
  note_goals:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, note_id, goal_id, home_id, trials, not_attempted, reason, created_at, updated_at FROM note_goals
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'charting')
  incidents:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, author_id, author_name, type, severity, occurred_at, location, description, antecedent, injured, injury_detail, staff_action, medical_followup, witnesses, notified_parties, report_details, status, followup_notes, created_by, created_at, updated_at FROM incidents
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'incidents')
  mar_records:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, medication_id, day, scheduled_time, status, recorded_at, recorded_by, recorded_by_name, reason, effect, is_prn, acknowledged, amends_id, conflict_with, created_by, created_at, updated_at FROM mar_records
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'mar')
  controlled_counts:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, client_id, medication_id, kind, quantity, expected, discrepancy, reason, recorded_by, recorded_by_name, witness_id, witness_name, witness_status, witnessed_at, recorded_at, created_at, updated_at FROM controlled_counts
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'mar')
  health_entries:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, kind, data, recorded_at, recorded_by, flags, acknowledged, created_by, created_at, updated_at FROM health_entries
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'health')
  attendance:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, client_id, home_id, day, services, recorded_at, recorded_by, recorded_by_name, created_by, created_at, updated_at FROM attendance
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true AND agency_id IN (SELECT p.agency_id FROM profiles p, json_each(p.plan_features) AS f WHERE p.auth_uid = auth.user_id() AND p.active = true AND f.value = 'charting')
  coverage_requests:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, home_id, day, shift, called_out_by, reason, status, filled_by, created_by, created_at, updated_at FROM coverage_requests
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true
  coverage_steps:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, coverage_request_id, home_id, description, occurred_at, created_at, updated_at FROM coverage_steps
      WHERE (home_id IN (SELECT h.value FROM profiles p, json_each(p.home_ids) AS h WHERE p.auth_uid = auth.user_id() AND p.active = true) OR agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin'))) AND device_sync = true
  clock_records:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, profile_id, home_id, clock_in_at, clock_out_at, verified, manual_override, distance_meters, acknowledged, created_at, updated_at FROM clock_records
      WHERE profile_id IN (SELECT id FROM profiles WHERE auth_uid = auth.user_id() AND active = true) AND device_sync = true
  notifications:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, profile_id, type, title, body, channel, status, sent_at, read_at, reference_id, reference_type, created_at, updated_at FROM notifications
      WHERE profile_id IN (SELECT id FROM profiles WHERE auth_uid = auth.user_id() AND active = true) AND device_sync = true
  notification_preferences:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, profile_id, notification_type, push_enabled, sms_enabled, email_enabled, created_at, updated_at FROM notification_preferences
      WHERE profile_id IN (SELECT id FROM profiles WHERE auth_uid = auth.user_id() AND active = true)
  user_settings:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, profile_id, theme, quiet_hours_start, quiet_hours_end, disclosure, created_at, updated_at FROM user_settings
      WHERE profile_id IN (SELECT id FROM profiles WHERE auth_uid = auth.user_id() AND active = true)
  clock_records_admin_clock_data:
    auto_subscribe: true
    query: >-
      SELECT id, agency_id, profile_id, home_id, clock_in_at, clock_out_at, verified, manual_override, distance_meters, acknowledged, created_at, updated_at FROM clock_records
      WHERE agency_id IN (SELECT agency_id FROM profiles WHERE auth_uid = auth.user_id() AND active = true AND (role = 'supervisor' OR role = 'admin')) AND device_sync = true
```

### Tables Never Synced to Client

These tables exist only on the server. They are never included in sync rules and never appear in the client wa-sqlite database.

| Table | Reason |
|-------|--------|
| `audit_log` | Server-only append-only log. Too large and sensitive for client sync. Accessible via read-only tRPC procedure for admins. |
| `sync_checkpoints` | Server-side sync metadata managed by the Sync Service. |
| `events` | Server-side domain events for analytics and side effects. Supervisor views read them through tRPC when online. |
| `referrals` | Client Intake pillar -- used only by supervisors/admins via online admin views. Low frequency, not needed offline. |
| `rooms` | Room inventory is admin-only, used for intake pipeline. Not needed during caregiving shifts. |
| `medication_history` | Medication change audit trail. Available via online medication detail view. |
| `coverage_candidates` | Coverage candidacy and SMS reply tracking is server-side (Lomi coverage engine). Caregivers interact via SMS, not the synced DB. |
| `case_notes` | Supervisor/admin-only clinical narratives. Accessed via online client detail view. |
| `note_history` | Note audit trail (status transitions). Available inline on the note detail view when online. |

---

## 5. Conflict Resolution

### Strategy

**Server-authoritative, last-write-wins using server timestamps.** When a client syncs a write that conflicts with the current server state, the server state wins. The client's local database is updated to reflect the server's authoritative state on the next sync cycle.

PowerSync applies this model automatically. The write queue replays mutations through `sync.upload`, which runs the owning service and then Postgres (RLS and constraints). If a write succeeds, it becomes the new authoritative state. If it fails (constraint violation, RLS rejection), it is discarded from the queue.

### Per-Operation Conflict Scenarios

| Operation | Conflict Scenario | Resolution Strategy | User Experience |
|-----------|------------------|---------------------|-----------------|
| **Create note** | Two caregivers create notes for the same client on the same day while both offline | Both accepted -- different `note.id` UUIDs, different records. No conflict. | Both notes appear. Supervisor reviews both. This is normal (AM/PM shifts). |
| **Update note (draft)** | Caregiver edits a draft note offline. Another device (or same user on another tab) also edits. | Last write wins at server. The second write to reach the server overwrites the first. | User sees their local edits until sync completes. After sync, the note content reflects the server state. If the user's edits were overwritten, a toast shows "Note updated from another device." |
| **Sign note (draft -> submitted)** | Caregiver signs a note offline. Meanwhile, a supervisor returns the note from another device (changing status to `returned`). | Server state wins. The supervisor's `returned` status is authoritative. A queued sign of a `returned` note is always rejected (`RULE_VIOLATION`), because the queue can't tell whether the caregiver saw the comment; signing a returned note online is allowed. | Caregiver sees "Note was returned by supervisor" on sync. They must review the supervisor comment and re-submit. |
| **Approve note** | Supervisor approves a note while the caregiver is editing the same note offline. | Server state wins. The note is `approved`. The caregiver's offline edits are rejected because the note is no longer in `draft` or `returned` status. | Caregiver sees "Note already approved" on sync. Their local edits are lost. The approved version is authoritative. |
| **Record MAR (scheduled)** | Two med-certified caregivers record the same dose slot (same client, medication, day and `scheduled_time`) while both offline. | **Neither record is discarded.** Two records for one slot may mean the person was given the dose twice, which is a safety event. `sync.upload` catches the unique-index violation and saves the second record with `conflict_with` pointing at the first (the index excludes conflict records). It then sends a mandatory `med_possible_double_dose` alert to the home's supervisors. | Second caregiver sees "[Name] also recorded this dose. Your supervisor has been alerted." The supervisor reviews both records and, if a second dose was actually given, files a medication-error incident. |
| **Record MAR (PRN)** | Two caregivers record PRN doses for the same medication while offline. | Both accepted -- PRN doses are not subject to the unique constraint. Each PRN record has a unique ID. | Both PRN entries appear in the MAR. This is valid -- PRN medications can be given multiple times. |
| **Create incident** | Two caregivers report the same incident while offline. | Both accepted -- different `incident.id` UUIDs. | Both incident reports appear. Supervisor reviews and may close one as duplicate with a follow-up note. |
| **Clock in** | Caregiver clocks in offline. GPS coordinates captured locally. | Write accepted on sync. Server recalculates `distance_meters` and sets `verified` based on home geofence. | If GPS was spoofed or inaccurate offline, the server may set `verified = false` and `distance_meters` to the actual calculated distance. Supervisor is notified of out-of-geofence clock-in. |
| **Clock out** | Caregiver clocks out offline. Meanwhile, supervisor manually overrides the clock record. | Server state wins. The supervisor's manual override is authoritative. The caregiver's clock-out may be applied to the overridden record or rejected. | Caregiver sees the corrected times on sync. `manual_override = true` and `acknowledged = false` -- caregiver must acknowledge. |
| **Send message** | Caregiver sends a home message offline. | Write accepted on sync. Messages are append-only -- no conflict possible (each message has a unique ID). | Message appears in the home board after sync. Timestamp reflects `sent_at` captured locally. Messages may appear out of chronological order if multiple users are offline. |
| **Record health entry** | Two caregivers record vitals for the same client at the same time while both offline. | Both accepted -- different `health_entry.id` UUIDs, no conflict. Duplicate vital entries for the same time may indicate re-measurement and are reviewed by supervisor. | Both entries appear in the health log. Supervisor reviews and may flag duplicate readings for the same time window. |
| **Read receipt** | The same person reads a message on two devices while offline. | The unique index on `(message_id, profile_id)` keeps the first receipt; the second upload is a no-op, not a rejection. | Nothing to show: the message reads "Seen by" the person once. |
| **Update attendance** | Two caregivers record attendance for the same client on the same day. | The unique index on `(client_id, day)` keeps one row. `sync.upload` merges the two service lists (union) rather than overwriting, and both caregivers are recorded in the audit log. Attendance is a billing document, so it is never silently replaced. | UI shows "Attendance already recorded by [name]" before editing an existing record. |

### Conflict Notification Flow

```
Local write queued
        │
        v
PowerSync replays write through sync.upload
        │
        ├── Success: local DB updated to match server state
        │
        └── Failure:
            ├── Duplicate MAR dose slot:
            │     -> Kept as a conflict record (conflict_with set)
            │     -> Supervisor alerted (med_possible_double_dose)
            │     -> Toast: "[Name] also recorded this dose. Your supervisor has been alerted."
            │
            ├── Other constraint violation:
            │     -> Remove from local DB, keep details in _failed_writes
            │     -> Show toast with the reason
            │
            ├── RLS violation (e.g., user deactivated):
            │     -> Remove from local DB
            │     -> Force re-auth
            │
            └── Network error:
                  -> Keep in queue
                  -> Retry with backoff (see section 6)
```

---

## 6. Write Queue Management

### FIFO Ordering

The PowerSync write queue processes mutations in strict FIFO (first-in, first-out) order. This guarantees that dependent writes are applied in the correct sequence:

| Sequence | Write | Depends On |
|----------|-------|------------|
| 1 | `INSERT notes` (create the note) | Nothing |
| 2 | `INSERT note_goals` (attach goal trials) | Note must exist (FK on `note_id`) |
| 3 | `UPDATE notes` (set status to `submitted`) | Note must exist |

If the note creation fails, dependent note_goals writes are also rejected. The queue does not skip ahead to independent writes -- strict ordering prevents orphaned child records.

### Dependent Write Ordering Rules

| Parent Write | Child Write | Ordering Rule |
|-------------|-------------|---------------|
| Create `notes` | Create `note_goals` | `note_goals.note_id` references `notes.id` -- note must sync first |
| Create `clients` | Create `client_health_info` | `client_health_info.client_id` references `clients.id` |
| Create `coverage_requests` | Create `coverage_steps` | `coverage_steps.coverage_request_id` references `coverage_requests.id` |
| Create `clock_records` (clock in) | Update `clock_records` (clock out) | Same record -- clock-in must exist before clock-out update |

The client code must create parent records before child records. The PowerSync SDK preserves insertion order in the queue.

### Retry with Exponential Backoff

| Attempt | Delay | Max Attempts | Action on Final Failure |
|---------|-------|-------------|-------------------------|
| 1 | 0s (immediate) | -- | -- |
| 2 | 5s | -- | -- |
| 3 | 15s | -- | -- |
| 4 | 45s | -- | -- |
| 5 | 120s | 5 | Mark as permanently failed |

Non-retryable errors (constraint violations, RLS rejections, 4xx HTTP status) are immediately marked as permanently failed and removed from the queue. Only transient errors (network timeout, 5xx HTTP status) trigger retry.

### Permanently Failed Writes

When a write permanently fails:

1. The mutation is removed from the active queue to prevent blocking subsequent writes.
2. The failed mutation metadata (table, operation, error reason) is stored in the local-only `failed_writes` table (`src/lib/sync/app-schema.ts`). Notices such as `MAR_CONFLICT` go to the local-only `sync_notices` table.
3. The UI shows a persistent banner: "1 change could not be saved. Tap to review."
4. The user can view the failed write details and either discard or retry manually.
5. Failed writes are logged with enough context to diagnose the issue without exposing PHI in the error message.

### Queue Size Monitoring

| Queue Depth | Status | Action |
|-------------|--------|--------|
| 0 | Synced | Green indicator |
| 1-50 | Normal | Yellow indicator, syncing |
| 51-100 | Elevated | Yellow indicator, "Syncing [n] changes" |
| 101+ | Warning | Orange banner: "You have [n] unsynced changes. Connect to sync." |
| 500+ | Critical | Red banner: "Too many unsynced changes. Please connect to Wi-Fi and keep the app open." |

The queue depth is checked on every write and on a 30-second interval. At 100+ pending writes, the UI warns the user proactively. At the typical write rate (a caregiver doing charting produces approximately 20-40 writes per 8-hour shift), a queue of 100+ indicates the device has been offline for multiple shifts.

---

## 7. Data Lifecycle on Device

### Sync Windows

| Data Category | Sync Window | Rationale |
|---------------|-------------|-----------|
| **Reference data** (agencies, homes, profiles, goal_templates, clients, client_health_info, goals, medications) | No expiry -- synced in full | Low volume, rarely changes, needed for all charting operations |
| **Clinical records** (notes, note_goals, incidents, mar_records, health_entries, attendance, clock_records) | 30 days rolling | Balances offline access to recent history with device storage limits. Caregivers rarely need records older than current month. |
| **Transient data** (notifications, coverage_requests, coverage_steps) | 7 days rolling | High volume, time-sensitive data that loses relevance quickly. Coverage requests older than 7 days are historical. |
| **Schedule data** (schedule_slots) | 90 days rolling (past 30 + future 60) | Volume grows linearly with time if unbounded. A 90-day window covers recent history and near-future scheduling needs. Historical schedule data is available via online views. |
| **Messages** | 90 days rolling | Low volume per home, but syncing in full with no expiry while purging locally at 30 days creates repeated download-purge cycles. A 90-day server-side window eliminates this churn. |

**How windows are applied:** sync rules can't evaluate "now", so each windowed table has a `device_sync` boolean (default `true`). `SyncWindowJob` (Cloud Scheduler, nightly at 03:00 agency time, idempotent) sets `device_sync = false` on rows older than the table's window. Example: notes older than 30 days, or schedule slots more than 30 days in the past. PowerSync then removes them from devices. Rows are never deleted on the server.

### Local Database Size Management

| Metric | Threshold | Action |
|--------|-----------|--------|
| Target size | 50 MB | Normal operation |
| Warning threshold | 40 MB | Log warning, run purge of records outside sync window |
| Hard limit | 60 MB | Force purge: reduce clinical window to 14 days, reduce transient window to 3 days |
| Emergency | 80 MB | Force purge: reduce clinical window to 7 days. Alert user: "Storage full -- some history may be unavailable offline." |

**Purge order (least to most critical):**
1. Coverage steps older than 3 days
2. Coverage requests older than 3 days
3. Notifications older than 3 days
4. Messages older than 30 days
5. Notes older than 14 days (and their linked note_goals)
6. Health entries older than 14 days
7. MAR records older than 14 days
8. Incidents older than 14 days
9. Attendance older than 14 days

Purging removes data from the local wa-sqlite database only. Server data is unaffected. Purged data returns on the next full sync if within the sync window.

### Logout and Session Events

| Event | Data Action |
|-------|------------|
| **Explicit logout** | **Never deletes unsynced work.** If the upload queue is empty, delete the OPFS database, purge the service worker cache, reset stores and revoke the session. If changes are still pending, logout first tries to sync. If the device is offline, the user sees "You have [n] changes that haven't synced yet. Stay signed in until you're back online." Logout then just locks the app (in-memory key dropped, PIN needed to reopen), and the database is deleted only after the queue drains on a later sign-in. |
| **Session timeout** (12 hours inactivity, configurable per agency) | Drop the in-memory database key and redirect to login. The OPFS database stays on the device (encrypted, unreadable without the PIN-wrapped key). On re-auth, unwrap the key, flush the write queue, then resume sync. |
| **Account deactivation** (`profiles.active = false`) | Server revokes the session and deletes the server copy of the device's database key. On the next connection, writes still in the queue are uploaded with the deactivated user's identity and flagged for supervisor review (they are clinical records made while the person was working) before local data is cleared. |
| **App backgrounded** (mobile PWA, 5+ minutes) | PIN/biometric required to resume. After 5 wrong PINs the wrapped key is deleted. Local data stays encrypted until an online sign-in re-fetches the key; it is not deleted while the queue is non-empty. |
| **Browser tab closed** | The Identity Platform session cookie (HttpOnly) survives. On re-open the client calls `/auth/sync-token` and gets a fresh short-lived ID token (kept in memory only). If the session cookie has expired, the user signs in again; unsynced local data is kept. |
| **Role change** (e.g., caregiver promoted to supervisor) | Server updates `profiles.role`. The sync streams read the role live, so wider-scope data starts syncing within seconds; no token refresh is needed. |
| **Home assignment change** (caregiver moved to different home) | Server updates `profiles.home_ids`. Within seconds the streams drop the old home's rows from the device and start syncing the new home. |

---

## 8. Service Worker Architecture

The service worker (`src/service-worker.ts`) handles application shell caching and push notifications. It explicitly does **not** handle data sync -- that is PowerSync's domain.

### Responsibility Tree

```
Service Worker
├── App Shell Caching (cache-first strategy)
│   ├── HTML (SvelteKit-generated pages)
│   ├── CSS (compiled Svelte styles)
│   ├── JavaScript (SvelteKit client bundles)
│   ├── Static assets (icons, fonts, manifest.json)
│   └── Offline fallback page (for non-cached routes)
│
├── Navigation Fallback
│   └── All navigation requests -> cached app shell
│       (SvelteKit client-side routing handles the rest)
│
├── FCM Push Notification Handling
│   ├── Receive push payload
│   ├── Display system notification (title, body, icon)
│   └── Handle notification click -> open app to relevant route
│
└── Background Sync Trigger
    └── On connectivity restored, signal PowerSync to flush write queue
```

### What the Service Worker Does NOT Do

- **Does NOT cache API responses.** PowerSync handles all data replication. Caching tRPC responses in the service worker would create stale data and conflict with PowerSync's consistency model.
- **Does NOT intercept PowerSync WebSocket traffic.** The PowerSync WebSocket connection is pass-through.
- **Does NOT manage authentication.** The session cookie is HttpOnly and set by the server; the ID token is held in memory (security.md).
- **Does NOT store PHI.** The service worker cache contains only static assets (HTML, CSS, JS, images). No API responses, no client data, no note content.

### Cache Strategy Details

| Resource Type | Strategy | Cache Name | Max Age | Max Entries |
|---------------|----------|------------|---------|-------------|
| App shell (HTML) | Cache-first, network fallback | `app-shell-v1` | Until new SW version | 1 (index.html) |
| JS bundles | Cache-first, network fallback | `js-v1` | Until new SW version | 50 |
| CSS | Cache-first, network fallback | `css-v1` | Until new SW version | 20 |
| Static assets (icons, fonts) | Cache-first, network fallback | `static-v1` | 30 days | 100 |
| Google Fonts (if used) | Cache-first, network fallback | `fonts-v1` | 365 days | 30 |
| Images (avatars) | Network-first, cache fallback | `images-v1` | 7 days | 50 |

### Service Worker Update Flow

```
New SW version deployed (new Cloud Run revision)
        │
        v
Browser detects new SW on next navigation
        │
        v
New SW installs in background (precaches new app shell)
        │
        v
Old SW continues serving until all tabs close
        │
        v
New SW activates, old caches purged
        │
        v
User sees "App updated" toast on next visit
```

The service worker version is tied to the SvelteKit build hash. Every deployment produces a new service worker, which triggers the update flow.

---

## 9. Sync Status UI

### Status Indicators

**Canonical definition: `frontend-spec-2.md` §8.1.** Other specs reference it rather than redefining it. Summary:

| State | Visual | Tooltip on tap |
|-------|--------|----------------|
| Synced | No indicator | -- |
| Pending or syncing | 6px amber dot (`var(--lemon)`), slow pulse while syncing | "[n] changes waiting to sync. Last synced [time]." |
| Offline | Small "Offline" pill (`var(--lemon-2)` bg) | "You're offline. Your work is saved and will sync when you reconnect." |
| Retryable sync error | Amber dot (same as pending) | "Some changes couldn't sync. They'll retry automatically." |

Connectivity is never shown in red: being offline is normal, not an error. Red is reserved for writes that **permanently** failed and need the user's attention (banner below).

### Banner Messages

Banners appear below the app header when the user needs to take action or be aware of a sync condition. They are dismissible except for the red error banner.

| Condition | Banner Color | Message | Dismissible |
|-----------|-------------|---------|-------------|
| Pending writes (1-50) | None (dot only) | -- | -- |
| Pending writes (51-100) | Yellow | "Syncing [n] changes..." | Yes |
| Pending writes (101+) | Orange | "You have [n] unsynced changes. Connect to sync." | No |
| Failed writes | Red | "[n] change(s) could not be saved. Tap to review." | No |
| Reconnected after offline period | Neutral (toast) | "Back online -- syncing..." | Auto-dismiss after 3s |
| Sync complete after reconnect | Green (toast) | "All changes synced" | Auto-dismiss after 3s |

### Implementation

```typescript
// src/lib/stores/sync-status.svelte.ts (pseudocode)
import { powerSync } from '#lib/sync';

// Reactive sync status using Svelte 5 runes
let syncStatus = $state<'connected' | 'syncing' | 'offline'>('offline');
let pendingWrites = $state(0);
let failedWrites = $state(0);

$effect(() => {
  const unsubStatus = powerSync.registerListener({
    statusChanged: (status) => {
      if (status.connected && !status.dataFlowing) {
        syncStatus = 'connected';
      } else if (status.dataFlowing) {
        syncStatus = 'syncing';
      } else {
        syncStatus = 'offline';
      }
    }
  });

  const unsubQueue = powerSync.registerListener({
    uploadQueueChanged: (queue) => {
      pendingWrites = queue.count;
    }
  });

  return () => {
    unsubStatus();
    unsubQueue();
  };
});

// Matches frontend-spec-2.md §8.1. Permanently failed writes are shown by the
// red banner, not the indicator.
export function getSyncIndicator(): 'none' | 'amber' | 'offline' {
  if (syncStatus === 'offline') return 'offline';
  if (syncStatus === 'syncing' || pendingWrites > 0) return 'amber';
  return 'none';
}
```

---

## 10. Performance Targets

### Sync Performance

| Metric | Target | Measurement | Notes |
|--------|--------|-------------|-------|
| **Initial sync** (first login) | < 10 seconds | Time from PowerSync `connect()` to `hasSynced = true` | Assumes typical agency: ~50 clients, ~500 notes in 30-day window, ~10 homes |
| **Incremental sync** (reconnect) | < 5 seconds | Time from connectivity restored to queue flushed | Assumes typical offline period: 1 shift (~40 writes) |
| **Local read** (single record) | < 10 ms | `performance.mark()` around wa-sqlite query | Covers `SELECT * FROM notes WHERE id = ?` and similar |
| **Local read** (list query) | < 50 ms | `performance.mark()` around wa-sqlite query | Covers `SELECT * FROM notes WHERE home_id = ? AND day = ?` returning ~20 rows |
| **Local write** (single mutation) | < 20 ms | `performance.mark()` around wa-sqlite INSERT/UPDATE | Covers note creation, MAR recording, clock-in |
| **Daily bandwidth** | < 500 KB | Network tab monitoring over 8-hour shift | Delta sync only -- full rows are not re-transferred |
| **Background sync interval** | 60 seconds | PowerSync heartbeat configuration | Balance between freshness and battery/bandwidth |

### Initial Sync Breakdown (Estimated)

For a typical agency with 50 clients across 5 homes, a caregiver assigned to 2 homes:

| Bucket | Estimated Rows | Estimated Size | Estimated Time |
|--------|---------------|---------------|----------------|
| `global` (agencies, homes, profiles, goal_templates) | ~100 | ~50 KB | < 1s |
| `home_data` (2 homes x ~20 clients, notes, MAR, etc.) | ~2,000 | ~500 KB | ~3s |
| `user_data` (clock_records, notifications) | ~100 | ~20 KB | < 1s |
| **Total** | **~2,200 rows** | **~570 KB** | **< 5s** |

A supervisor syncing all 5 homes would see approximately 5,000 rows / 1.5 MB / < 8s (includes `admin_clock_data` bucket with all agency clock records).

### Degradation Thresholds

| Condition | Performance Impact | Mitigation |
|-----------|-------------------|------------|
| Agency with 200+ clients | Initial sync may exceed 10s target | Reduce sync window to 14 days for large agencies |
| Write queue > 200 mutations | Sync on reconnect may exceed 5s | Batch uploads (PowerSync handles this internally) |
| Device with < 1 GB free storage | OPFS allocation may fail | Check storage quota on startup; warn user if low |
| Slow 3G connection | Initial sync may take 30s+ | Show progress bar during initial sync; app is usable after partial sync |

---

## 11. Testing Offline Behavior

### Manual Testing with Chrome DevTools

1. Open Chrome DevTools > Network tab
2. Select "Offline" from the throttling dropdown
3. Perform charting operations (create note, record MAR, clock in)
4. Verify: no spinners, no errors, data appears in local views
5. Return to "No throttling"
6. Verify: pending writes sync, sync indicator turns green
7. Verify: server database reflects all offline writes

### Automated Testing with Playwright

```typescript
// tests/e2e/offline-sync.spec.ts (pseudocode)

test('caregiver can create note while offline and sync on reconnect', async ({ page, context }) => {
  // Login and wait for initial sync
  await loginAsCaregiver(page);
  await waitForSync(page);

  // Go offline
  await context.setOffline(true);

  // Create a note
  await page.goto('/notes/new');
  await fillNoteForm(page, { client: 'Test Client', content: 'Offline note' });
  await page.click('[data-testid="sign-note"]');

  // Verify local persistence
  await expect(page.locator('[data-testid="sync-indicator"]')).toHaveAttribute('data-status', 'offline');
  await expect(page.locator('[data-testid="note-list"]')).toContainText('Offline note');

  // Reconnect
  await context.setOffline(false);

  // Verify sync
  await expect(page.locator('[data-testid="sync-indicator"]')).toHaveAttribute('data-status', 'connected', { timeout: 10000 });

  // Verify server has the note
  const note = await getServerNote(page, 'Offline note');
  expect(note).toBeTruthy();
  expect(note.status).toBe('submitted');
});

test('duplicate MAR dose is kept as a conflict and the supervisor is alerted', async ({ page, context }) => {
  await loginAsCaregiver(page);
  await waitForSync(page);

  // Record MAR while online (this one succeeds)
  await recordMAR(page, { client: 'Test Client', medication: 'Med A', status: 'given' });

  // Go offline on a second device (simulated by clearing local MAR and going offline)
  await context.setOffline(true);

  // Record the same MAR again
  await recordMAR(page, { client: 'Test Client', medication: 'Med A', status: 'given' });

  // Verify local success
  await expect(page.locator('[data-testid="mar-status"]')).toContainText('given');

  // Reconnect
  await context.setOffline(false);

  // Verify the second record is kept as a conflict, not discarded
  await expect(page.locator('[data-testid="sync-toast"]'))
    .toContainText('also recorded this dose', { timeout: 10000 });
  expect(await countServerMarConflicts(page, { medication: 'Med A' })).toBe(1);
});
```

### Offline Test Checklist

Every feature that touches synced data must pass this checklist before shipping:

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | **Create while offline** | Go offline. Create the record. Verify it appears in local views. | Record is visible locally. Sync indicator shows yellow/red. |
| 2 | **Edit while offline** | Go offline. Edit an existing record. Verify the edit is reflected locally. | Edit is visible locally. Queue shows 1 pending write. |
| 3 | **Reconnect and sync** | After creating/editing offline, go online. Wait for sync. | Sync indicator turns green. Record appears on server. |
| 4 | **Conflict: server wins** | Create a record offline. Have the server modify the same record. Go online. | Server version prevails. Local version is overwritten. User sees toast notification. |
| 5 | **Constraint violation** | Create a duplicate record offline (e.g., same MAR). Go online. | Duplicate is rejected. User sees error toast. Local duplicate is removed. |
| 6 | **RLS rejection** | Deactivate the user's account on the server while they are offline. User creates records offline. Go online. | All writes are rejected. User is redirected to login. Local data is cleared. |
| 7 | **Logout never loses work** | Create records offline. Tap logout without reconnecting. | Logout is held: user sees the unsynced-changes message, app locks instead of wiping. After reconnecting and signing in, the queue drains, then the database can be deleted. |
| 8 | **Session timeout** | Create records offline. Wait for session timeout (configurable, default 12 hours). | OPFS database preserved (encrypted). On re-auth the PIN-wrapped key is unwrapped and the write queue flushes. |
| 9 | **Large queue** | Create 100+ records offline. Go online. | All records sync in correct order. Progress is visible in UI. No writes are lost. |
| 10 | **Multi-tab behavior** | Open the app in two tabs. Create a record in tab A. Verify tab B sees it. | OPFS exclusive lock means only one tab can have write access. Second tab shows "App is open in another tab" message. |
| 11 | **PWA installed + offline** | Install PWA via "Add to Home Screen." Go offline. Open PWA. | App shell loads from service worker cache. PowerSync provides local data. Full offline functionality. |
| 12 | **Dependent writes** | Create a note with goal trials offline (note + note_goals). Go online. | Note syncs first, then note_goals. FK constraint is satisfied. Both records appear on server. |

### CI Integration

Offline tests run in the Playwright CI pipeline using `context.setOffline(true)` and `page.route('**/*', route => route.abort())` for more granular network control. The test suite includes a dedicated "offline" test tag:

```bash
npm run test:e2e -- --grep @offline
```

---

## Appendix A: Sync Rule Summary Table

| Table | Bucket | Sync Window | Caregiver Scope | Supervisor/Admin Scope | Writable Offline |
|-------|--------|-------------|-----------------|----------------------|------------------|
| `agencies` | global | Full | Own agency | Own agency | No |
| `homes` | global | Full | Own agency | Own agency | No |
| `goal_templates` | global | Full | Own agency | Own agency | No |
| `profiles` | global | Full | Own agency | Own agency | No |
| `clients` | home_data | Full | Assigned homes | All homes | No |
| `client_health_info` | home_data | Full | Assigned homes | All homes | No |
| `goals` | home_data | Full | Assigned homes | All homes | No |
| `medications` | home_data | Full | Assigned homes | All homes | No |
| `schedule_slots` | home_data | 90 days (past 30 + future 60) | Assigned homes | All homes | No |
| `messages` | home_data | 90 days | Assigned homes | All homes | Yes |
| `message_reads` | home_data | 90 days | Assigned homes | All homes | Yes (own receipts only) |
| `notes` | home_data | 30 days | Assigned homes | All homes | Yes |
| `note_goals` | home_data | 30 days (via note) | Assigned homes | All homes | Yes |
| `incidents` | home_data | 30 days | Assigned homes | All homes | Yes |
| `mar_records` | home_data | 30 days | Assigned homes | All homes | Yes |
| `controlled_counts` | home_data | 30 days | Assigned homes | All homes | Yes (new entries; the witness countersigns online) |
| `health_entries` | home_data | 30 days | Assigned homes | All homes | Yes |
| `attendance` | home_data | 30 days | Assigned homes | All homes | Yes |
| `coverage_requests` | home_data | 7 days | Assigned homes | All homes | No |
| `coverage_steps` | home_data | 7 days (via request) | Assigned homes | All homes | No |
| `clock_records` | user_data + admin_clock_data | 30 days | Own records (user_data) | Own records (user_data) + all agency records (admin_clock_data) | Yes |
| `notifications` | user_data | 7 days | Own records | Own records | No |
| `notification_preferences` | user_data | Full | Own record | Own record | No |
| `user_settings` | user_data | Full | Own record | Own record | Yes |
| `audit_log` | -- | Never synced | -- | -- | -- |
| `sync_checkpoints` | -- | Never synced | -- | -- | -- |
| `events` | -- | Never synced | -- | -- | -- |
| `referrals` | -- | Never synced | -- | -- | -- |
| `rooms` | -- | Never synced | -- | -- | -- |
| `medication_history` | -- | Never synced | -- | -- | -- |
| `coverage_candidates` | -- | Never synced | -- | -- | -- |
| `case_notes` | -- | Never synced | -- | -- | -- |
| `note_history` | -- | Never synced | -- | -- | -- |

## Appendix B: Error Codes for Failed Writes

| Error Code | Meaning | User Message | Recovery |
|------------|---------|-------------|----------|
| `CONSTRAINT_VIOLATION` | Unique constraint failed (other than a duplicate MAR dose slot, which is kept as a conflict record) | "This record was already saved by another user." | Discard local duplicate; details kept in `_failed_writes` |
| `MAR_CONFLICT` | Same dose slot recorded on two devices | "[Name] also recorded this dose. Your supervisor has been alerted." | Record kept with `conflict_with`; supervisor reviews |
| `RLS_DENIED` | Row-Level Security policy rejected the write | "You don't have permission to save this change." | Discard; may indicate role/home change |
| `FK_VIOLATION` | Foreign key reference missing (e.g., note references deleted client) | "The referenced record no longer exists." | Discard; data was deleted server-side |
| `SESSION_EXPIRED` | Auth token expired and refresh failed | "Your session has expired. Please log in again." | Re-authenticate; writes preserved if re-auth succeeds within grace period |
| `VALIDATION_FAILED` | Missing or invalid data (wrong dose slot, refusal without a reason, malformed fields) | The service's message, e.g. "Say why the dose was refused or held" | Discard; details kept in `failed_writes` |
| `RULE_VIOLATION` | A business rule refused it (note already signed or approved; note sent back while the device was offline) | The service's message | Discard; for a sent-back note, read the comment and sign again |
| `NOT_FOUND` | The record or the person it refers to isn't in the caller's homes | "That person is not in your homes" | Discard |
| `FEATURE_NOT_INCLUDED` | The agency's plan doesn't include that table's feature (entitlements.md §6, e.g. a `notes` op on Starter) | "This feature is not included in your agency's plan." | Discard |
| `NOT_ALLOWED_OFFLINE` | That table or operation can't be written from a device (e.g. approving notes, editing MAR records) | "This change has to be made while online." | Discard |
| `SERVER_ERROR` | 5xx from the server | "Server error. Will retry automatically." | Retry with exponential backoff |
| `NETWORK_ERROR` | Request failed to reach server | "No connection. Will retry when online." | Retry when connectivity restored |
