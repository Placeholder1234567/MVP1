import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicPath, assertPublicText } from '../../scripts/client-artifact-rules.mjs';

test('rejects public source maps and private source/config files on either path separator', () => {
	for (const path of [
		'build/client/chunk.js.map',
		'build/client/chunk.js.map.br',
		'build\\client\\.env.test',
		'build/client/key.pem',
		'build/client/schema.sql',
		'build/client/source.ts',
		'build/client/source.ts.gz'
	])
		assert.throws(() => assertPublicPath(path));
	assert.doesNotThrow(() => assertPublicPath('build/client/database.wasm'));
});

test('rejects source-map pointers, credentials and known private values without exposing contents', () => {
	for (const text of [
		'//# sourceMappingURL=inline',
		'-----BEGIN PRIVATE KEY-----',
		'postgres://test:synthetic-password@localhost/test'
	])
		assert.throws(() => assertPublicText(text));
	assert.throws(
		() => assertPublicText('prefix SYNTHETIC-PRIVATE-TEST suffix', ['SYNTHETIC-PRIVATE-TEST']),
		(error) => !error.message.includes('SYNTHETIC-PRIVATE-TEST')
	);
	assert.doesNotThrow(() =>
		assertPublicText('public identifier and application code', ['SYNTHETIC-PRIVATE-TEST'])
	);
});
