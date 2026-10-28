# Offline CSP and connection origins

SvelteKit's `csp.mode: 'auto'` gives dynamic pages fresh script nonces and the
prerendered `/offline` page stable script hashes. The latter bypasses server
hooks. Its `connect-src` therefore includes the public PowerSync/Auth emulator
origins **at build time**, alongside exact Firebase Auth and FCM installation /
registration endpoints. No external SDK calls are introduced by this allowlist.
SQLite's `wasm-unsafe-eval` and same-origin/blob workers remain enabled; general
JavaScript eval and unsigned inline scripts remain blocked.

Both build and runtime use the same origin parser. It removes paths/query strings,
requires HTTP(S) inputs, rejects userinfo, wildcards and CSP syntax, and permits
plain HTTP only on explicit loopback hosts. WebSocket equivalents use the same
exact host/port. Invalid build configuration fails with a generic message;
invalid runtime origins are omitted. Runtime additions are deduplicated and leave
SvelteKit's nonce/hash directives untouched.

Set `PUBLIC_POWERSYNC_URL` and, for local tests only, `PUBLIC_AUTH_EMULATOR_URL`
before `npm run build`. Vite reads `.env` / `.env.production` and explicit process
variables. Run `npm run pwa:check` with the same values to verify actual public
offline HTML, not merely helper output. CI builds/checks with explicit local
origins to prevent missing build-time connection sources from regressing.

The Docker build stage accepts these public settings via `--build-arg`. Runtime
variables alone cannot update a previously built/cached offline policy. Changes
to connection origins require a rebuild and service-worker update.
`deploy/deploy.sh` works out PowerSync's Cloud Run deterministic URL
(`https://guad-powersync-<project number>.<region>.run.app`) before the build,
passes it (and `APP_ORIGIN`, if set) as build arguments through a Cloud Build
config, and gives the services the same URL at runtime. Set `POWERSYNC_URL`
before running it to use another public URL, such as a custom domain. No cloud
release has verified this yet.

`frame-ancestors` cannot be enforced through an HTML CSP meta tag. Hook-generated
X-Frame-Options and other HTTP headers also do not cover adapter-served static /
prerendered files. Configure/test those headers at the serving edge separately;
this change does not claim complete static-response header coverage.
