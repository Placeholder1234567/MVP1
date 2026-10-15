# CLAUDE.md -- Claude Code Instructions for Guad

## Quick Start

> **Phase 1 in progress.** The SvelteKit 3 app at the root has the database layer, shared domain rules, sign-in (Identity Platform session cookies, Auth emulator locally) tRPC (`auth.me`, `agency.get`, `home.list`, `home.get`) and PowerSync end to end (Sync Streams, encrypted on-device database unlocked with a device PIN, live updates, offline reads); `sync.upload` for offline writes comes next. The vanilla-JS MVP lives in `mvp/` (run it with `cd mvp && npx vercel dev`, see `mvp/README.md`). Needs Node 22+ and Docker.

```bash
npm install
cp .env.example .env
npm run db:up               # Local Postgres 16, PowerSync (:8080) and Mailpit (infrastructure.md §6)
npm run db:setup            # Drizzle migrations, .specify/rls.sql (policies, triggers), grants, PowerSync role + publication
npm run dev:auth            # Firebase Auth emulator (separate terminal; needs Java 11+)
npm run db:seed             # Synthetic demo agency + 5 staff; password is DEV_PASSWORD in src/lib/server/seed.ts
npm run dev                 # SvelteKit dev server at http://localhost:5173
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | SvelteKit dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm test` | Unit tests (vitest) |
| `npm run test:integration` | Database and sign-in tests (local Docker Postgres; starts its own Auth emulator) |
| `npm run dev:auth` / `db:seed` | Auth emulator / synthetic demo data with emulator-only accounts |
| `npm run db:up` / `db:down` | Start / stop the local stack |
| `npm run db:setup` | Apply migrations, RLS policies, triggers and grants (`db:reset` drops everything first) |
| `npm run db:generate` | Generate a Drizzle migration after editing `.specify/schema.ts` |
| `npm run db:studio` | Open Drizzle Studio (database browser) |
| `npm run lint` | ESLint (incl. import boundaries) + svelte-check |
| `npm run format` | Prettier |
| `npm run spec:lint` / `spec:rls-test` | Spec consistency linter / SQL-level RLS tests |
| `npm run sync:rules` | Regenerate `powersync/sync-config.yaml` from `offline-sync.md` §4 (CI checks they match) |
| `npm run sync:probe -- <email>` | Show what PowerSync would sync to a seeded user (row counts only) |

## MVP Reference (read before building UI)

The working MVP prototype is in `mvp/` (run it with `cd mvp && npx vercel dev`). These files are the ground truth for how features look and behave. Other specs cite these files without the folder (e.g. `styles.css:101`, `src/app-core.js`); those always mean the copy under `mvp/`.

| File | Read it for |
|------|------------|
| `mvp/styles.css` | **Complete visual identity** — every color, font, radius, shadow, animation. Port exactly. |
| `mvp/src/app-caregiver.js` | Caregiver screens, interactions, rendering logic |
| `mvp/src/app-office.js` | Supervisor dashboard, review flows, management screens |
| `mvp/src/app-core.js` | Business logic, constants (vitals, shifts, prompt levels), helpers |
| `mvp/src/app-main.js` | Event handling, state management, all user action flows |
| `mvp/src/store.js` | Data model shape, seed data |
| `mvp/src/lomi.js` | AI client, rules-based fallback, vague word detection |
| `mvp/src/prompts.js` | Exact prompt templates for AI drafting |
| `mvp/src/geo.js` | Geofence logic (haversine, rankHomes) |

**When the spec and MVP code disagree on behavior, flag it — don't silently pick one.**

## Architecture

Read `.specify/` for full specs. Key files:

