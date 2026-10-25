// The device key wrapped with the PIN and a platform passkey's PRF secret
// (research/decisions-2026-10.md §3). WebAuthn is faked: the "authenticator"
// derives its secret from a device-only seed and the salt, like hmac-secret.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	PasskeyError,
	unwrapKey,
	usesPasskey,
	wrapKey,
	WrongPinError
} from '../../../src/lib/sync/device-key';

const files = new Map<string, string>();
const seed = crypto.getRandomValues(new Uint8Array(32));
let available = true;
let cancelGet = false;
let cancelCreate = false;
const gets = vi.fn();

async function prf(salt: BufferSource) {
	const s = new Uint8Array(ArrayBuffer.isView(salt) ? salt.buffer : salt);
	return crypto.subtle.digest('SHA-256', new Uint8Array([...seed, ...s]));
}

beforeEach(() => {
	files.clear();
	available = true;
	cancelGet = false;
	cancelCreate = false;
	gets.mockClear();
	vi.stubGlobal('PublicKeyCredential', {
		isUserVerifyingPlatformAuthenticatorAvailable: async () => available,
		getClientCapabilities: async () => ({ 'extension:prf': available })
	});
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
							write: async (value: string) => void files.set(name, value),
							close: async () => {}
						})
					};
				}
			})
		},
		credentials: {
			create: async () => {
				if (cancelCreate) throw new DOMException('cancelled', 'NotAllowedError');
				return {
					rawId: new Uint8Array([1, 2, 3, 4]).buffer,
					getClientExtensionResults: () => ({ prf: { enabled: true } })
				};
			},
			get: async (options: CredentialRequestOptions) => {
				gets(options);
				if (cancelGet) throw new DOMException('cancelled', 'NotAllowedError');
				const first = await prf(options.publicKey!.extensions!.prf!.eval!.first);
				return { getClientExtensionResults: () => ({ prf: { results: { first } } }) };
			}
		}
	});
});
afterEach(() => vi.unstubAllGlobals());

const KEY = new Uint8Array(32).fill(7);

it('needs both the passkey and the PIN', async () => {
	await wrapKey(KEY, '123456', 'p', { passkey: true });
	expect(await usesPasskey('p')).toBe(true);
	expect(await unwrapKey('123456', 'p')).toEqual(KEY);
	expect(gets).toHaveBeenCalledTimes(2); // once while setting up, once to unlock
	await expect(unwrapKey('000000', 'p')).rejects.toBeInstanceOf(WrongPinError);
});

it('a copy of the stored file cannot be opened with the PIN alone', async () => {
	await wrapKey(KEY, '123456', 'p', { passkey: true });
	const [name, json] = [...files].find(([n]) => n.includes('-p.json'))!;
	const record = JSON.parse(json);
	delete record.passkey; // an attacker without the device's authenticator
	files.set(name, JSON.stringify(record));
	await expect(unwrapKey('123456', 'p')).rejects.toBeInstanceOf(WrongPinError);
});

it('cancelling the passkey prompt is not a wrong PIN', async () => {
	await wrapKey(KEY, '123456', 'p', { passkey: true });
	cancelGet = true;
	for (let i = 0; i < 6; i++)
		await expect(unwrapKey('123456', 'p')).rejects.toBeInstanceOf(PasskeyError);
	cancelGet = false;
	expect(await unwrapKey('123456', 'p')).toEqual(KEY);
});

it('falls back to the PIN alone when the device has no passkey support or the user declines', async () => {
	available = false;
	await wrapKey(KEY, '123456', 'a', { passkey: true });
	expect(await usesPasskey('a')).toBe(false);
	available = true;
	cancelCreate = true;
	await wrapKey(KEY, '654321', 'b', { passkey: true });
	expect(await usesPasskey('b')).toBe(false);
	expect(await unwrapKey('123456', 'a')).toEqual(KEY);
	expect(await unwrapKey('654321', 'b')).toEqual(KEY);
	expect(gets).not.toHaveBeenCalled();
});
