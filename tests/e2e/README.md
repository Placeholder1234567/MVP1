# Browser and accessibility checks

The suite uses Chromium at 1280px and 390px against the real built app, Auth emulator,
Postgres and PowerSync. It covers sign-in/PIN setup, explicit note signatures,
supervisor approval, idle and clock-rollback locking, wrong PINs, retained unsaved
text, offline cold reload, queued drafts and reconnect. Axe scans key screens for
WCAG 2.1 A/AA rules and checks horizontal overflow. This is regression coverage,
not certification or a substitute for manual screen-reader and physical-device tests.

Use a dedicated disposable **local test database**. The runner seeds synthetic
`@guad.test` accounts and refuses non-loopback services or non-`demo-*` projects.
It does not reset data or clear existing emulator accounts. Do not run it against
a development database containing identities with those addresses; use a fresh
test database/emulator instead. It never connects to real identity/cloud services.

1. Install dependencies with `npm ci`, then `npx playwright install chromium`.
2. Copy `.env.example` to `.env` for the isolated test environment.
3. Start the local Postgres/PowerSync/Mailpit stack and run `npm run db:setup`.
4. Run `npm run test:e2e`. It builds for port 4175, starts its own Auth emulator,
   seeds synthetic fixtures and runs the suite. Port 9099 must be available.

CI runs this in a fresh job with dedicated containers. Failure traces/screenshots
contain synthetic data only and expire after seven days. No real client data or
real credentials belong in fixtures or artifacts. The test runner disables retries
so failures cannot be silently masked.

References: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
and [clock emulation](https://playwright.dev/docs/clock).
