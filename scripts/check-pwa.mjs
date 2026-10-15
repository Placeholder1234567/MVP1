// Run after build: verify install assets and the deliberately empty public offline payload.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
