# Infrastructure

Where Guad runs, what each piece costs, and how the pieces connect. This file is the source of truth for vendors and hosting. The other specs refer to it instead of repeating these details.

**Decision (October 2026):** Google Cloud for the app, database, sign-in and AI. AWS only for SMS and email. Both clouds sign a HIPAA BAA at no extra cost, and both BAAs must be accepted before any real client data enters the system. Until then, use synthetic data only.

## 1. Stack

| Layer | Service | Why | BAA |
|---|---|---|---|
| Web app (SvelteKit, `adapter-node`) | **Cloud Run** service `web` | Deploy a container; HTTPS, scaling and patching are handled. Scales to zero. | Google Cloud |
| Job handlers | **Cloud Run** service `worker` (HTTP endpoints, no long-running process) | Same image as `web`, different entry point. Called only by Cloud Tasks and Cloud Scheduler. | Google Cloud |
| Job queue, delayed jobs | **Cloud Tasks** | One queue per job type, with per-queue rate limits, concurrency and retry backoff. Supports delays up to 30 days (coverage timeouts, escalation timers). Replaces BullMQ + Redis, so there is no Redis to run. | Google Cloud |
| Recurring jobs | **Cloud Scheduler** | Cron that calls `worker` endpoints (sync window, daily summaries, missed-dose checks). | Google Cloud |
| Database | **Cloud SQL for PostgreSQL 16** | Managed Postgres with automated backups and point-in-time recovery. `schema.ts` and `rls.sql` apply unchanged. | Google Cloud |
| Offline sync | **PowerSync Open Edition** (self-hosted, free) on Cloud Run with 1 minimum instance | Reads the Cloud SQL write-ahead log; bucket storage lives in a separate database on the same Cloud SQL instance (supported on Postgres 14+). | Runs inside our project |
| Sign-in | **Identity Platform** (Firebase Authentication with the Identity Platform upgrade) | Email + password, email link, TOTP MFA, SAML/OIDC SSO later. Free for the first 50,000 monthly active users on basic sign-in. | Google Cloud |
| AI drafting (Lomi) | **Claude on Vertex AI** | Same Claude models as the Anthropic API, billed through Google Cloud. | Google Cloud. **Confirm the specific Claude model and region are on Google's covered-products list before sending PHI.** |
| Voice transcription | **Speech-to-Text v2** (Chirp model), batch | Covered by the same BAA, so audio never leaves Google Cloud. | Google Cloud |
| Files (report exports, attachments) | **Cloud Storage**, private bucket, short-lived signed URLs | | Google Cloud |
| Secrets | **Secret Manager** | Mounted into Cloud Run as environment variables. | Google Cloud |
| Logs, errors, uptime | **Cloud Logging**, **Error Reporting**, **Cloud Monitoring** | Covered by the BAA, but logs must still never contain PHI (security.md). | Google Cloud |
| Push notifications | **Firebase Cloud Messaging** | Free. Not BAA-covered, so payloads stay PHI-free (generic title + notification ID). | Not covered; no PHI allowed |
| Email | **Amazon SES** | About $0.10 per 1,000 emails. | AWS |
| SMS | **AWS End User Messaging SMS** | About $0.01 per text plus 10DLC registration. | AWS |

**Not used:** Supabase, Vercel, Twilio, SendGrid, Redis/BullMQ, Azure. Each would either duplicate a covered service above or need a paid plan to get a BAA.

## 2. How the pieces connect

```
 Device (PWA)                         Google Cloud project (one region, US)
 ┌──────────────┐  HTTPS (tRPC)   ┌───────────────────┐  SET LOCAL ROLE app_user  ┌─────────────────┐
 │ SvelteKit UI │────────────────>│ Cloud Run: web     │─────────────────────────>│ Cloud SQL PG 16 │
 │              │                 │  tRPC, sync.upload │                          │  guad (37 tbl)  │
 │ PowerSync    │  WSS / HTTP     ├───────────────────┤   logical replication    │  powersync_     │
 │ wa-sqlite    │<───────────────>│ Cloud Run:         │<─────────────────────────│   storage       │
 │ (OPFS)       │  stream         │  powersync (min 1) │                          └─────────────────┘
 └──────┬───────┘                 ├───────────────────┤  enqueue      ┌─────────────┐      ▲
        │ ID token                │ Cloud Run: worker  │<─────────────│ Cloud Tasks │      │
        ▼                         │  job handlers      │<───cron──────│ Scheduler   │      │
 ┌──────────────┐                 └─────────┬─────────┘               └─────────────┘      │
 │ Identity     │                           │ Vertex AI (Claude), Speech-to-Text,          │
 │ Platform     │                           │ Cloud Storage, FCM                           │
 └──────────────┘                           ▼                                              │
                                  ┌───────────────────┐  AWS (messaging only)              │
                                  │ SES, End User      │  bounces/opt-outs via SNS ─────────┘
                                  │ Messaging SMS      │  → worker HTTPS endpoint
                                  └───────────────────┘
```

