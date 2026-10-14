# AGENTS.md -- Guad Coding Agent Instructions

## Project Overview

Guad ("friend" in Amharic) is a HIPAA-compliant charting and operations platform for IDD residential care agencies. DSPs document shift activities, administer medications, track ISP goals, record vitals, and report incidents from their phones. Supervisors review notes, manage schedules, and run audit reports. Lomi ("lemon" in Amharic) is the built-in AI assistant that drafts clinical notes, covers shift callouts via SMS, and generates daily summaries. The stack is SvelteKit 2 + Svelte 5 runes (PWA) on Google Cloud Run, tRPC (internal API), Cloud SQL Postgres with RLS, Identity Platform (auth), Drizzle ORM, self-hosted PowerSync (offline-first), Claude on Vertex AI (note drafting), Google Speech-to-Text (transcription), Cloud Tasks + Cloud Scheduler (jobs), FCM push plus Amazon SES email and AWS End User Messaging SMS (notifications). infrastructure.md has the full picture. All architecture specs live in the `.specify/` directory.

## Architecture Reference

Before writing any code, read the relevant `.specify/` files:

| File | Contains |
|------|----------|
| `constitution.md` | Non-negotiable engineering principles (15 rules). Read this first. |
| `schema.ts` | Drizzle pgTable definitions for all 37 tables. This is the single source of truth for the data model. |
| `services.md` | Service boundaries, data ownership matrix, dependency graph, job registry (Cloud Tasks). |
| `infrastructure.md` | Hosting and vendors (Google Cloud + AWS messaging), sign-in flow, database session setup, jobs, local dev, cost. |
| `trpc-router.md` | Every tRPC procedure: input/output types, required role, behavior. |
| `charting-ux.md` | Screen-by-screen UX spec, component catalog, accessibility requirements, charting preset system. |
| `ai-pipeline.md` | Lomi AI: prompts, model config, fallback strategy, HIPAA compliance, rate limits. |
| `security.md` | Threat model, auth flows, PHI inventory, encryption, breach response, BAA matrix. |
| `rls.sql` | Row-Level Security policies for every table, plus integrity triggers (privileged columns, note transitions, MAR immutability, server-side clock verification, audit). Tested by `tests/rls/run.sh`. |
| `openapi.yaml` | External API spec (EVV, reports, exports, webhooks). |
| `notifications.md` | Notification types, channels, escalation rules, user preferences. |
| `offline-sync.md` | PowerSync sync rules, conflict resolution, data lifecycle on device. |
| `frontend-spec-1.md` | Frontend spec part 1: design philosophy, layout architecture, components. |
| `frontend-spec-2.md` | Frontend spec part 2: caregiver screens, Lomi UX, offline/PWA UX. |
| `frontend-spec-3.md` | Frontend spec part 3: supervisor dashboard, component library, implementation priority. |
| `frontend-audit.md` | Design audit of MVP: 20 findings, 14 items to preserve. |
| `charting-guide.md` | IDD charting patterns, Therap mental model matching, implementation priorities. |
| `competitive-research.md` | IDD competitor market research (Therap, Brittco, MediSked, CentralReach). |
| `therap-research.md` | Deep competitive intel on TherapServices.net (modules, pricing, gaps). |
| `folder-map.txt` | Complete project directory structure with annotations. |

## MVP Reference Implementation

The working MVP prototype lives in `mvp/`. Other specs cite these files without the folder (e.g. `styles.css:101`, `src/app-core.js`); those always mean the copy under `mvp/`. **Read these files before building any UI component** — they contain the actual implementation logic, interaction patterns, and rendering behavior that the new SvelteKit build must replicate:

| File | What it contains | Read it when |
|------|-----------------|--------------|
| `mvp/styles.css` | **Complete design system.** Every CSS custom property, color, font, radius, shadow, animation, layout. This is the visual identity — port it exactly. | Any UI work |
| `mvp/src/app-caregiver.js` | Caregiver screens: Today view, person detail, note compose (voice + Lomi orb), note review (sections, goal picker, flags, incident detection), MAR, health entry, incident wizard, messages, shifts, profile. | Building caregiver routes |
| `mvp/src/app-office.js` | Supervisor dashboard: overview stats, schedule grid, note review/approve/send-back, incident review, medication table, people management (goals, meds, attendance, case notes), analytics, reports, setup. | Building supervisor routes |
| `mvp/src/app-core.js` | Business logic and constants: vital thresholds, shift labels, prompt levels, services list, coverage engine, note normalization, CSV export, date helpers. | Implementing services or validation |
| `mvp/src/app-main.js` | Event handling, rendering loop, state management, clock-in/out flow, Lomi draft/summary flow, note signing, incident submission, all user actions. | Understanding interaction flows |
| `mvp/src/store.js` | Data model (emptyState shape), localStorage persistence, seed data generator. | Understanding data structures |
| `mvp/src/lomi.js` | AI client: draft/summarize functions, rules-based fallback, vague word detection, incident regex. | Implementing Lomi service |
| `mvp/src/prompts.js` | Prompt templates for shift notes, behavior notes, summaries. Exact prompt text. | Implementing AI pipeline |
| `mvp/src/geo.js` | Haversine distance, currentPosition wrapper, rankHomes, formatDistance. | Implementing clock-in geofence |

