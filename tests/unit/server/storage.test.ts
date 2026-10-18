import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { localFileStorage } from '../../../src/lib/server/storage';

const root = await mkdtemp(join(tmpdir(), 'guad-storage-'));
afterAll(() => rm(root, { recursive: true, force: true }));

describe('local file storage', () => {
	const storage = localFileStorage(root);

	it('stores, reads and removes files', async () => {
		await storage.put('reports/a/b.csv', Buffer.from('x,y'), 'text/csv');
		expect((await storage.get('reports/a/b.csv'))?.toString()).toBe('x,y');
		await storage.remove('reports/a/b.csv');
		expect(await storage.get('reports/a/b.csv')).toBeNull();
	});

	it('refuses paths that could leave its folder', async () => {
		for (const bad of ['../x.csv', 'reports/../../x', '/etc/passwd', 'a\b', ''])
			await expect(storage.put(bad, Buffer.from(''), 'text/csv')).rejects.toThrow(
				'Invalid storage path'
			);
	});
});
