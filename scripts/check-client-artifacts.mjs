// Build regression guard, not a replacement for secret scanning or device performance testing.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { assertPublicPath, assertPublicText } from './client-artifact-rules.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const secrets = Object.entries(process.env)
	.filter(
		([key, value]) =>
			!key.startsWith('PUBLIC_') &&
			/SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL|DEVICE_KEY_KEK|PS_DEV_JWT_KEY/.test(key) &&
			value?.length >= 16
	)
	.map(([, value]) => value);

for (const root of ['build/client', 'build/prerendered']) {
	for (const file of await readdir(root, { recursive: true, withFileTypes: true })) {
		assert.ok(!file.isSymbolicLink(), 'Unexpected symlink in public build');
		if (!file.isFile()) continue;
		const path = `${file.parentPath}/${file.name}`;
		assertPublicPath(path);
		if (!/\.(?:js|css|html|json)$/.test(file.name)) continue;
		const text = await readFile(path, 'utf8');
		assertPublicText(text, secrets);
	}
}

const manifest = JSON.parse(
	await readFile('.svelte-kit/output/client/.vite/manifest.json', 'utf8')
);
/** Includes static imports and CSS, deduplicated. Lazy routes/workers/WASM are separate downloads. */
function closure(key, seen = new Set()) {
	const entry = manifest[key];
	assert.ok(entry?.file, 'Missing client manifest entry');
	if (seen.has(entry.file)) return seen;
	seen.add(entry.file);
	for (const file of entry.css ?? []) seen.add(file);
	for (const key of entry.imports ?? []) closure(key, seen);
	return seen;
}
async function compressed(files) {
	let bytes = 0;
	for (const file of files) {
		assert.ok(
			file.startsWith('_app/immutable/') && !file.includes('..'),
			'Unexpected manifest path'
		);
		bytes += gzipSync(await readFile(`build/client/${file}`)).length;
	}
	return bytes;
}
const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
assert.ok(entries.length, 'No production entry points');
const bootstrap = new Set();
for (const key of entries.filter((key) => /\/entry\//.test(manifest[key].file)))
	for (const file of closure(key)) bootstrap.add(file);
assert.ok(bootstrap.size, 'Missing production bootstrap');
const bootstrapBytes = await compressed(bootstrap);
assert.ok(bootstrapBytes <= 128 * 1024, 'Compressed bootstrap exceeds 128 KiB budget');
let largestEntryBytes = 0;
for (const key of entries) {
	const bytes = await compressed(closure(key));
	largestEntryBytes = Math.max(largestEntryBytes, bytes);
	assert.ok(bytes <= 192 * 1024, 'Compressed entry and static dependencies exceed 192 KiB budget');
}

const offline = await readFile('build/prerendered/offline.html', 'utf8');
// The separate header/CSP work owns policy coverage. If present, a public
// prerendered page must use stable script hashes, never reusable nonces.
if (/http-equiv="content-security-policy"/i.test(offline)) {
	assert.match(offline, /sha256-/);
	assert.doesNotMatch(offline, /nonce-/);
}
console.log(
	`Public artifact checks passed. Gzip bootstrap: ${bootstrapBytes} bytes; largest single entry with static dependencies: ${largestEntryBytes} bytes. Lazy workers/WASM and route combinations excluded from these budgets.`
);
