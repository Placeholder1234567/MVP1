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