| File | What to read it for |
|------|---------------------|
| `.specify/constitution.md` | Engineering principles -- read before writing any code |
| `.specify/infrastructure.md` | Hosting and vendors (Google Cloud + AWS messaging), sign-in flow, DB session setup, jobs, local dev, cost |
| `.specify/schema.ts` | Database schema (38 Drizzle pgTable definitions, source of truth) |
| `.specify/services.md` | Service boundaries, data ownership, dependencies |
| `.specify/trpc-router.md` | tRPC procedure specification (20 routers, all input/output types) |
| `.specify/charting-ux.md` | Screen specs, component catalog, UX flows, accessibility |
| `.specify/ai-pipeline.md` | Lomi AI: prompts, models, fallback, rate limits |
| `.specify/ai-voice-analysis.md` | **Voice architecture decision: batch vs real-time, per-section editing** |
| `.specify/security.md` | Auth, PHI handling, encryption, breach response |
| `.specify/rls.sql` | Row-Level Security policies and integrity triggers (column, state-transition and audit rules RLS can't express) |
| `.specify/openapi.yaml` | External API (EVV, reports, exports, webhooks) |
| `.specify/design-system.md` | **Visual identity: exact colors, fonts, radii, shadows from production CSS** |
| `.specify/notifications.md` | Notification types, escalation rules |
| `.specify/offline-sync.md` | PowerSync sync rules, conflict resolution |
| `.specify/folder-map.txt` | Full project directory structure |
| `.specify/frontend-spec-1.md` | **Frontend spec part 1**: design philosophy, layout architecture, components |
| `.specify/frontend-spec-2.md` | **Frontend spec part 2**: caregiver screens, Lomi UX, offline/PWA |
| `.specify/frontend-spec-3.md` | **Frontend spec part 3**: supervisor dashboard, component library, implementation |
| `.specify/frontend-audit.md` | Frontend design audit: 20 findings, 14 "keep this" items from MVP review |
| `.specify/charting-guide.md` | IDD charting patterns, Therap mental model matching |
| `.specify/competitive-research.md` | IDD competitor market research |
| `.specify/therap-research.md` | Deep competitive intel on TherapServices.net |
| `.specify/AGENTS.md` | Detailed agent instructions, patterns, domain constants |

## Rules

These are absolute. Do not deviate.

- **NO PHI in console.log or error messages.** Client names, health data, medications, DOBs, note content -- none of this goes into logs, error strings, URLs, or monitoring payloads. Use operation IDs only.
- **NO raw SQL.** Use Drizzle query builder. Every query must be scoped by `agency_id` for tenant isolation.
- **NO localStorage for data.** PowerSync handles all client-side persistence via OPFS. The only permitted client-side PHI cache is PowerSync's encrypted wa-sqlite database.
- **NO auto-submission of AI drafts.** Lomi output always goes through the review UI. Set `lomi_drafted = true`. Status starts at `draft`.
- **NO cross-tenant queries.** Every query filtered by `agency_id` via RLS. Cross-tenant data access is a severity-zero incident.
- **NO custom auth.** All auth goes through Identity Platform (Firebase Auth). No password storage, no custom JWTs, no hand-built session cookies (use Admin SDK session cookies), no tokens in localStorage or IndexedDB.
- **NO secrets in client bundle.** API keys and credentials live in Secret Manager, server-side only. The Firebase web config (API key, project ID) is the sole exception: it is a public identifier.
- **NO schema branching on charting preset.** Preset affects UI labels and form ordering only. Same schema, same API, same validation for `"therap"` and `"default"`.
- **NO deleting or editing MAR records.** Every MAR entry (given, refused, held) is irrevocable. Corrections are new records with `amends_id` referencing the original.
- **NO database access from the client.** Online writes go through tRPC, offline writes through `sync.upload`; reads come from PowerSync or tRPC. RLS and the triggers in `rls.sql` are the backstop, not the main validation.
- **NO calling OpenAPI from internal UI.** tRPC for all frontend-to-backend. OpenAPI is for external integrations only.

## Conventions

### Module boundaries (constitution principle 15)
- Shared business rules go in `src/lib/domain/` and import nothing outside it (no db, server, browser or Svelte). Phone and server use the same functions.
- Import services only through their `index.ts`. Database access only in `src/lib/server/db/` and `*.queries.ts`.
- Job handlers call services, never UI code. ESLint enforces these rules.

### File naming
- kebab-case for TypeScript files: `charting-preset.ts`, `coverage-timeout.ts`
- PascalCase for Svelte components: `GoalPicker.svelte`, `NoteReview.svelte`

### Svelte 5
- Use runes: `$state`, `$derived`, `$effect`
- Do NOT use legacy reactive declarations (`$:`) or legacy stores (`writable`, `readable`) in new code
- Pass data via props, not global stores (stores only for auth and sync state)

### SvelteKit 3
- App imports use `#lib/...` **with the file extension**: `#lib/server/identity.ts`, `#lib/server/services/auth/index.ts`. Relative imports inside a folder stay extensionless.
- Environment variables are declared in `src/env.ts` (`defineEnvVars`) and imported from `$app/env/public` / `$app/env/private`. Server modules that also run in scripts and tests read `process.env`, using server-side names (SvelteKit keeps `PUBLIC_*` out of server code).
- Hook types come from `@sveltejs/kit/hooks`; `dev` / `browser` from `$app/env`; navigate with `goto(resolve('/path'))`.

### tRPC
- One router file per domain in `src/lib/server/trpc/routers/`
- Zod for input validation in every procedure
- Middleware chain: auth (always) -> requireFeature (if gated) -> role (if needed) -> audit context (mutations)
- Offline writes go through `sync.upload`, which calls the same service functions as the online procedures.
- Every procedure runs inside `withUser()` (sets `app_user` role and `app.claims`); job handlers use `withService()`. These helpers are the only raw SQL in the app (infrastructure.md §4).
- Types flow to frontend automatically -- no manual type exports

### Services
- One directory per service under `src/lib/server/services/`
- Public API in `index.ts`, queries in `*.queries.ts`, types in `*.types.ts`
- Every function takes the transaction (`tx`, from `ctx.db` in tRPC) and then `agencyId` as its first arguments, so it runs inside the caller's `withUser()` transaction
- Don't write audit rows yourself for table changes: the `audit_row_change` trigger (rls.sql) records every INSERT/UPDATE/DELETE on audited tables. Call `audit.logEvent()` only for actions that don't change a row (PHI reads, exports, AI invocations).

### Database
- All tables include `agency_id` FK (except system config tables without PHI)
- All tables include `created_at` and `updated_at` with timezone
- Migrations generated by Drizzle -- never hand-edit generated SQL in `drizzle/`
- New tables must have RLS policies added to `rls.sql`

### Tests
- Mirror `src/` structure under `tests/` (unit, integration, e2e)
- Never use production or real patient data
- Unit tests for services, integration tests for tRPC, e2e for critical flows

## Environment Variables

```bash
# Google Cloud (server-only; credentials come from the Cloud Run service account)
GOOGLE_CLOUD_PROJECT=            # Project ID
GOOGLE_CLOUD_REGION=             # e.g. us-central1
DATABASE_URL=                    # Local dev only; in Cloud Run use the Cloud SQL connector
CLOUD_SQL_INSTANCE=              # project:region:instance (Cloud Run)
TASKS_QUEUE_PREFIX=              # Cloud Tasks queue location/prefix
WORKER_URL=                      # worker service URL that Cloud Tasks calls
WORKER_SERVICE_ACCOUNT=          # identity Cloud Tasks signs OIDC tokens as
EXPORTS_BUCKET=                  # Cloud Storage bucket for report exports

# Identity Platform
PUBLIC_FIREBASE_API_KEY=         # Public web config (not a secret)
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
FIREBASE_AUTH_EMULATOR_HOST=     # Local dev only, e.g. 127.0.0.1:9099

# AI (server-only)
VERTEX_REGION=                   # Region serving Claude on Vertex AI (or "global")
LOMI_MODEL=                      # Claude model ID on Vertex AI (default: Sonnet)
LOMI_FAST_MODEL=                 # Claude model ID for classifiers/edits (default: Haiku)
STT_RECOGNIZER=                  # Speech-to-Text v2 recognizer (Chirp)

# AWS messaging (server-only; no keys, uses workload identity federation)
AWS_REGION=
AWS_ROLE_ARN=                    # IAM role trusted for the worker's Google identity
SES_FROM_ADDRESS=
SMS_ORIGINATION_IDENTITY=        # 10DLC phone number ID
SMS_CONFIGURATION_SET=

# PowerSync and device keys
PUBLIC_POWERSYNC_URL=            # PowerSync service URL
DEVICE_KEY_KEK=                  # 32-byte base64url key that encrypts device_keys (Secret Manager)
PS_DEV_JWT_KEY=                  # Local dev only: signs PowerSync tokens while the Auth emulator is in use
```

## Domain Quick Reference

- **Four pillars:** Care Records, Scheduling, Timekeeping, Client Intake
- **Roles:** caregiver < supervisor < admin (hierarchy for roleMiddleware)
- **Shifts:** AM 07-15, PM 15-23, ON 23-07
- **Note lifecycle:** draft -> submitted (caregiver signs) -> approved | returned (supervisor)
- **Prompt levels:** Independent, Verbal prompt, Gestural prompt, Model, Partial physical, Full physical, Refused
- **Vital thresholds:** temp 95-100.4, pulse 50-100, systolic 90-140, diastolic 60-90
- **Charting presets:** `"therap"` (T-Log, GER, ISP Data, eMAR) vs `"default"` (Shift Note, Behavior Note, Goals, Medications)

## What to Read When

| Task | Read first (file, lines, section) |
|------|-----------|
| Working on shift note compose/review | `mvp/src/app-caregiver.js`, `frontend-spec-2.md` lines 114-442 (§3.2 Shift Note Creation), `ai-pipeline.md` |
| Working on goal/ISP scoring | `mvp/src/app-caregiver.js`, `frontend-spec-2.md` lines 443-527 (§3.3 Goal/ISP Scoring) |
| Working on medications/MAR | `mvp/src/app-caregiver.js`, `frontend-spec-2.md` lines 528-676 (§3.4 Medication Administration), `charting-ux.md` (section 4.5) |
| Working on vitals entry | `mvp/src/app-caregiver.js`, `frontend-spec-2.md` lines 677-779 (§3.5 Health Vital Entry) |
| Working on incident reports | `mvp/src/app-caregiver.js`, `frontend-spec-2.md` lines 780-912 (§3.6 Incident Report Wizard) |
| Working on messaging/SComm | `frontend-spec-2.md` lines 913-967 (§3.7 Messages/SComm) |
| Working on clock-in/timekeeping | `mvp/src/app-main.js`, `mvp/src/geo.js`, `frontend-spec-2.md` lines 968-1060 (§3.8 Clock In/Out), `services.md` |
| Working on person detail view | `frontend-spec-2.md` lines 1061-1167 (§3.9 Person Detail View) |
| Working on caregiver nav | `frontend-spec-2.md` lines 1168-1213 (§3.10 Bottom Tab Navigation) |
| Working on Lomi AI UX | `mvp/src/lomi.js`, `mvp/src/prompts.js`, `ai-pipeline.md`, `frontend-spec-2.md` lines 1214-1559 (§6 AI/Lomi UX) |
| Working on offline/PWA UX | `offline-sync.md`, `frontend-spec-2.md` lines 1560-1867 (§8 Offline & PWA UX) |
| Working on supervisor overview | `mvp/src/app-office.js`, `frontend-spec-3.md` lines 22-276 (§4.1 Overview Dashboard) |
| Working on note review/approval | `mvp/src/app-office.js`, `frontend-spec-3.md` lines 277-425 (§4.2 Note Review & Approval) |
| Working on schedule management | `mvp/src/app-office.js`, `frontend-spec-3.md` lines 426-558 (§4.3 Schedule Management) |
| Working on analytics/reports | `frontend-spec-3.md` lines 559-736 (§4.4 Analytics, §4.5 Reports) |
| Working on staff/individual mgmt | `frontend-spec-3.md` lines 737-1040 (§4.6 Staff, §4.7 Individual, §4.8 Agency Settings) |
| Working on any UI component | `mvp/styles.css`, `design-system.md`, `frontend-spec-1.md` lines 448-604 (§2.7 Component Tokens), `frontend-spec-3.md` lines 1041-2017 (§5 Component Library) |
| Working on design system tokens | `frontend-spec-1.md` lines 23-445 (§2 Design System: colors, type, spacing, elevation, radius, motion) |
| Working on accessibility | `frontend-spec-1.md` lines 607-752 (§9 Accessibility) |
| Working on dark mode | `frontend-spec-1.md` lines 755-1016 (§10 Dark Mode) |
| Working on navigation/routing | `frontend-spec-3.md` lines 2018-2161 (§7 Navigation & IA) |
| Working on scheduling/coverage | `mvp/src/app-office.js`, `mvp/src/app-core.js`, `services.md`, `trpc-router.md` |
| Working on client intake | `services.md` (Intake Service), `trpc-router.md` (intake section) |
| Working on auth or roles | `security.md`, `rls.sql`, `trpc-router.md` (context + middleware) |
| Working on notifications | `notifications.md`, `services.md` (Notification Service) |
| Adding a new table | `schema.ts`, `rls.sql`, `services.md` |
| Working on the external API | `openapi.yaml` |
| Understanding IDD charting patterns | `charting-guide.md`, `competitive-research.md`, `therap-research.md` |
| Implementation priority/phases | `frontend-spec-3.md` lines 2210-2289 (§13 Implementation Priority) |
