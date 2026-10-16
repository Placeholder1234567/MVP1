import { webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
	inspectDevice,
	storageReady,
	deviceIssue,
	requestPersistence
} from '../../../src/lib/pwa/readiness';

function environment() {
	const writer = { write: vi.fn(), close: vi.fn(), abort: vi.fn(async () => {}) };
	const directory = {
		getFileHandle: vi
			.fn<
				(
					name: string,
					options?: { create: boolean }
				) => Promise<{ createWritable: () => Promise<typeof writer> }>
			>()
			.mockResolvedValue({ createWritable: async () => writer }),
		removeEntry: vi.fn(async () => {}),
		entries: vi.fn(() => {
			throw new Error('Must not enumerate saved records');
		})
	};
	const storage = {
		getDirectory: vi.fn(async () => directory),
		persisted: vi.fn(async () => false),
		persist: vi.fn(async () => true)
	};
	const env = {
		secure: true,
		crypto: webcrypto as unknown as Crypto,
		navigator: { storage, serviceWorker: {} } as unknown as Navigator
	};
	return { env, storage, directory, writer };
}
it('checks encryption and writable storage using only its own disposable file', async () => {
	const { env, storage, directory, writer } = environment();
	const result = await inspectDevice(env);
	expect(storageReady(result)).toBe(true);
	expect(result.persistence).toBe('not-granted');
	expect(storage.persist).not.toHaveBeenCalled();
	expect(directory.entries).not.toHaveBeenCalled();
	const name = directory.getFileHandle.mock.calls[0][0];
	expect(name).toMatch(/^guad-readiness-[0-9a-f-]+\.tmp$/);
	expect(directory.removeEntry).toHaveBeenCalledWith(name);
	expect(writer.write).toHaveBeenCalledWith(new Uint8Array([1]));
});
it('does not touch storage or request permissions on an insecure connection', async () => {
	const { env, storage } = environment();
	env.secure = false;
	const result = await inspectDevice(env);
	expect(storageReady(result)).toBe(false);
	expect(deviceIssue(result)).toContain('HTTPS');
	expect(storage.getDirectory).not.toHaveBeenCalled();
	expect(storage.persist).not.toHaveBeenCalled();
});
it('classifies blocked writes without returning raw errors or saved data', async () => {
	const { env, writer, directory } = environment();
	writer.write.mockRejectedValue(new Error('secret browser detail'));
	const result = await inspectDevice(env);
	expect(result.storage).toBe('blocked');
	expect(storageReady(result)).toBe(false);
	expect(deviceIssue(result)).toContain('Do not clear existing Guad data');
	expect(JSON.stringify(result)).not.toContain('secret');
	expect(directory.removeEntry).toHaveBeenCalledOnce();
	expect(writer.abort).toHaveBeenCalledOnce();
});
it('reports missing encryption and storage separately', async () => {
	const { env } = environment();
	env.crypto = {} as Crypto;
	env.navigator = {} as Navigator;
	const result = await inspectDevice(env);
	expect(result.crypto).toBe(false);
	expect(result.storage).toBe('unsupported');
	expect(result.serviceWorker).toBe(false);
	expect(deviceIssue(result)).toContain('encryption');
	expect(deviceIssue({ ...result, crypto: true })).toContain('private device storage');
});
it('requests persistence only explicitly and handles denial and browser failure', async () => {
	const { env, storage } = environment();
	expect(await requestPersistence(env.navigator.storage)).toBe('granted');
	storage.persist.mockResolvedValue(false);
	expect(await requestPersistence(env.navigator.storage)).toBe('not-granted');
	storage.persist.mockRejectedValue(new Error('Private error'));
	expect(await requestPersistence(env.navigator.storage)).toBe('unavailable');
	expect(await requestPersistence({} as StorageManager)).toBe('unsupported');
});
