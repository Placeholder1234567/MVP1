# Guad

Charting, scheduling and AI-assisted shift coverage for agencies that support people with intellectual and developmental disabilities. Lomi is Guad's AI assistant.

> **Status: early build.** Use synthetic data only. No real client information goes into any environment until the checklist in `.specify/infrastructure.md` §8 is done.

## What's here

| Path                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/`               | Production app: SvelteKit 3 + Svelte 5, deployed to Google Cloud Run                                 |
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
npm run db:up        # Postgres 16 + Mailpit (email viewer at http://localhost:8025)
npm run db:setup     # migrations, RLS policies, integrity triggers, grants
npm run dev          # http://localhost:5173
```

## Checks

```bash
npm test                  # unit tests (domain rules)
npm run test:integration  # database tests (needs db:up and db:setup)
npm run lint              # ESLint (incl. import boundaries) + svelte-check
npm run spec:lint         # cross-spec consistency
npm run spec:rls-test     # SQL-level RLS and trigger tests (starts its own Postgres)
```

CI runs all of these on every pull request.
