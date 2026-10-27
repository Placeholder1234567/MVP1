# Guad

Charting, scheduling and shift coverage for agencies that support people with intellectual and developmental disabilities. Lomi offers optional AI-assisted charting with human review. Coverage currently uses eligibility rules and templated outreach, not model-generated staffing decisions.

> **Status: early build.** Use synthetic data only. No real client information goes into any environment until the checklist in `.specify/infrastructure.md` §8 is done.

The default local demo does not connect a live drafting model or transcription provider. Lomi sorts typed observations without rewriting them; staff review the result before using it. Connected drafting, revisions and summaries still require actual quality evaluation before their AI promises can be accepted. See [AI acceptance evidence](docs/ai-acceptance.md) and the [completion milestone](docs/completion-milestone.md).

## What's here

| Path                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/`               | SvelteKit 3 + Svelte 5 app with Cloud Run deployment configuration                                   |
| `src/lib/domain/`    | Business rules shared by the phone and the server (shifts, doses, notes, geofence, vitals, coverage) |
| `src/lib/server/db/` | Database connection and the `withUser()` / `withService()` helpers                                   |
| `.specify/`          | Architecture specs. Start with `constitution.md` and `infrastructure.md`                             |
| `drizzle/`           | Generated SQL migrations (from `.specify/schema.ts`)                                                 |
| `mvp/`               | The original vanilla-JS prototype, kept as the reference for behavior and design                     |

## Run it locally

Needs Node 22+ and Docker.

```bash
npm install
cp .env.example .env
npm run db:up        # Postgres 16, PowerSync (:8080), Mailpit (email viewer at http://localhost:8025)
npm run db:setup     # migrations, RLS policies, integrity triggers, grants
npm run dev:auth     # Firebase Auth emulator (separate terminal; needs Java 11+)
npm run db:seed      # synthetic demo agency; staff sign in with DEV_PASSWORD from src/lib/server/seed.ts
npm run dev          # http://localhost:5173
```

## Checks

```bash
npm test                  # unit tests (domain rules)
npm run test:integration  # database + sign-in tests (needs db:up and db:setup; starts its own Auth emulator)
npm run lint              # ESLint (incl. import boundaries) + svelte-check
npm run spec:lint         # cross-spec consistency
npm run spec:rls-test     # SQL-level RLS and trigger tests (starts its own Postgres)
```

CI runs all of these on every pull request.
