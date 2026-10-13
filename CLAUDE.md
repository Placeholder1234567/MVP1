# CLAUDE.md -- Claude Code Instructions for Guad

## Quick Start

```bash
npm install
npx supabase start          # Local Postgres + Auth (or set SUPABASE_URL + SUPABASE_ANON_KEY)
npx drizzle-kit push        # Push schema to database
npm run dev                 # SvelteKit dev server at http://localhost:5173
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | SvelteKit dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run vitest (unit + integration) |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run db:generate` | Generate Drizzle migration from schema changes |
| `npm run db:push` | Push schema to database (dev) |
| `npm run db:studio` | Open Drizzle Studio (database browser) |
| `npm run lint` | ESLint + svelte-check |
| `npm run format` | Prettier |

## MVP Reference (read before building UI)

The working MVP prototype is in the project root. These files are the ground truth for how features look and behave:

| File | Read it for |
|------|------------|
| `styles.css` | **Complete visual identity** — every color, font, radius, shadow, animation. Port exactly. |
| `src/app-caregiver.js` | Caregiver screens, interactions, rendering logic |
| `src/app-office.js` | Supervisor dashboard, review flows, management screens |
| `src/app-core.js` | Business logic, constants (vitals, shifts, prompt levels), helpers |
| `src/app-main.js` | Event handling, state management, all user action flows |
| `src/store.js` | Data model shape, seed data |
| `src/lomi.js` | AI client, rules-based fallback, vague word detection |
| `src/prompts.js` | Exact prompt templates for AI drafting |
| `src/geo.js` | Geofence logic (haversine, rankHomes) |

**When the spec and MVP code disagree on behavior, flag it — don't silently pick one.**

## Architecture

Read `.specify/` for full specs. Key files:

| File | What to read it for |
|------|---------------------|
| `.specify/constitution.md` | Engineering principles -- read before writing any code |
| `.specify/schema.ts` | Database schema (30 Drizzle pgTable definitions, source of truth) |
| `.specify/services.md` | Service boundaries, data ownership, dependencies |
| `.specify/trpc-router.md` | tRPC procedure specification (20 routers, all input/output types) |
| `.specify/charting-ux.md` | Screen specs, component catalog, UX flows, accessibility |
| `.specify/ai-pipeline.md` | Lomi AI: prompts, models, fallback, rate limits |
| `.specify/ai-voice-analysis.md` | **Voice architecture decision: batch vs real-time, per-section editing** |
| `.specify/security.md` | Auth, PHI handling, encryption, breach response |
| `.specify/rls.sql` | Row-Level Security policies for all tables |
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
- **NO custom auth.** All auth goes through Supabase Auth. No custom JWTs, no custom session cookies, no tokens in localStorage.
- **NO secrets in client bundle.** API keys, AWS/Azure credentials, Twilio tokens -- server-side env vars only. Supabase anon key is the sole exception.
- **NO schema branching on charting preset.** Preset affects UI labels and form ordering only. Same schema, same API, same validation for `"therap"` and `"default"`.
- **NO deleting MAR records.** `given` entries are irrevocable. Corrections are amendments referencing the original.
- **NO calling OpenAPI from internal UI.** tRPC for all frontend-to-backend. OpenAPI is for external integrations only.

## Conventions

### File naming
- kebab-case for TypeScript files: `charting-preset.ts`, `coverage-timeout.ts`
- PascalCase for Svelte components: `GoalPicker.svelte`, `NoteReview.svelte`

### Svelte 5
- Use runes: `$state`, `$derived`, `$effect`
- Do NOT use legacy reactive declarations (`$:`) or legacy stores (`writable`, `readable`) in new code
- Pass data via props, not global stores (stores only for auth and sync state)

### tRPC
- One router file per domain in `src/lib/server/trpc/routers/`
- Zod for input validation in every procedure
- Middleware chain: auth (always) -> requireFeature (if gated) -> role (if needed) -> audit context (mutations)
- Offline writes go through `sync.upload`, which calls the same service functions as the online procedures. Never write to Supabase REST from the client.
- Types flow to frontend automatically -- no manual type exports

### Services
- One directory per service under `src/lib/server/services/`
- Public API in `index.ts`, queries in `*.queries.ts`, types in `*.types.ts`
- Every function takes `agencyId` as first argument
- Don't write audit rows yourself for table changes: the `audit_row_change` trigger (rls.sql) records every INSERT/UPDATE/DELETE on audited tables. Call `audit.logEvent()` only for actions that don't change a row (PHI reads, exports, AI invocations).

### Database
- All tables include `agency_id` FK (except system config tables without PHI)
- All tables include `created_at` and `updated_at` with timezone
- Migrations generated by Drizzle -- never hand-edit SQL in `supabase/migrations/`
- New tables must have RLS policies added to `rls.sql`

### Tests
- Mirror `src/` structure under `tests/` (unit, integration, e2e)
- Never use production or real patient data
- Unit tests for services, integration tests for tRPC, e2e for critical flows