- **Devices never talk to Postgres.** Reads arrive through PowerSync; writes go through tRPC (online) or `sync.upload` (offline queue). See offline-sync.md.
- **Cloud Run to Cloud SQL** uses the Cloud SQL connector over a private connection with IAM database authentication, so no database password is stored anywhere.
- **Cloud Tasks and Cloud Scheduler call `worker`** with a Google-signed OIDC token for a dedicated service account. `worker` rejects any request without it, and is not publicly invokable.
- **Google Cloud to AWS** uses workload identity federation: an AWS IAM role trusts the `worker` service account's Google identity, so there are no long-lived AWS keys. The role can only send SES email and SMS.

## 3. Sign-in and sessions

Identity Platform is the only identity provider. There is no custom password storage and no hand-built JWT.

1. **Sign in.** The browser uses the Firebase Auth SDK (`signInWithEmailAndPassword`, or email link) with `inMemoryPersistence`, so no token is written to `localStorage` or IndexedDB.
2. **Session cookie.** The browser posts the fresh ID token to `/auth/session`. The server verifies it and exchanges it for an Identity Platform **session cookie** (Admin SDK `createSessionCookie`, 12-hour lifetime, `HttpOnly`, `Secure`, `SameSite=Lax`). Every tRPC request is authenticated by verifying this cookie with revocation checking.
3. **Token for PowerSync.** PowerSync needs a token in JavaScript. After a page load, the client calls `/auth/sync-token`; the server checks the session cookie and returns a Firebase custom token (Admin SDK `createCustomToken`), which the client exchanges with `signInWithCustomToken` for a 1-hour ID token held in memory. PowerSync validates that ID token against Google's public keys (JWKS). On Cloud Run, signing custom tokens needs the `web` service account to hold `roles/iam.serviceAccountTokenCreator` on itself (the Admin SDK signs through the IAM API; no key file).
4. **No custom claims.** Tokens carry only the user ID. PowerSync's sync streams look up the caller's active profile by `auth_uid` (offline-sync.md §4), and database sessions load the profile the same way and set `app.claims` from it (rls.sql). So role, home and active changes apply within seconds, with no token refresh. Locally, the Auth emulator's tokens are unsigned, so `/auth/sync-token` returns a 1-hour PowerSync token signed with a dev-only key instead (only when `FIREBASE_AUTH_EMULATOR_HOST` is set).
5. **MFA.** TOTP MFA is required for supervisor and admin roles (Identity Platform multi-factor with TOTP). SMS MFA is not used.
6. **Revocation.** Deactivating a user sets `profiles.active = false`, revokes their refresh tokens and disables the Identity Platform account. tRPC rejects the session cookie on the next request; PowerSync's sync streams stop returning rows within seconds because the profile is inactive, and the device drops them on its next sync.

## 4. Database access from the server

Every request handled for a signed-in user runs inside one transaction that starts with:

```sql
SET LOCAL ROLE app_user;
SELECT set_config('app.claims',  $claims,  true);  -- {"agency_id","role","profile_id"} from the profile row
SELECT set_config('app.request', $request, true);  -- {"ip","user_agent"} for the audit trigger
```

This lives in one helper, `withUser(ctx, fn)` in `src/lib/server/db/index.ts`, and is the only place raw SQL is allowed in the app. Job handlers use `withService(fn)`, which runs `SET LOCAL ROLE app_service` (bypasses RLS) and is limited to the cross-user writes listed at the end of rls.sql. If the claims are missing, every RLS policy matches no rows, so a forgotten call fails closed.

