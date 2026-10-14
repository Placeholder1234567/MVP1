# Security & HIPAA Compliance

Guad operates as a Business Associate under HIPAA. This document defines the security architecture for the platform, covering threat modeling, authentication, authorization, PHI handling, encryption, audit, breach response, vendor relationships, and offline security.

---

## Threat Model

| # | Threat | Likelihood | Impact | Mitigation |
|---|--------|-----------|--------|------------|
| T1 | **Insider access to PHI** — A staff member views client records outside their assigned homes, or a terminated employee retains access. | High | High | Postgres RLS enforces home-scoped access for caregivers. On termination, `profiles.active` is set to `false`, the Identity Platform account is disabled and its refresh tokens are revoked, which is the primary deactivation mechanism. `current_user_home_ids()` in rls.sql also requires `active = true`, so a deactivated user's token stops returning clinical rows even before it expires. Users cannot widen their own access: a trigger blocks non-admins from changing `home_ids`, `role` or `med_certified` on their own profile. Audit log captures every PHI read. |
| T2 | **Device theft or loss** — A caregiver's phone is stolen while logged in, exposing offline-cached PHI in PowerSync OPFS. | High | High | Session timeout after 12 hours of inactivity (configurable per agency, minimum 15 minutes for high-security). PowerSync OPFS is encrypted at rest with a random per-device key; only a PIN-wrapped copy is stored on the device (offline-sync.md, "Local database encryption key"). PIN/biometric lock is required to open the app or resume a backgrounded session; after 5 wrong PINs the wrapped key is deleted. Deactivating the device on the server deletes the server copy of the key. Local data is deleted on logout only once all changes have synced. |
| T3 | **Session hijacking** — An attacker steals a JWT or refresh token via XSS, MITM, or physical access to a shared device. | Medium | Critical | The session is an Identity Platform session cookie (HttpOnly, Secure, SameSite=Lax) verified with revocation checking on every tRPC request. The browser holds only a short-lived (1 hour) ID token in memory, because PowerSync needs it (Firebase Auth SDK with `inMemoryPersistence`). No token is ever written to `localStorage`, `sessionStorage` or IndexedDB. TLS 1.3 enforced on all connections. Content Security Policy headers block inline scripts and mitigate XSS. Revocation takes effect on the next tRPC request; sync stops at once because sync rules only return rows for active profiles. |
| T4 | **API abuse** — An attacker or rogue integration hammers the tRPC or OpenAPI endpoints to exfiltrate data, brute-force auth, or cause denial of service. | Medium | High | Rate limiting on all endpoints: 100 req/min per user for tRPC, 30 req/min per API key for OpenAPI (60/hour for bulk export). Identity Platform throttles repeated failed sign-ins, and reCAPTCHA Enterprise is enabled for email/password sign-in to block automated attempts. OpenAPI keys are scoped to specific endpoints and agency. tRPC procedures validate input with Zod schemas. All OpenAPI responses are paginated (max 100 records per page; max 1,000 for bulk export). Export endpoints log every invocation to audit_log. |
| T5 | **Data exfiltration via exports** — A privileged user (admin/supervisor) exports client data as CSV/PDF and shares it outside the organization. | Medium | High | All export actions are logged in audit_log with the export format, record count, and filter criteria. Exports are watermarked with the requesting user's name and timestamp. Export access is restricted to supervisor and admin roles. Agencies can disable export functionality per role via `agencies.settings`. Large exports (>500 records) require a second confirmation step. |
| T6 | **Stored XSS** — An attacker injects malicious scripts via note content, messages, or incident descriptions that execute when rendered in supervisor views. | Medium | High | All user-generated content is rendered via Svelte's default auto-escaping (no `{@html}`). Content Security Policy headers block inline scripts (`script-src 'self'`). Zod input validation on tRPC procedures sanitizes inputs. Supervisor review screens render note content as text, not HTML. |
| T7 | **CSRF** — An attacker tricks an authenticated user's browser into making state-changing requests to the tRPC API. | Low | High | The Identity Platform session cookie is `SameSite=Lax`. tRPC procedures require the access token in the Authorization header (a cross-site form can't add it), and the server rejects requests whose `Origin` isn't the app's own. No state-changing operations use GET requests. CORS is restricted to the application's own origin. |
| T8 | **Supply chain attack** — A compromised npm dependency exfiltrates PHI or injects malicious code into the production build. | Low | Critical | `npm audit` runs in CI on every build. Dependencies are pinned with `package-lock.json`. Renovate/Dependabot monitors for CVEs. Production builds use `npm ci` (no deviation from lockfile). CSP headers limit exfiltration vectors. PHI is never present in the build output (server-side only). |
| T9 | **Ransomware or malware on caregiver devices** — A caregiver's personal phone is infected, compromising the cached OPFS database or intercepting PHI in memory. | Medium | High | PowerSync OPFS is encrypted (SQLCipher-style AES-256; confirm the encrypted wa-sqlite build before launch). The database key is never stored on disk in plaintext; only a PIN-wrapped copy is. PWA isolation limits malware access to browser sandbox. Minimum OS version requirements (iOS 16.4+, Android 10+) ensure current security patches. PHI in memory is transient and cleared on logout/session expiry. |
| T10 | **IDOR via UUID guessing** — An attacker attempts to access records by guessing or enumerating UUIDs in API requests. | Low | High | UUIDs are v4 (122 bits of entropy, infeasible to guess). All queries are scoped by `agency_id` via RLS at the Postgres level — even a valid UUID from another agency returns no rows. tRPC procedures validate input with Zod UUID schemas. Rate limiting on API endpoints prevents enumeration. |
| T11 | **Social engineering / phishing targeting email sign-in links** — An attacker sends a phishing email mimicking the sign-in link flow to harvest credentials or session tokens. | Medium | Medium | Email sign-in links are generated by Identity Platform and sent through Amazon SES from a verified sender domain (SPF, DKIM, DMARC). Links expire after 1 hour. Links are single-use (consumed on first click). MFA is required for supervisor and admin roles, limiting the impact of a compromised sign-in link. Security awareness training covers phishing recognition. |
| T12 | **Prompt injection via Lomi AI inputs** — A caregiver (or attacker with a caregiver's session) crafts voice or text input designed to manipulate Lomi's AI behavior, bypass safety rules, or extract system prompt content. | Low | Medium | Lomi prompts use structured templates with clear system/user message separation. AI output always goes through the review UI — no auto-submission. Output is constrained to clinical prose sections (activities, meals, mood, health) with Zod schema validation. Model output that fails schema validation falls back to rules-based drafting. No tool use or function calling is enabled for Lomi. |

---

## Authentication

### Flow

Identity is provided by Google Cloud Identity Platform (Firebase Auth). See infrastructure.md §3 for the full flow.

1. **Primary method:** Email + password via the Firebase Auth SDK `signInWithEmailAndPassword()`.
2. **Secondary method:** Email link via `sendSignInLinkToEmail()`. Available for password resets and agencies that prefer passwordless. The link is generated server-side with the Admin SDK and sent through SES.
3. **Future:** SAML/OIDC SSO for enterprise agencies, via Identity Platform's SAML and OIDC providers.

### Session Management

- After sign-in, the server exchanges the ID token for an Identity Platform **session cookie** (Admin SDK `createSessionCookie`) and sets it from `hooks.server.ts`. The cookie's contents are created and signed by Identity Platform; application code never builds its own tokens.
- The browser keeps a 1-hour ID token in memory only (never `localStorage`, `sessionStorage` or IndexedDB), because PowerSync needs it in JavaScript. After a reload it gets a new one from `/auth/sync-token` (a Firebase custom token exchanged with `signInWithCustomToken`). Mitigations: short-lived, strict CSP against XSS, no durable client-side storage.
- Session length: the session cookie lasts 12 hours (absolute), configurable per agency down to 15 minutes. Inactivity locks the app sooner on mobile (see Session Timeout Policy). Identity Platform session cookies can't be extended, so the user signs in again when one expires; unsynced local data is kept.
- On logout: the server clears the cookie and revokes the user's refresh tokens (Admin SDK `revokeRefreshTokens`), and the service worker cache is purged. The local PowerSync database is deleted once its upload queue is empty; if changes are still unsynced (offline), the app locks instead and deletes the database after the next successful sync (offline-sync.md §7).

### Identity Claims

The ID token carries custom claims under `parameters`, used by PowerSync sync rules:
- `agency_id` (uuid) — tenant isolation key, set at account creation, immutable by the user.
- `role` (string) — `caregiver`, `supervisor`, or `admin`. Changed only by admins via a server-side function.
- `profile_id` (uuid) — the user's `profiles.id`, for ownership checks.

These claims are set only by the server with the Admin SDK (`setCustomUserClaims`) and cannot be modified by the client. The database does not trust them: for every request the server loads the profile by `auth_uid` and sets the Postgres session claims from that row (rls.sql header).

### MFA Policy

| Role | MFA Requirement |
|------|----------------|
| Caregiver | Optional (encouraged). Agency can mandate via `agencies.settings.mfa_required_roles`. |
| Supervisor | Required after go-live. 30-day grace period on account creation. |
| Admin | Required immediately. Cannot access admin functions without MFA enrolled. |

MFA is implemented with Identity Platform's TOTP multi-factor. SMS codes are not offered (cost and SIM-swap risk). Identity Platform has no backup codes, so a user who loses their authenticator is reset by an admin: the admin unenrolls the factor (Admin SDK), the action is audited, and the user must enroll again at next sign-in.

### Password Requirements

- Minimum 10 characters.
- At least one uppercase, one lowercase, one digit.
- Enforced by Identity Platform's password policy (set to "enforce", so non-compliant passwords are rejected at sign-up and change).
- Checked against the HaveIBeenPwned breached-password API (k-anonymity model, no plaintext sent).
- Password history: last 5 passwords cannot be reused.
- Forced rotation: none (NIST 800-63B guidance). Rotation forced only on suspected compromise.

**Implementation note:** Identity Platform doesn't check breached passwords or password history natively. Both need password changes to go through a server endpoint (check HaveIBeenPwned with k-anonymity, compare against hashed history in a `password_history` table, then call the Admin SDK `updateUser`). They are post-launch hardening items.

---

## Authorization Matrix

Row-Level Security (RLS) is enforced at the Postgres level. The matrix below shows the intended access. See `rls.sql` for the exact policy implementations.

| Resource | Caregiver | Supervisor | Admin |
|----------|-----------|------------|-------|
| **agencies** | Read own | Read own | Read + Update own |
| **profiles** | Read own agency (home-filtered); Update own name, phone, avatar only | Read own agency; Update own name, phone, avatar only | Read + Write own agency |
| **homes** | Read assigned homes | Read + Update all agency homes | Full CRUD |
| **clients** | Read/Write clients in assigned homes | Read/Write all agency clients | Full CRUD |
| **client_health_info** | Read clients in assigned homes | Read/Write all agency | Full CRUD |
| **goals** | Read clients in assigned homes | Read/Write all agency | Full CRUD |
| **goal_templates** | Read own agency | Read/Write own agency | Full CRUD |
| **medications** | Read clients in assigned homes | Read/Write all agency | Full CRUD |
| **medication_history** | Read clients in assigned homes | Read + Insert all agency | Full CRUD |
| **notes** | Create own; Read all notes in assigned homes; Update own notes in draft/returned status | Read/Write all agency; Approve/Return notes | Full CRUD |
| **note_goals** | Create/Read/Update own draft notes' goals | Read/Write all agency | Full CRUD |
| **note_history** | Read own notes' history | Read all agency | Read only (written by trigger) |
| **incidents** | Create own; Read in assigned homes; Update own open incidents | Read/Write all agency; Close incidents | Full CRUD |
| **mar_records** | Create (if med_certified); Read assigned homes | Read all agency; Create; set `acknowledged` only | Same as supervisor (no edits, no DELETE — amend only) |
| **health_entries** | Create; Read assigned homes | Read/Write all agency | Full CRUD |
| **attendance** | Create; Read assigned homes | Read/Write all agency | Full CRUD |
| **messages** | Read/Write in assigned homes | Read/Write all agency | Full CRUD |
| **coverage_requests** | Read assigned homes; Create callout for own shifts | Read/Write all agency | Full CRUD |
| **coverage_candidates** | Read own candidacy; reply via coverage.accept/decline (server) | Read/Write all agency | Full CRUD |
| **coverage_steps** | Read assigned homes | Read + Insert all agency (append-only) | Read + Insert (append-only — coverage steps are an immutable audit trail) |
| **clock_records** | Create/Read own; Update own open record to clock out only (verification computed by server) | Read/Write all agency; Acknowledge overrides | Full CRUD |
| **schedule_slots** | Read assigned homes | Read/Write all agency | Full CRUD |
| **events** | Read assigned homes | Read all agency | Read all agency (written by server only) |
| **audit_log** | No access | Read own agency | Read own agency (written by trigger only; no INSERT/UPDATE/DELETE by any user) |
| **notifications** | Read/Update own (created by server only) | Read/Update own | Read all agency |
| **notification_preferences** | Read/Write own | Read/Write own | Read/Write all agency |
| **sync_checkpoints** | Read/Write own | Read/Write own | Read/Write all agency |
| **case_notes** | Create own; Read/Update own in assigned homes | Read/Write all agency | Full CRUD |
| **referrals** | No access | Read/Write own agency | Full CRUD |
| **rooms** | Read assigned homes | Read/Write all agency | Full CRUD |
| **device_tokens** | Read/Write own | Read/Write own | Read/Write own |
| **user_settings** | Read/Write own | Read/Write own | Read/Write own |
| **email_suppressions** | No access | No access | Read + Delete (server adds rows) |
| **api_keys, webhooks, webhook_deliveries** | No access | No access | Full access (keys revoked, not deleted) |
| **report_jobs** | No access | Read own agency (server creates and updates) | Same as supervisor |

---

## PHI Inventory

### What Constitutes PHI in Guad

Under HIPAA, PHI is any individually identifiable health information. In Guad's schema:

| Data Element | Table(s) | PHI Classification |
|-------------|----------|-------------------|
| Client full name | `clients.name`, `clients.first_name` | PHI (direct identifier) |
| Client date of birth | `client_health_info.dob` | PHI (direct identifier) |
| Client health conditions | `client_health_info.conditions`, `.allergies`, `.diet` | PHI (health data) |
| Guardian/doctor information | `client_health_info.guardian`, `.doctor` | PHI (associated contact) |
| Medications | `medications.*` | PHI (treatment data) |
| MAR entries | `mar_records.*` | PHI (treatment administration) |
| Shift notes content | `notes.content` | PHI (clinical observations) |
| Incident reports | `incidents.description`, `.injury_detail`, `.medical_followup` | PHI (health events) |
| Health entries (vitals, seizures) | `health_entries.data`, `.flags` | PHI (clinical measurements) |
| Case notes | `case_notes.body` | PHI (clinical narrative) |
| Goal tracking data | `goals.text`, `.area`, `.steps`, `.frequency`, `.target`, `note_goals.trials`, `.reason` | PHI (treatment plan data) |
| Medication change history | `medication_history.action`, `.changed_at`, `.changed_by` | PHI (treatment modification records) |
| Client behavioral data | `clients.behaviors` | PHI (behavioral data) |
| Client free-text info | `clients.info` | PHI (health/personal data) |
| Supervisor note feedback | `notes.supervisor_comment` | PHI (clinical feedback) |
| Attendance services | `attendance.services` | PHI (treatment service data) |
| Incident detail fields | `incidents.antecedent`, `.injured`, `.staff_action`, `.followup_notes`, `.witnesses`, `.location`, `.notified_parties` | PHI (health event detail) |
| Messages content | `messages.body` | Potential PHI (clinical observations shared between staff) |
| Referral client name | `referrals.client_name` | PHI (potential client identifier) |
| Referral contact info | `referrals.contact_phone`, `.contact_email`, `.contact_name`, `.notes` | PHI (associated contact for prospective clients) |

### Where PHI Is Stored

| Location | Permitted | Controls |
|----------|-----------|----------|
| Cloud SQL Postgres | Yes | AES-256 at rest, RLS, Google Cloud BAA |
| PowerSync OPFS (device) | Yes | Encrypted SQLite, session-scoped, cleared on logout |
| Claude on Vertex AI (in-flight) | Yes | Google Cloud BAA, PHI in prompt/response only, prompt logging off |
| Speech-to-Text (in-flight) | Yes | Google Cloud BAA, audio processed and discarded (data logging off) |
| Cloud Storage | Yes (report exports) | Private bucket, signed URLs (15 min), lifecycle deletion after 7 days, Google Cloud BAA |

### Where PHI Is NEVER Stored

- `localStorage` or `sessionStorage`
- `console.log`, `console.error`, or any client-side logging
- URL parameters or query strings
- Error monitoring and log payloads (Cloud Logging, Error Reporting). These are BAA-covered, but logs are copied widely (exports, support), so PHI is still never logged.
- SMS message bodies (shift info only: home name, time — never client names or health data)
- Push notification payloads (generic title + notification ID only; FCM is not a BAA-covered service)
- Browser speech-recognition APIs (e.g., Chrome's Web Speech API sends audio to Google; it is never used)
- Email notification bodies (references use opaque IDs, links to authenticated app)
- Service worker cache (only static assets and non-PHI API responses)
- Git repositories, CI/CD logs, deployment logs

**Re-identification risk note:** In small group homes, even an incident type plus home name ("Seizure at Oak House") can identify the person. Push payloads therefore carry no event details at all (see notifications.md §1). Details appear only inside the authenticated app.

---

## Encryption

### In Transit

- **TLS 1.3** enforced on all connections (Cloud Run, Cloud SQL connector, AWS APIs, API endpoints).
- HTTP Strict Transport Security (HSTS) header with `max-age=31536000; includeSubDomains; preload`.
- Certificate pinning is not used (PWA limitation) but certificate transparency monitoring is enabled.
- PowerSync streaming connections use TLS (WSS or HTTPS streaming).

### At Rest

| Layer | Encryption | Key Management |
|-------|-----------|----------------|
| Cloud SQL Postgres | AES-256 (Google-managed) | Google-managed keys; customer-managed keys (Cloud KMS) optional later |
| Cloud SQL backups | AES-256 | Same as the instance |
| PowerSync OPFS (device) | SQLCipher-style AES-256 (confirm encrypted wa-sqlite build) | Random per-device key, held in memory; stored on disk only wrapped with a PIN-derived key (PBKDF2); server copy deleted on deactivation |
| Cloud Storage (exports) | AES-256 (Google-managed) | Google-managed keys |
| Cloud Tasks payloads | AES-256 (Google-managed) | Payloads hold record IDs only, never PHI |

### Backup Encryption

- Cloud SQL automated daily backups are encrypted at rest with AES-256.
- Point-in-time recovery (PITR) enabled with 7-day retention.
- Restoring a backup requires the `cloudsql.backupRuns` IAM permission, held by the two account owners only; every restore is recorded in Cloud Audit Logs.

---

## Audit Trail

### audit_log Table

Every INSERT, UPDATE, and DELETE on PHI-containing tables is captured in `audit_log`:

| Column | Purpose |
|--------|---------|
| `id` | Unique audit entry ID (UUID) |
| `agency_id` | Tenant isolation |
| `table_name` | Source table (e.g., `notes`, `mar_records`) |
| `record_id` | Primary key of the affected row |
| `action` | `INSERT`, `UPDATE`, or `DELETE` |
| `old_values` | JSONB snapshot of the row before mutation (NULL for INSERT) |
| `new_values` | JSONB snapshot of the row after mutation (NULL for DELETE) |
| `performed_by` | `profiles.id` of the acting user |
| `ip_address` | Client IP address |
| `user_agent` | Browser/device user agent string |
| `created_at` | Timestamp (UTC) of the audit entry |

### Audited Tables

All PHI tables trigger audit logging: `clients`, `client_health_info`, `goals`, `medications`, `medication_history`, `notes`, `note_goals`, `incidents`, `mar_records`, `health_entries`, `attendance`, `case_notes`, `referrals`, `messages`. Non-PHI operational tables (`schedule_slots`, `clock_records`, `coverage_requests`) are also audited for operational accountability. AI invocations are logged with `table_name: 'ai_invocations'` (virtual — metadata only, no prompt content; see ai-pipeline.md for fields logged).

### Tamper Resistance

- The `audit_log` table has **no UPDATE or DELETE RLS policies**. Application code cannot modify or remove audit entries.
- The `app_user` database role used for user requests has no `DELETE` or `TRUNCATE` grant on `audit_log`.
- A Postgres trigger prevents direct `UPDATE` or `DELETE` on `audit_log` rows even for superusers within the application context.
- **Known risk:** `audit_log.agency_id` currently has `onDelete: 'cascade'` in the schema, meaning deleting an agency would cascade-delete its entire audit trail. This must be changed to `onDelete: 'restrict'` (preventing agency deletion while audit records exist) or `onDelete: 'set null'` (preserving orphaned audit records) before production to meet the 7-year retention requirement. A Postgres trigger should also prevent `DELETE` on the `agencies` table while `audit_log` rows reference it.

### Retention

- **Minimum 7 years** (exceeds HIPAA's 6-year minimum for Security Rule documentation).
- Archived to Cloud Storage Archive class after 2 years for cost optimization.
- Retention policy is enforced by infrastructure; no application code deletes audit records.

### Access

- Admins can view audit logs for their agency via a read-only UI.
- Supervisors can view audit logs for their agency.
- Caregivers have no access to audit logs.
- Export of audit logs requires admin role and is itself logged.

---

## Breach Response

### HIPAA Breach Notification Rule (45 CFR 164.400-414)

If a breach of unsecured PHI is discovered, the following timeline applies:

| Deadline | Action |
|----------|--------|
| Immediately | Engineering team isolates affected systems. Revoke compromised credentials. Preserve logs. |
| Within 24 hours | Incident commander (CTO or designated security officer) assesses scope: number of individuals affected, data elements exposed, who accessed, whether data was actually acquired. |
| Within 72 hours | Formal risk assessment completed. Determination of whether breach notification is required (low-probability-of-compromise exception analysis per 45 CFR 164.402). |
| Within 60 days of discovery | If breach is confirmed: notify affected individuals in writing (mail or email). If >500 individuals in a single state, notify prominent media outlet. Notify HHS Secretary via HHS breach reporting portal. |
| Within 60 days of calendar year end | If <500 individuals affected, may batch-report to HHS annually. |

### Internal Escalation Procedure

1. **Reporter** identifies potential breach (suspicious access in audit log, lost device, vulnerability report).
2. **On-call engineer** verifies the report within 1 hour. If confirmed or uncertain, escalates to Incident Commander.
3. **Incident Commander** activates breach response team: engineering lead, security officer, legal counsel.
4. **Containment:** Revoke affected sessions, rotate API keys, disable compromised accounts, patch vulnerability.
5. **Assessment:** Query `audit_log` for all access by compromised credentials within the exposure window. Identify affected `agency_id` values and enumerate affected individuals.
6. **Documentation:** Maintain a breach log with: date of discovery, date of breach (if different), description, data elements involved, number of individuals, corrective actions.
7. **Notification:** Draft notification letters (template stored in secure document management, not in git). Legal review. Send within HIPAA deadlines. **Note:** Some US states have shorter breach notification deadlines than HIPAA's 60 days (e.g., California requires notification "in the most expedient time possible"). Consult the state-specific notification timeline matrix maintained by legal counsel.

### Incident Commander and Roles

- **Primary Incident Commander:** CTO (or designated Security Officer). Must be reachable 24/7 via on-call rotation.
- **Backup Incident Commander:** VP of Engineering (or designated alternate).
- **Breach Response Team:** Engineering lead, Security Officer, Legal Counsel, Privacy Officer.
- **External forensics engagement criteria:** Required when breach affects >100 individuals, involves suspected nation-state or advanced persistent threat, or when internal investigation cannot determine scope within 72 hours.

### Tabletop Exercises

- Conduct breach response tabletop exercises **annually** (minimum), simulating realistic scenarios (device theft, insider access, API key compromise).
- After each exercise, update this document and the incident response runbook with lessons learned.
- Track exercise dates and findings in the compliance calendar.

### Logging Requirements for Breach Investigation

- All `audit_log` entries for the affected time window are preserved and exported.
- Identity Platform audit logs (sign-ins, token refreshes, account changes) from Cloud Audit Logs are exported.
- Server access logs (IP addresses, endpoints hit, response codes) are preserved.
- PowerSync sync logs for affected users are reviewed.
- All logs are preserved for the duration of the investigation plus 7 years.

---

## BAA Matrix

| Vendor | Service | PHI Exposed | BAA Status |
|--------|---------|------------|------------|
| **Google Cloud** | Cloud Run, Cloud SQL, Identity Platform, Vertex AI (Claude), Speech-to-Text, Cloud Storage, Cloud Tasks, Secret Manager, Cloud Logging | Yes — all PHI at rest, auth, the caregiver's transcript and audio, plus the client's first name and goal text in AI prompts. No last names, DOBs, IDs, diagnoses list or guardian info are added to prompts by Guad (ai-pipeline.md PHI Minimization). | Required. Free; accepted in the Cloud console for the organization. Covers only the products on Google's HIPAA covered-products list: **confirm the Claude model and region on Vertex AI are listed.** **Must be accepted before any real client data.** |
| **AWS** | SES (email), End User Messaging (SMS) | Minimal — message bodies contain no client names or health data (shift times and links only). | Required (belt-and-suspenders). Free; accepted in AWS Artifact. |
| **Google (Firebase Cloud Messaging)** | Push notification delivery | No — by design. Push payloads carry only a generic title ("Guad: Action needed"), a notification ID and a deep link. The app fetches details after the user opens it and signs in. Incident types, client names and medication details are never in a push payload. | Not required while payloads stay PHI-free. If any PHI is ever added to push payloads, FCM is not BAA-covered and must not be used. |
| **PowerSync** (Open Edition, self-hosted) | Offline sync engine | Runs inside our Google Cloud project; PowerSync (the company) never receives data | Not required: no data reaches the vendor. Required only if we move to PowerSync Cloud. |

### BAA Checklist Before Production

- [ ] Google Cloud BAA accepted (organization level)
- [ ] Claude model and region confirmed on Google's HIPAA covered-products list
- [ ] AWS BAA accepted in AWS Artifact (SES, End User Messaging)
- [ ] Confirm push payloads contain no PHI (automated test in notifications.md §12)
- [ ] Confirm Cloud Tasks payloads contain record IDs only
- [ ] All BAAs stored in secure document management (not in git repo)
- [ ] Annual BAA review calendar event created

---

## Offline Security

### PowerSync Sync Scope

- PowerSync sync rules filter all data by `agency_id` (from the authenticated user's JWT).
- **Global bucket:** Reference data (agencies, homes, profiles, goal_templates) for the entire agency is synced to all users, including caregivers. Home names and addresses are not PHI and are needed for schedule views, coverage requests, and navigation. Profile names are needed for author attribution and messaging.
- **Home data bucket:** Clinical and operational data (clients, notes, MAR records, incidents, health_entries, medications, case_notes, attendance, messages, etc.) is filtered to the caregiver's assigned `home_ids`. A caregiver's device never receives clinical data for homes they are not assigned to.
- Supervisors receive all data for their agency across both buckets.
- Sync rules are defined server-side in PowerSync's configuration and cannot be overridden by the client.

### Local SQLite Encryption

- PowerSync uses wa-sqlite compiled with SQLCipher, providing AES-256-CBC encryption for the local OPFS database.
- The key is a random per-device key issued by the server at first sign-in. It is held in memory and stored on disk only wrapped with a PIN-derived key, so caregivers can reopen the app offline across token expiry without losing unsynced work.
- Five wrong PINs delete the wrapped key; the database can then only be reopened by signing in online. Deactivating the user or device deletes the server copy of the key.

### Data Cleared on Logout

On explicit logout, the following are cleared (session expiry only drops the in-memory key; see offline-sync.md §7):

1. PowerSync OPFS database is deleted (OPFS directory removal) **once the upload queue is empty**. If changes are unsynced, the app locks instead and deletes the database after the next successful sync.
2. Service worker cache is purged of any API responses.
3. All in-memory Svelte stores are reset.
4. The session cookie is cleared and the user's Identity Platform refresh tokens are revoked server-side.

### Session Timeout Policy

| Scenario | Timeout | Action |
|----------|---------|--------|
| Inactivity (no API calls or UI interaction) | 12 hours (default), configurable per agency | Session expired, local data cleared, redirect to login |
| App backgrounded (mobile PWA) | 5 minutes (configurable) | PIN/biometric required to resume |
| Browser tab closed | Session persists until timeout | Session cookie used on re-open |
| Device locked | No action | Normal OS lock protects device; session resumes on unlock |

### Offline Write Security

- Writes made offline are stored in the local encrypted SQLite database.
- On reconnect, PowerSync uploads queued writes through the `sync.upload` tRPC procedure, which runs each one through the owning service (validation, business rules, audit). RLS and the integrity triggers are the backstop, so a tampered local write is rejected.
- Conflict resolution: server state wins. If a record was modified both offline and on another device, the server-side version is authoritative.
- Offline writes include the `created_by` field (profile_id from local session) so authorship is preserved even if sync is delayed.

---

## Appendix: HIPAA Security Rule Mapping

| HIPAA Requirement | Guad Implementation |
|-------------------|---------------------|
| 164.312(a)(1) — Access control | Identity Platform + RLS. Role-based access enforced at database level. |
| 164.312(a)(2)(i) — Unique user identification | Identity Platform UID per user. `profiles.auth_uid` is unique. |
| 164.312(a)(2)(iii) — Automatic logoff | 12-hour inactivity timeout. Configurable per agency. |
| 164.312(a)(2)(iv) — Encryption and decryption | AES-256 at rest (Cloud SQL, OPFS). TLS 1.3 in transit. |
| 164.312(b) — Audit controls | `audit_log` table. Append-only. 7-year retention. |
| 164.312(c)(1) — Integrity | Audit log captures old/new values. MAR entries are irrevocable. |
| 164.312(d) — Person or entity authentication | Email + password, MFA (TOTP), email link. |
| 164.312(e)(1) — Transmission security | TLS 1.3 on all connections. HSTS enforced. |
| 164.308(a)(1) — Security management process | This document. Annual review cycle. |
| 164.308(a)(4) — Information access management | Role-based access via RLS. Quarterly access reviews by agency admins. Automated stale assignment detection. |
| 164.308(a)(5) — Security awareness training | Workforce training program (see Workforce Training section below). |
| 164.308(a)(7) — Contingency plan | Disaster recovery plan, RTO/RPO targets, backup verification (see Contingency Plan section below). |
| 164.308(a)(6) — Security incident procedures | Breach response procedure defined above. |
| 164.310(a)(1) — Facility access controls | Cloud-hosted (Google Cloud, AWS for messaging). Physical security delegated to cloud providers per their SOC 2 / ISO 27001 certifications. |
| 164.310(b) — Workstation use | Caregiver devices: PWA in browser sandbox. Admin workstations: screen lock required, no PHI in local files. |
| 164.310(c) — Workstation security | Session timeout enforced. OPFS encrypted. No PHI in clipboard persistence. |
| 164.310(d)(1) — Device and media controls | OPFS wiped on logout. No USB export. Watermarked exports. See Device Requirements section below. |

---

## Risk Assessment

### Methodology

Risk assessments follow a qualitative likelihood x impact matrix. Threats are rated on a 3-point scale for likelihood (Low / Medium / High) and impact (Medium / High / Critical). The resulting risk rating drives prioritization of mitigations.

### Assessment Frequency

- **Formal risk assessment:** Conducted annually and whenever a significant system change occurs (new subprocessor, new PHI data flow, architecture change, or after a security incident).
- **Threat model review:** Reviewed quarterly. New threats identified through vulnerability scanning, pen tests, or incident post-mortems are added to the threat table above.
- **Findings tracking:** Risk assessment findings are tracked in the project's issue tracker with severity labels and remediation deadlines:
  - Critical: 7-day remediation SLA
  - High: 30-day remediation SLA
  - Medium: 90-day remediation SLA
  - Low: Next quarterly review cycle

### Assessment Scope

Each assessment covers: application code, infrastructure configuration, third-party dependencies (npm audit), subprocessor agreements (BAA status), access controls (RLS policies vs. security matrix), and device/endpoint security.

---

## Data Retention and Disposal

### Retention Periods

| Data Category | Retention Period | Basis |
|---------------|-----------------|-------|
| **Audit log** | Minimum 7 years (exceeds HIPAA 6-year minimum) | HIPAA Security Rule 164.316(b)(1) |
| **Clinical records** (notes, MAR, incidents, health_entries, case_notes) | Minimum 7 years from last service date, or longer per state law | State medical records retention laws (varies: 6-10 years) |
| **Client records** (clients, client_health_info, goals, medications) | Retained for duration of client's active service + 7 years after discharge | HIPAA Privacy Rule 164.530(j) |
| **Operational records** (schedule_slots, clock_records, coverage_requests, attendance) | 3 years minimum, 7 years recommended | Business records retention |
| **Messages** | 3 years minimum | Operational records |
| **Referrals** | 7 years from referral date (contain prospective client PHI) | HIPAA Privacy Rule |

### Archival Process

- Records past their active use period (2+ years old) are archived to cold storage (Cloud Storage Archive class) for cost optimization.
- Archived records remain accessible for compliance inquiries with a retrieval SLA of 24 hours.
- Archival is enforced by infrastructure automation, not application code.

### Disposal and Agency Offboarding

- When an agency terminates service, all PHI is retained for the remainder of the required retention period.
- After retention period expiration, data is disposed of via cryptographic erasure (key destruction for encrypted storage) or certified deletion.
- Agency offboarding triggers:
  1. Deactivation of all user accounts (Identity Platform accounts disabled, refresh tokens revoked).
  2. PowerSync sync rules updated to exclude the agency (no new data synced to devices).
  3. Data flagged for retention hold (prevents premature deletion).
  4. Certificate of destruction issued after retention period and disposal.
- **Audit log entries are never deleted**, even during agency offboarding, to maintain the compliance trail.

---

## Contingency Plan

### Recovery Objectives

| Objective | Target |
|-----------|--------|
| **Recovery Time Objective (RTO)** | 4 hours for core charting and MAR functions |
| **Recovery Point Objective (RPO)** | 1 hour (Cloud SQL point-in-time recovery) |
| **Maximum Tolerable Downtime** | 24 hours before manual paper-based fallback is required |

### Data Backup

- **Automated daily backups:** Cloud SQL automated daily backups, encrypted at rest with AES-256.
- **Point-in-time recovery (PITR):** Enabled with 7-day retention. Allows recovery to any point within the last 7 days.
- **Backup verification:** Monthly restore test to a staging environment to verify backup integrity and measure actual RTO.
- **Backup access:** Restores are done by the account owners in the Cloud console (restore to a new instance, then switch over) and are recorded in Cloud Audit Logs.

### Emergency Mode Operations

If the primary application is unavailable:
1. **Offline mode:** Caregivers with cached data in PowerSync OPFS continue charting offline. Data syncs when connectivity is restored.
2. **Paper fallback:** Agencies maintain paper charting forms (provided during onboarding) for use when both the application and devices are unavailable.
3. **Communication:** Status page and SMS notifications to agency admins within 30 minutes of outage detection.

### Disaster Recovery Testing

- **Annual DR test:** Full failover simulation including database restore from backup and application redeployment.
- **Quarterly backup restore verification:** Automated restore of the latest backup to a staging environment, with data integrity checks.
- **Test results:** Documented with actual RTO/RPO achieved, gaps identified, and remediation actions.

---

## Workforce Training

### Required Training Topics

All Guad platform users receive HIPAA security awareness training covering:

1. **PHI identification** — What constitutes PHI in Guad (names, DOBs, health conditions, medications, clinical notes).
2. **Access controls** — Role-based access, why caregivers only see their assigned homes, reporting unauthorized access.
3. **Device security** — Screen lock requirements, not sharing login credentials, reporting lost/stolen devices immediately.
4. **Phishing recognition** — Identifying phishing emails mimicking email sign-in links, reporting suspicious communications.
5. **Incident reporting** — How to report suspected breaches or security concerns (who to contact, what to document).
6. **Data handling** — No PHI in text messages, personal email, screenshots, or social media. No photographing client records.

### Training Schedule

| Event | Timeline |
|-------|----------|
| **New hire training** | Completed within 30 days of account creation. Account access limited to read-only until training is verified. |
| **Annual refresher** | Required annually. Due date tracked per user in agency settings. |
| **Incident-triggered training** | Required within 14 days after a security incident affecting the agency. |
| **Role change training** | Required when a user is promoted to supervisor or admin (covers elevated access responsibilities). |

### Compliance Tracking

- Training completion is tracked per profile in `agencies.settings.training_records` (or a dedicated training system).
- Agency admins can view training compliance status for all staff.
- Overdue training generates a `training_overdue` notification to the agency admin (see notifications.md).

---

## Access Review

### Periodic Access Review

Per HIPAA 164.308(a)(4)(ii)(C), user access is reviewed periodically:

| Review Type | Frequency | Conducted By |
|-------------|-----------|--------------|
| **Active account audit** | Quarterly | Agency admin |
| **Role assignment review** | Quarterly | Agency admin |
| **Home assignment review** | Monthly | Supervisor |
| **Admin account review** | Quarterly | Platform security team |

### Review Procedures

1. **Active accounts:** Review all profiles with `active = true`. Deactivate any accounts for staff who have left the agency or changed roles.
2. **Home assignments:** Verify that each caregiver's `home_ids` array matches their current work assignment. Remove access to homes where the caregiver no longer works. Flag profiles with `home_ids` not matching any recent `schedule_slots` entries.
3. **Role verification:** Confirm that supervisor and admin roles are assigned only to staff who require that access level.
4. **MFA compliance:** Verify all supervisor and admin accounts have MFA enrolled.

### Automated Detection

- Alert when a profile has not logged in for 90+ days but remains active.
- Alert when a caregiver's `home_ids` do not overlap with any `schedule_slots` in the past 30 days.
- Alert when an admin account is created (requires review by existing admin).

---

## Device Requirements

### Minimum Device Standards

Since caregivers use personal devices (BYOD) to access and cache PHI via the PWA:

| Requirement | Standard |
|-------------|----------|
| **iOS minimum version** | iOS 16.4+ (required for PWA push notification support and current security patches) |
| **Android minimum version** | Android 10+ (API level 29) |
| **Screen lock** | Device must have a screen lock enabled (PIN, pattern, fingerprint, or face recognition). The PWA cannot enforce this but the policy must exist. |
| **Browser** | Latest version of Safari (iOS) or Chrome (Android). Auto-update must be enabled. |
| **Jailbroken/rooted devices** | Must not be used to access Guad. Even though the PWA cannot detect this, the policy prohibits it. |

### Agency-Owned Devices

For agencies that provide devices to caregivers:
- MDM enrollment is recommended (e.g., Jamf for iOS, Google Workspace MDM for Android).
- MDM policies should enforce: minimum OS version, screen lock, encryption at rest, remote wipe capability.
- Device disposal: factory reset required before reassignment or disposal. Document disposal in asset management system.

### PWA Limitations

As a Progressive Web App, Guad cannot enforce device-level security policies (screen lock, OS version, jailbreak detection) at the technical level. These requirements are enforced through:
1. Agency onboarding agreements (staff acknowledge device requirements).
2. User agent string checking to warn users on unsupported browsers/OS versions.
3. Annual compliance reminders to agency admins.

---

## Vulnerability Management

### Penetration Testing

- **Frequency:** Annual penetration test by a qualified third-party security firm.
- **Scope:** Application layer (tRPC API, OpenAPI, authentication flows), infrastructure (Google Cloud IAM, Cloud Run, Cloud SQL and AWS messaging configuration), and client-side (PWA, PowerSync sync).
- **Findings:** Remediated per the risk assessment SLA (Critical: 7 days, High: 30 days, Medium: 90 days).
- **Re-test:** Critical and high findings are re-tested after remediation.

### Automated Scanning

| Scan Type | Cadence | Tool |
|-----------|---------|------|
| **Dependency vulnerabilities** | Every CI build | `npm audit` |
| **Static analysis** | Every CI build | ESLint security rules |
| **Container/infrastructure scanning** | Weekly | Cloud provider native tools |
| **Secret detection** | Every commit (pre-commit hook) | git-secrets or similar |

### Patch Management

| Severity | SLA |
|----------|-----|
| Critical (actively exploited) | 24 hours |
| High (CVSS 7.0+) | 7 days |
| Medium (CVSS 4.0-6.9) | 30 days |
| Low (CVSS < 4.0) | Next release cycle |

- Security patches are applied to production outside the normal release cycle when severity is Critical or High.
- `npm audit` failures at High or Critical severity block the CI build.
- Dependency updates are managed via Renovate/Dependabot with auto-merge for patch versions and manual review for minor/major versions.