**The MVP is the ground truth for how features behave.** The `.specify/` docs describe the architecture of the new system; the MVP code shows the actual UX logic to preserve. When the spec and the MVP code disagree on behavior, flag it — don't silently pick one.

## Critical Rules

These are non-negotiable. Violating any of these makes the code unshippable.

### 1. HIPAA: No PHI in logs or errors

Never log Protected Health Information (client names, health data, medications, notes, DOBs, guardian info) to `console.log`, `console.error`, error messages, monitoring payloads, URL parameters, or query strings. Use structured logging with PHI fields redacted. Error messages must reference only operation identifiers (e.g., "Could not save note (ref: n-3f8a)"), never patient data.

### 2. Tenant isolation via RLS

Every database query must be scoped to `agency_id`. Never bypass Row-Level Security. Use Drizzle's query builder -- no raw SQL without `agency_id` in the WHERE clause. RLS policies are defined in `rls.sql` and enforced at the Postgres level. Cross-tenant data leakage is a severity-zero incident.

### 3. Offline-first

Every UI feature must work offline. PowerSync (wa-sqlite + OPFS) handles local persistence and sync. Never fetch or write data that needs offline support outside PowerSync and `sync.upload`. Test every screen with network disabled. No spinners or "you're offline" dead ends -- degrade gracefully. Features that require connectivity (AI drafting, voice transcription, Lomi summary) must have explicit fallback behavior.

### 4. Drizzle schema is the type source

The database schema is defined exclusively in Drizzle `pgTable` definitions in `.specify/schema.ts` (and eventually `src/lib/server/db/schema.ts`). Use `InferSelectModel<typeof tableName>` for read types and `InferInsertModel<typeof tableName>` for write types. Never duplicate type definitions manually. If the Drizzle schema and the database diverge, the Drizzle schema is correct.

### 5. AI output is never auto-submitted

Lomi outputs are always shown in a review UI. AI-generated content is flagged (`lomi_drafted = true`) and visually labeled in the UI. Every AI draft enters the workflow as `draft` status and follows the same review/approval path as human-authored content. No AI output is persisted as a final clinical record without explicit human confirmation (tap-to-sign or PIN).

### 6. Identity Platform only

All authentication flows go through Google Cloud Identity Platform (Firebase Auth SDK in the browser, Firebase Admin SDK on the server). Never store tokens in `localStorage`, `sessionStorage` or IndexedDB (use `inMemoryPersistence`). The session is an Identity Platform session cookie created with `createSessionCookie` and verified with `verifySessionCookie` in `hooks.server.ts`. The browser holds only the short-lived ID token in memory, because PowerSync needs it (security.md, Session Management; infrastructure.md §3). Never implement password storage, custom JWT generation or custom session management. Role-based access (caregiver, supervisor, admin) is enforced via the profile row and RLS policies.

### 7. Charting presets are cosmetic only

The `charting_preset` agency config (`"therap"` or `"default"`) changes UI labels (e.g., "T-Log" vs "Shift Note") and form field ordering. It never alters the database schema, API contracts, validation rules, or business logic. Read labels from `$lib/config/charting-preset.ts`. Never hardcode "Shift Note" or "T-Log" as string literals in components. Never branch schema or API logic based on preset.

### 8. MAR entries are irrevocable

Once a MAR entry is recorded (given, refused or held), it cannot be edited or deleted -- only amended with a new correction entry whose `amends_id` references the original. This matches constitution principle 13; the `mar_records_immutable` trigger enforces it. This maintains a complete medication administration history for regulatory compliance.

### 9. tRPC internal, OpenAPI external

All frontend-to-backend communication uses tRPC with end-to-end type safety. OpenAPI endpoints exist solely for external integrations (state reporting, EVV, data exports). No internal UI code calls OpenAPI endpoints.

### 10. Secrets never touch the client bundle

API keys, service credentials and database connection details exist only on the server (Secret Manager). Google Cloud and AWS access uses service account identities and workload identity federation, not long-lived keys. The SvelteKit client bundle contains zero secrets. The Firebase web config (API key, project ID) is the sole exception: it identifies the project and grants no data access on its own.

## Common Patterns

### Adding a new tRPC procedure

1. Define the Zod input schema in the router file under `src/lib/server/trpc/routers/`.
2. Add the procedure with the appropriate middleware chain: `authMiddleware` (always), `roleMiddleware(minRole)` (if elevated access needed), `auditMiddleware` (for mutations).
3. Implement the business logic in the owning service under `src/lib/server/services/`.
4. Types flow automatically to the frontend via tRPC -- no manual type export needed.
5. Update `trpc-router.md` to document the new procedure.

### Adding a new Svelte component

