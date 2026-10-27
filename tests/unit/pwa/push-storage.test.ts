// The registration file: "none" and "can't read it" are different answers.
import { afterEach, expect, it, vi } from 'vitest';
import { readPushOwner, readPushRegistration } from '../../../src/lib/pwa/push-storage';

const storage = (getFileHandle: () => Promise<unknown>) =>
	vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getFileHandle }) } });
const file = (text: string) => async () => ({ getFile: async () => ({ text: async () => text }) });
afterEach(() => vi.unstubAllGlobals());

it('reads a registration, and none when the file is absent', async () => {
	storage(file(JSON.stringify({ profileId: 'p', id: 'r' })));
	expect(await readPushOwner()).toEqual({ profileId: 'p', id: 'r' });
	storage(async () => {
		throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
	});
	expect(await readPushOwner()).toBeNull();
});

it('treats blocked storage or a damaged file as unknown, not as none', async () => {
	storage(async () => {
		throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
	});
	await expect(readPushOwner()).rejects.toThrow();
	storage(file('{not json'));
	await expect(readPushOwner()).rejects.toThrow();
	storage(file(JSON.stringify({ id: 7 })));
	await expect(readPushOwner()).rejects.toThrow();
	// Display code still reads it as none.
	expect(await readPushRegistration()).toBeNull();
});