PowerSync connects with its own `powersync_replication` role (`REPLICATION`, `BYPASSRLS`, `SELECT` on the published tables only).

## 5. Jobs

Each queue in the services.md job registry is one Cloud Tasks queue (names use `-`, e.g. `notifications-sms`). Queue settings carry the rate limits and retry policies listed in services.md. Task payloads contain **record IDs only**, never PHI; the handler loads the data from Postgres.

| Need | How |
|---|---|
| Run later (coverage timeout, escalation) | Cloud Tasks task with `scheduleTime` |
| Rate limit (SMS 1/s) | Queue `maxDispatchesPerSecond` |
| Concurrency | Queue `maxConcurrentDispatches` |
| Retries with backoff | Queue retry config (`maxAttempts`, `minBackoff`, `maxBackoff`) |
| Cancel a pending job (shift filled before timeout) | Delete the task by its deterministic name, e.g. `coverage-timeout-<requestId>-<step>` |
| Recurring | Cloud Scheduler job calling a `worker` endpoint |
| Idempotency | Deterministic task names (Cloud Tasks rejects duplicates) plus idempotent handlers |

## 6. Local development (costs $0)

Everything runs on a laptop with Docker. No cloud account is needed to build features.

| Production | Local |
|---|---|
| Cloud SQL | `postgres:16` container with `wal_level=logical` |
| PowerSync | `journeyapps/powersync-service` container, Postgres bucket storage |
| Identity Platform | Firebase Auth emulator (`firebase emulators:start --only auth`) |
| Cloud Tasks / Scheduler | In-process driver: `jobs.enqueue()` calls the handler after the delay; cron runs from `node-cron` |
| Vertex AI, Speech-to-Text | Real APIs on a dev project with synthetic data, or the rules-based fallback with no key |
| SES / SMS | Mailpit container for email; SMS written to the console |
| Cloud Storage | Local folder |

`npm run db:up` starts Postgres and Mailpit (PowerSync joins with offline sync), `npm run dev:auth` starts the Auth emulator, `npm run db:seed` adds a synthetic demo agency with five staff who can sign in, and `npm run dev` starts SvelteKit. In dev, `hooks.server.ts` loads `.env` into `process.env`; SvelteKit 3 keeps `PUBLIC_*` variables out of server code, so server modules use server-side names such as `GOOGLE_CLOUD_PROJECT`.

## 7. Cost

Rough monthly cost at pilot scale (1–3 agencies, under 200 staff). List prices; check the Google Cloud and AWS pricing pages before budgeting.

| Item | Monthly |
|---|---|
| Cloud SQL (shared-core instance, 10 GB SSD, backups) | $10–30 |
| PowerSync on Cloud Run (1 small instance always on) | $10–20 |
| Cloud Run `web` + `worker` (scales to zero) | $0–10 |
| Cloud Tasks, Scheduler, Secret Manager, Logging | ~$0 (free tiers) |
| Identity Platform | $0 (under 50k MAU) |
| Claude on Vertex AI + Speech-to-Text | Pennies to a few dollars at pilot volume |
| SES + SMS (number + 10DLC campaign + messages) | ~$12–15 |
| **Total** | **~$35–75** |

Credits: Google Cloud's $300 free trial, Google for Startups Cloud Program (Start tier, up to $2,000 for a year, self-serve), and AWS signup credits for messaging.

**Avoid surprise bills:** set budget alerts in both clouds on day one; keep Cloud SQL as a single zone until there are paying customers; set log retention limits; don't add a Cloud NAT or Serverless VPC connector unless something needs it.

## 8. Before real client data

- [ ] Google Cloud BAA accepted (Cloud console → Compliance) on the organization that owns the project
- [ ] Claude model and region confirmed as BAA-covered on Vertex AI
- [ ] AWS BAA accepted in AWS Artifact on the messaging account
- [ ] Only BAA-covered services used for PHI (FCM payloads stay PHI-free)
- [ ] Cloud SQL: private IP, IAM auth, automated backups + point-in-time recovery on, deletion protection on
- [ ] Budget alerts and audit logs (Cloud Audit Logs data-access logs for Cloud SQL and Secret Manager) on
- [ ] security.md checklist complete