## Environment Variables

```bash
# Supabase
SUPABASE_URL=                    # Supabase project URL
SUPABASE_ANON_KEY=               # Supabase anon key (safe for client)
SUPABASE_SERVICE_ROLE_KEY=       # Server-only, never in client bundle
DATABASE_URL=                    # Direct Postgres connection for Drizzle

# AI (server-only)
AWS_BEDROCK_REGION=              # AWS region for Bedrock
AWS_ACCESS_KEY_ID=               # AWS credentials for Bedrock + SES
AWS_SECRET_ACCESS_KEY=
LOMI_MODEL=                     # Bedrock model ID (default: claude-sonnet)
AZURE_OPENAI_ENDPOINT=           # Azure OpenAI for Whisper
AZURE_OPENAI_API_KEY=

# Notifications (server-only)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
FCM_SERVER_KEY=                  # Firebase Cloud Messaging

# Jobs (server-only)
REDIS_URL=                       # Redis for BullMQ

# PowerSync
POWERSYNC_URL=                   # PowerSync instance URL
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
| Working on shift note compose/review | `src/app-caregiver.js`, `frontend-spec-2.md` lines 114-442 (§3.2 Shift Note Creation), `ai-pipeline.md` |
| Working on goal/ISP scoring | `src/app-caregiver.js`, `frontend-spec-2.md` lines 443-527 (§3.3 Goal/ISP Scoring) |
| Working on medications/MAR | `src/app-caregiver.js`, `frontend-spec-2.md` lines 528-676 (§3.4 Medication Administration), `charting-ux.md` (section 4.5) |
| Working on vitals entry | `src/app-caregiver.js`, `frontend-spec-2.md` lines 677-779 (§3.5 Health Vital Entry) |
| Working on incident reports | `src/app-caregiver.js`, `frontend-spec-2.md` lines 780-912 (§3.6 Incident Report Wizard) |
| Working on messaging/SComm | `frontend-spec-2.md` lines 913-967 (§3.7 Messages/SComm) |
| Working on clock-in/timekeeping | `src/app-main.js`, `src/geo.js`, `frontend-spec-2.md` lines 968-1060 (§3.8 Clock In/Out), `services.md` |
| Working on person detail view | `frontend-spec-2.md` lines 1061-1167 (§3.9 Person Detail View) |
| Working on caregiver nav | `frontend-spec-2.md` lines 1168-1213 (§3.10 Bottom Tab Navigation) |
| Working on Lomi AI UX | `src/lomi.js`, `src/prompts.js`, `ai-pipeline.md`, `frontend-spec-2.md` lines 1214-1559 (§6 AI/Lomi UX) |
| Working on offline/PWA UX | `offline-sync.md`, `frontend-spec-2.md` lines 1560-1867 (§8 Offline & PWA UX) |
| Working on supervisor overview | `src/app-office.js`, `frontend-spec-3.md` lines 22-276 (§4.1 Overview Dashboard) |
| Working on note review/approval | `src/app-office.js`, `frontend-spec-3.md` lines 277-425 (§4.2 Note Review & Approval) |
| Working on schedule management | `src/app-office.js`, `frontend-spec-3.md` lines 426-558 (§4.3 Schedule Management) |
| Working on analytics/reports | `frontend-spec-3.md` lines 559-736 (§4.4 Analytics, §4.5 Reports) |
| Working on staff/individual mgmt | `frontend-spec-3.md` lines 737-1040 (§4.6 Staff, §4.7 Individual, §4.8 Agency Settings) |
| Working on any UI component | `styles.css`, `design-system.md`, `frontend-spec-1.md` lines 448-604 (§2.7 Component Tokens), `frontend-spec-3.md` lines 1041-2017 (§5 Component Library) |
| Working on design system tokens | `frontend-spec-1.md` lines 23-445 (§2 Design System: colors, type, spacing, elevation, radius, motion) |
| Working on accessibility | `frontend-spec-1.md` lines 607-752 (§9 Accessibility) |
| Working on dark mode | `frontend-spec-1.md` lines 755-1016 (§10 Dark Mode) |
| Working on navigation/routing | `frontend-spec-3.md` lines 2018-2161 (§7 Navigation & IA) |
| Working on scheduling/coverage | `src/app-office.js`, `src/app-core.js`, `services.md`, `trpc-router.md` |
| Working on client intake | `services.md` (Intake Service), `trpc-router.md` (intake section) |
| Working on auth or roles | `security.md`, `rls.sql`, `trpc-router.md` (context + middleware) |
| Working on notifications | `notifications.md`, `services.md` (Notification Service) |
| Adding a new table | `schema.ts`, `rls.sql`, `services.md` |
| Working on the external API | `openapi.yaml` |
| Understanding IDD charting patterns | `charting-guide.md`, `competitive-research.md`, `therap-research.md` |
| Implementation priority/phases | `frontend-spec-3.md` lines 2210-2289 (§13 Implementation Priority) |
