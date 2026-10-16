// Run after build: verify install assets and the deliberately empty public offline payload.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { configuredConnectSources, FIREBASE_CONNECT_SOURCES } from '../src/lib/config/csp.ts';
const manifest = JSON.parse(await readFile('build/client/manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const size of [192, 512]) {
	const icon = manifest.icons.find((icon) => icon.sizes === `${size}x${size}`);
	assert.ok(icon);
	const png = await readFile(`build/client${icon.src}`);
	assert.equal(png.subarray(1, 4).toString(), 'PNG');
	assert.equal(png.readUInt32BE(16), size);
	assert.equal(png.readUInt32BE(20), size);
}
const html = await readFile('build/prerendered/offline.html', 'utf8');
assert.match(html, /data:\s*\[null,null\]/);
assert.doesNotMatch(html, /profileId|agencyId|auth_uid|user_json|client_name/);
// Static /offline bypasses runtime hooks, so verify its actual hashed CSP metadata.
const policy = html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"/i)?.[1];
assert.ok(policy, 'Public offline page must carry a CSP');
const directives = new Map(
	policy
		.replaceAll('&#39;', "'")
		.replaceAll('&quot;', '"')
		.replaceAll('&amp;', '&')
		.split(';')
		.map((part) => {
			const [key, ...sources] = part.trim().split(/\s+/);
			return [key, sources];
		})
);
const scripts = directives.get('script-src') ?? [];
assert.ok(
	scripts.some((source) => source.startsWith("'sha256-")),
	'Prerendered scripts must use hashes'
);
assert.ok(scripts.includes("'wasm-unsafe-eval'"), 'Encrypted database WASM must remain available');
assert.ok(
	!scripts.includes("'unsafe-eval'") && !scripts.includes("'unsafe-inline'"),
	'Executable script policy must stay strict'
);
assert.ok(
	!scripts.some((source) => source.startsWith("'nonce-")),
	'Prerendered nonces must not be reused'
);
const connections = directives.get('connect-src') ?? [];
for (const origin of [
	...FIREBASE_CONNECT_SOURCES,
	...configuredConnectSources(
		{ ...loadEnv('production', process.cwd(), 'PUBLIC_'), ...process.env },
		true
	)
]) {
	assert.ok(
		connections.includes(origin),
		'Configured public connection origin missing from offline CSP'
	);
}
assert.deepEqual(directives.get('worker-src'), ["'self'", 'blob:']);
const worker = await readFile('build/client/service-worker.js', 'utf8');
for (const path of await readdir('build/client/_app/immutable/workers', { recursive: true })) {
	if (path.endsWith('.js'))
		assert.ok(
			worker.includes('/_app/immutable/workers/' + path.replaceAll('\\', '/')),
			'All database worker chunks must be precached'
		);
}
console.log(
	'PWA icons, worker and public offline shell verified; no identity payload in cached HTML.'
);