1. Create in the appropriate subdirectory under `src/lib/components/` (ui, charting, mar, health, schedule, dashboard, layout, etc.).
2. Use Svelte 5 runes: `$state`, `$derived`, `$effect`. Do not use legacy `writable`/`readable` stores.
3. Accept data via props, not global stores. Stores are for auth state and sync status only.
4. Ensure keyboard accessibility: all interactive elements reachable via Tab, proper ARIA attributes, `role`, `aria-pressed`, `aria-label` on icon buttons.
5. Touch targets: 44x44px minimum.
6. Respect `prefers-reduced-motion: reduce` -- replace animations with static states.
7. Read charting labels from the preset store, never hardcode terminology.

### Adding a new database table

1. Add the `pgTable` definition to `src/lib/server/db/schema.ts`.
2. Include `agency_id` as a non-nullable FK to `agencies` (unless it is a system-level config table with no PHI).
3. Add `created_at` and `updated_at` timestamp columns with `withTimezone: true`.
4. Add appropriate indexes (at minimum, an index on `agency_id`).
5. Run `npx drizzle-kit generate` to generate the migration SQL.
6. Review the generated migration.
7. Add RLS policies for the new table (SELECT, INSERT, UPDATE, DELETE as appropriate per role).
8. If the table contains PHI, add it to the audit log trigger list and update `security.md`.
9. Run `npx drizzle-kit push` (dev) or `npx drizzle-kit migrate` (production).

### Adding a new service

1. Create a directory under `src/lib/server/services/` with `index.ts`, `<name>.queries.ts`, and `<name>.types.ts`.
2. Every exported function receives `agencyId` as its first argument and passes it to all Drizzle queries.
3. Import from other services via their `index.ts` exports (same-process function calls, not network hops).
4. Don't write audit rows yourself for table changes: the `audit_row_change` trigger (rls.sql) records every INSERT/UPDATE/DELETE on audited tables. Call `audit.logEvent()` only for actions that don't change a row (PHI reads, exports, AI invocations).
5. Document the service in `services.md`: responsibility, owned tables, key functions, dependencies, jobs.

### Working with PowerSync (offline data)

1. Never query or write the database from the client. Data that needs offline support comes from PowerSync. Offline writes are uploaded through `sync.upload` (trpc-router.md), which runs the owning service's code.
2. Use PowerSync reactive queries in Svelte stores (`$lib/stores/sync.ts`).
3. Generate UUIDs client-side for new records (enables offline creation).
4. Design mutations to be idempotent where possible (upserts on natural keys).
5. Test the feature with the network disabled before considering it complete.

## Testing Requirements

- **Unit tests** for services: test business logic and pure functions. Mock the database.
- **Integration tests** for tRPC procedures: use a test database with seeded data. Verify RLS enforcement.
- **RLS tests**: verify that caregiver tokens cannot read data from other agencies or unassigned homes.
- **E2E tests** for critical flows: note creation through approval, MAR recording, incident reporting, clock-in with geofence.
- **Never use production data in tests.** Use synthetic seed data only.
- Test files mirror the `src/` structure under `tests/` (unit, integration, e2e).

## Domain Constants

Reference these when implementing validation, forms, and business logic:

- **Shifts:** AM (07:00-15:00), PM (15:00-23:00), ON (23:00-07:00)
- **Prompt levels (ISP goals):** Independent, Verbal prompt, Gestural prompt, Model, Partial physical, Full physical, Refused
- **Services (attendance):** In-home support, Day program, Community outing, etc.
- **Vital limits:** tempHi 100.4, tempLo 95, pulseHi 100, pulseLo 50, sysHi 140, sysLo 90, diaHi 90, diaLo 60. Operators: temp, systolic and diastolic flag at `>=` the high limit; pulse flags at `> 100` (tachycardia is defined as over 100); all lows flag at `<`.
- **Shift notes:** one per person per shift (am, pm, on). `notes.day` is the shift's start date, so an overnight note written at 2am belongs to the previous day.
- **Medications:** `scheduled_times` is an array; each dose slot gets its own MAR record.
- **Incident types:** Fall, Injury, Seizure, Medication error, Left without staff, Behavior with harm, Property damage, Other (matches `incident_type` in schema.ts)
- **Incident severity:** Low, Medium, High (title case, matches `incident_severity` in schema.ts)
- **Note statuses:** draft -> submitted -> approved | returned
- **Coverage statuses:** searching -> filled | unfilled
- **MAR statuses:** given, refused, held (all irrevocable; corrections are amendments)

## Code Style

- **File naming:** kebab-case for files (e.g., `charting-preset.ts`), PascalCase for Svelte components (e.g., `GoalPicker.svelte`).
- **Svelte 5 runes:** Use `$state`, `$derived`, `$effect`. No legacy `$:` reactive declarations or `writable`/`readable` stores in new code.
- **tRPC routers:** One router file per domain (e.g., `note.ts`, `mar.ts`, `schedule.ts`).
- **Services:** One directory per service with `index.ts` (public API), `*.queries.ts` (Drizzle helpers), `*.types.ts` (service types).
- **Imports:** Use `$lib/` alias for all library imports. Use `$lib/server/` for server-only code.
- **Error messages:** Never include PHI. Use operation identifiers and generic descriptions.
