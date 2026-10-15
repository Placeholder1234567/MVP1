import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	deviceId,
	hasWrappedKey,
	unwrapKey,
	wrapKey,
	WrongPinError
} from '../../../src/lib/sync/device-key';
import {
	offlineProfiles,
	verifyOfflineAccess,
	unwrapOfflineKey
} from '../../../src/lib/sync/device-key';
import { OFFLINE_ACCESS_MS } from '../../../src/lib/domain/pwa';

const files = new Map<string, string>();
beforeEach(() => {
	files.clear();
	vi.stubGlobal('navigator', {
		storage: {
			getDirectory: async () => ({
				async *entries() {
					for (const name of files.keys()) yield [name, { kind: 'file' }] as const;
				},
				getFileHandle: async (name: string, options?: { create?: boolean }) => {
					if (!files.has(name) && !options?.create) throw new Error('Not found');
					return {
						getFile: async () => ({ text: async () => files.get(name)! }),
						createWritable: async () => ({
							write: async (value: string) => {
								files.set(name, value);
							},
							close: async () => {}
						})
					};
				}
			})
		}
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('a different signed-in profile cannot unwrap the previous profile’s device key', async () => {
	const key = crypto.getRandomValues(new Uint8Array(32));
	await wrapKey(key, '123456', 'caregiver');
	expect(await hasWrappedKey('caregiver')).toBe(true);
	expect(await hasWrappedKey('supervisor')).toBe(false);
	await expect(unwrapKey('123456', 'supervisor')).rejects.toBeInstanceOf(WrongPinError);
	expect(await unwrapKey('123456', 'caregiver')).toEqual(key);
	expect(await deviceId('caregiver')).not.toBe(await deviceId('supervisor'));
});

it('wrong-PIN exhaustion removes only that profile’s wrapped key', async () => {
	await wrapKey(new Uint8Array(32).fill(1), '123456', 'one');
	await wrapKey(new Uint8Array(32).fill(2), '654321', 'two');
	for (let i = 0; i < 5; i++)
		await expect(unwrapKey('000000', 'one')).rejects.toBeInstanceOf(WrongPinError);
	expect(await hasWrappedKey('one')).toBe(false);
	expect(await hasWrappedKey('two')).toBe(true);
	expect(await unwrapKey('654321', 'two')).toEqual(new Uint8Array(32).fill(2));
});

it('offline cold-start access requires fresh verification and never extends it on PIN unlock', async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
	const id = crypto.randomUUID(),
		other = crypto.randomUUID(),
		key = new Uint8Array(32).fill(3);
	await wrapKey(key, '123456', id);
	await wrapKey(new Uint8Array(32).fill(4), '654321', other);
	expect(await offlineProfiles()).toEqual([]);
	await expect(unwrapOfflineKey('123456', id)).rejects.toThrow('Connect');
	await verifyOfflineAccess(id);
	expect(await offlineProfiles()).toEqual([id]);
	vi.setSystemTime(new Date(Date.now() + OFFLINE_ACCESS_MS - 1));
	expect(await unwrapOfflineKey('123456', id)).toEqual(key);
	vi.setSystemTime(new Date(Date.now() + 1));
	expect(await offlineProfiles()).toEqual([]);
	await expect(unwrapOfflineKey('123456', id)).rejects.toThrow('Connect');
	expect(await hasWrappedKey(id)).toBe(true);
});
