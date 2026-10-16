# Security Audit (October 2026)

A code-level review against security.md, run on `main` after Phase 4. It is not a penetration test or a HIPAA certification; those still need an outside reviewer before real client data (security.md "BAA Checklist", infrastructure.md §8). Synthetic data only until then.

## Fixed in this review

| Finding | Risk | Fix |
|---|---|---|
| No Content-Security-Policy. security.md relies on "strict CSP against XSS" because the in-memory ID token is readable by JavaScript. | High | SvelteKit `csp` (vite.config.ts) with per-request nonces: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src` limited to Firebase Auth plus the runtime PowerSync/emulator origins (hooks.server.ts), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Checked in Chromium on a production build: sign-in, PIN setup, the encrypted wa-sqlite database and live sync work with no violations. |
| No HSTS, `nosniff`, framing or referrer headers (security.md "In Transit" requires HSTS). | Medium | `src/lib/server/security-headers.ts`: HSTS (production), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (microphone and location for this origin only; camera, payment and USB off), `Cross-Origin-Opener-Policy`. |
| No `handleError` hook: an unexpected error in a page load, `/auth/*`, a job or a webhook was logged with its full message, and Drizzle error messages include query parameters (client data). | Medium | `handleError` in hooks.server.ts logs an operation ID, the error name and the Postgres code only, and shows the user the operation ID. tRPC already did this (middleware.ts). |
| security.md listed `audit_log.agency_id` as `onDelete: 'cascade'`. | n/a | Already `restrict` in schema.ts; the spec text is corrected. |

## Checked and in place

- **Sign-in and sessions:** Identity Platform only. The session cookie is `HttpOnly`, `Secure` outside dev, `SameSite=Lax`, with a 12-hour maximum. Sign-out and deactivation revoke refresh tokens (identity.ts). Tokens carry only the user ID; claims are loaded from the profile row on every request.
- **CSRF:** the origin is checked on every state-changing request of any content type (hooks.server.ts). Job routes require a Google OIDC token for the worker's service account; webhooks require an SNS signature for the configured topic.
- **Tenant isolation:** every request runs in `withUser()` under RLS. Cross-tenant tests are in `tests/integration` and `.specify/tests/rls`.
- **Audit trail:** the `audit_row_change` trigger on the audited tables; `audit_log` is immutable (trigger plus revoked grants). Lomi invocations are logged as `ai_invocations` metadata.
- **Logging:** all `console.*` calls in `src/` log IDs, error names or codes only.
- **XSS sinks:** no `{@html}` anywhere in `src/`.
- **Caching:** responses for signed-in users are `private, no-store`, and the service worker never caches API responses (PWA work).
- **Secrets:** none in the client bundle; the Firebase web config is the documented exception.
- **Messaging:** push payloads are generic; SMS and email bodies are PHI-free templates; inbound SMS from unknown numbers gets no reply.

## Open (needs an owner)

| Item | Risk | Notes |
|---|---|---|
| MFA is not enforced. `profiles.mfa_enabled` exists, but nothing requires TOTP for supervisors and admins (security.md "MFA Policy"). | High before go-live | Needs TOTP enrollment and sign-in UI (Identity Platform multi-factor), then a server check that rejects supervisor/admin sessions without a second factor once the grace period ends. |
| Request rate limiting. | Done | 100 tRPC requests a minute per user and 20 `/auth/session` sign-ins a minute per IP (in-memory token buckets per instance, `src/lib/server/rate-limit.ts`), on top of the exact Lomi limits from audit_log. Cloud Armor would add an edge-level limit. |
| Password policy, breached-password check and history. | Medium | Set Identity Platform's password policy to "enforce" (10+ characters, mixed case, digit) in the console during deploy step 2. The breached-password and history checks are post-launch items per security.md. |
| Audit log viewer and export for admins/supervisors (security.md "Access"). | Low | Not built yet. |
| `style-src 'unsafe-inline'`. | Low | Needed for Svelte style bindings. Scripts, the real XSS vector, are nonce-only. |
| Safari and Firefox checks of the encrypted local database. | Medium | security.md notes they still need verifying; that needs real devices. |
| Outside penetration test and BAA paperwork. | Required | infrastructure.md §8. |
