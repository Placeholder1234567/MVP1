# Production dependency and artifact checks

CI audits the production dependency graph with `npm audit --omit=dev --audit-level=high`.
The compatible `@grpc/grpc-js` override resolves the old Firestore transitive copy
to the patched 1.14 line without downgrading Firebase or applying forced fixes.
The lockfile remains the source for reproducible installs. Development-tool
advisories are a separate backlog; a clean production audit does not clear them.

After `npm run build`, run `npm run build:check`. The guard scans the **public**
`build/client` and `build/prerendered` trees for source maps, source-map pointers,
private source/config extensions, private-key and database-credential markers,
and configured private environment values of at least 16 characters selected by
secret/token/password/key/database variable names. It never prints matched
contents or secret values. The included negative fixtures verify detection and
redacted failures. This is a bounded regression guard, not comprehensive secret
or PHI detection. It deliberately does not scan server output, which contains
server modules and server-only source maps and must never be publicly served.

The Vite client manifest drives gzip size budgets: 128 KiB for bootstrap entries
with static imports, and 192 KiB for each individual entry plus static imports
and CSS, deduplicated within each set. Dynamic imports, complete layout/route
combinations, database workers, WASM, service-worker install downloads, network
latency and rendering time are excluded. These limits catch bundle regressions;
they do **not** measure full page transfer, 3G loading, memory or interaction
performance. Measure those separately on representative physical devices.

If the prerendered offline document has a CSP meta tag, the guard requires script
hashes and rejects reusable nonces. CSP and HTTP response headers are owned by
the separate application-header increment. Adapter-served static assets and
prerendered pages bypass `hooks.server.ts`; hook headers alone do not protect
those responses. Edge/static-server header configuration and actual browser
verification of offline WASM, sync and authentication remain necessary.

## Remaining development-tool advisories

Audit snapshot: October 15, 2026. Registry advisories and available releases can change.

The Firebase CLI patch from 15.33.0 to 15.34.0 removes its `proxy-agent` /
`pac-proxy-agent` / `get-uri` / `basic-ftp` chain. The full dependency audit
decreases from 15 findings (7 high, 8 moderate) to 11 (3 high, 8 moderate);
these counts include parent packages marked vulnerable through dependencies.
The production-only graph still reports zero vulnerabilities. No audit finding
is suppressed and no forced fix or downgrade is applied.

The remaining chains, checked against installed sources and registry metadata:

- `firebase-tools -> chokidar@3.6.0 -> braces@3.0.3`: deeply nested pattern
  stack exhaustion ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
  The current braces release is still 3.0.3, with no patched release. Chokidar 4
  changes glob support and is outside Firebase's declared major range. The
  Firebase CLI uses these watchers in Database, Firestore and Functions emulator
  modules; this repository currently runs only its Auth emulator. That limits
  the exercised path but does not resolve the advisory.
- `firebase-tools -> @google-cloud/pubsub@5.3.1 -> @opentelemetry/core@1.30.1`:
  unbounded baggage parsing ([GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf)).
  The reported fixed range starts at 2.8.0, crossing OpenTelemetry's major
  boundary. Pub/Sub is not a configured local emulator for this project;
  replacing its telemetry implementation via override is not validated here.
- `firebase-tools -> gaxios@6.7.1 -> uuid@9.0.1`: buffer bounds checking in
  v3/v5/v6 ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)).
  The fixed version begins at 11.1.1; overriding UUID 9 with 11 would cross
  major versions. The installed Gaxios source uses UUID v4 for multipart
  boundaries, rather than the affected v3/v5/v6 calls. The dependency finding
  remains open rather than being silently waived.
- `drizzle-kit@0.31.11 -> @esbuild-kit/esm-loader@2.6.5 ->
  @esbuild-kit/core-utils@3.3.2 -> esbuild@0.18.20`: esbuild development-server
  cross-origin exposure ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)).
  Core-utils pins `~0.18.20`; the fix begins in the 0.25 release line, outside
  its declared compatibility range. Drizzle's current release still carries
  the old loader. This app's Vite/tsx dependencies already use patched esbuild
  versions, and the old loader is a tooling dependency, not the app server.
  Replacing a pre-1.0 compiler across its declared range or downgrading Drizzle
  to the audit tool's suggested 0.18.1 is deliberately avoided.

Revisit these findings when their owning packages publish compatible fixes.
The CLI patch is validated with an isolated Auth emulator smoke test that creates
and deletes one synthetic identity, plus the normal application build/checks.
No deployment or real provider service is involved.
