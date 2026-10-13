# Guad

Documentation, scheduling and AI-assisted shift coverage for agencies that support people with intellectual and developmental disabilities. Lomi is Guad's AI assistant.

> **Status: prototype.** Data is stored in the browser (`localStorage`) and there are no real user accounts. Do not enter real client information until the production checklist below is done.

## What's included

**Caregivers (phone or computer)**
- Clock in at a home, with GPS check-in against each home's location and radius
- Today's people and tasks for the home they're clocked in at
- Shift notes and behavior notes drafted by Lomi from a spoken or typed description, then reviewed and signed
- Goal data by attempt and prompt level, vague-wording flags, and incident detection
- Medications (scheduled and as-needed, with reasons and effect), health (vitals, seizures, illness, visits), attendance and incident reports
- Shifts: schedule, "Can't make it" callouts, and shift offers from Lomi
- Home team messages

**Supervisors and admins**
- Home switcher with an "All homes" view
- Overview with Lomi's summary and a single "needs your attention" list, including check-ins outside a home's area
- Schedule by home and week, open shifts filled by Lomi, and the full coverage timeline
- Notes review (approve or send back), incidents with required notifications, medications, health
- People: details, goals (with templates), medications with history, attendance and case notes
- Analytics computed from the event log, and CSV reports
- Setup for homes (address, coordinates, check-in radius) and staff (role, medication certification, homes)

## Project structure

```
index.html            Page shell; loads the scripts below in order
styles.css            Design system (Figtree, Georgia, blue and lemon)
src/store.js          Data layer (localStorage for now; swap for your backend)
src/geo.js            Distance math and device location
src/prompts.js        Lomi's prompts, shared by browser and server
src/lomi.js           Browser client for Lomi, with a rules-based fallback
src/app-core.js       State helpers, scheduling and the coverage engine
src/app-caregiver.js  Setup, sign-in and caregiver screens
src/app-office.js     Supervisor and admin screens, analytics and reports
src/app-main.js       Rendering and all user actions
api/lomi.js           Serverless function that calls Claude with your API key
```

No build step: it's plain HTML, CSS and JavaScript.

## Run it locally

```bash
npx vercel dev         # serves the site and /api/lomi at http://localhost:3000
```

Run Vercel directly rather than through `npm run dev`. The project does not
define an npm `dev` script because Vercel can otherwise invoke that script
recursively when its Development Command is configured as `npm run dev`.

If a linked Vercel project still has that stale Development Command, run
`npx vercel dev --local` or clear **Project Settings → Build and Deployment →
Development Command** in Vercel.

Create a `.env.local` from `.env.example` and add your `ANTHROPIC_API_KEY` and
`OPENAI_API_KEY`. Without the Anthropic key, Lomi falls back to simple rules.
The OpenAI key powers cross-browser microphone transcription through
`/api/transcribe`; it is never exposed to the browser.

Location only works on `https://` or `localhost`, and the browser will ask for permission.
Microphone recording also requires `https://` or `localhost` and microphone
permission. Audio is sent to the transcription endpoint only after the staff
member stops recording.

## Deploy to Vercel

1. Push this folder to your GitHub repo.
2. In Vercel, import the repo (no framework preset needed).
3. Add `ANTHROPIC_API_KEY` under Project Settings → Environment Variables.
4. Deploy. The app is served at `/`, and Lomi runs at `/api/lomi`.

API reference for the Lomi function: https://docs.claude.com/en/api/overview

### Protect the API routes

`/api/lomi` and `/api/transcribe` spend your Anthropic and OpenAI credits, and
there are no user accounts yet. `api/_guard.js` rejects requests that don't come
from the app's own pages and rate-limits each IP address, but a script can fake
the Origin header. For any deployment with real API keys:

1. Turn on **Project Settings → Deployment Protection** in Vercel (password or
   Vercel Authentication) so only your team can open the app or its API.
2. If the app is served from more than one domain, list the extra hosts in
   `GUAD_ALLOWED_ORIGINS` (comma-separated, e.g. `guad.example.org`).

## How location check-in works

- Each home has latitude, longitude and a radius (default 150 m). Admins set these in **Setup**, either by typing coordinates or by tapping **Use my location** while standing at the home.
- When a caregiver taps **Find my location**, Guad ranks their assigned homes by distance (`src/geo.js`) and suggests the one they're inside.
- They can still clock in at any assigned home. If they're outside the radius, or location is unavailable, the clock-in is saved with `manual: true` and shows up for supervisors to review.
- Every clock-in stores time, home, coordinates, accuracy and distance, and is exportable from **Reports → Clock-ins**.

This is a check-in record, not certified EVV. State EVV systems have their own requirements and approval process.

## How Lomi coverage works

`startCoverage()` in `src/app-core.js`:
1. Marks the shift as being filled and logs the callout.
2. Checks every staff member: assigned to that home, not already working that day, under 40 hours, and medication-certified if meds are due.
3. Offers the shift to everyone eligible at once. In this version the offer appears in each person's Shifts tab.
4. The first person to accept gets the shift; the schedule, team channel and timeline update.

**Next step for production:** send offers by text or phone (for example with Twilio), and handle replies on the server.

## Analytics

Every meaningful action is appended to `state.events` with a type, timestamp, home and staff member (for example `shift.called_out`, `shift.filled`, `note.signed`, `med.refused`, `incident.reported`, `clock.in`). The Analytics page groups these by week. In production, keep this as an append-only events table and build reports from it.

## Production checklist (before real client data)

- [ ] Replace `src/store.js` with a HIPAA-ready backend: encrypted database, per-user access by role and home, append-only audit log, backups
- [ ] Real authentication (replace the development sign-in screen) and staff invitations
- [ ] Signed BAAs with your host, database and AI provider
- [ ] Protect `/api/lomi` and `/api/transcribe`: require a signed-in session (today they only have a same-site check and a per-IP rate limit), and never log note text
- [ ] Per-person vital sign limits set by a nurse (`LIM` in `src/app-core.js` is a placeholder)
- [ ] Your state's incident reporting rules and deadlines (`notifRules` in `src/app-core.js` is a placeholder)
- [ ] Medication records connected to prescriber orders, with nurse oversight
- [ ] Security review and penetration test
- [ ] Privacy policy, terms and data retention policy
