/** Device checks use only synthetic bytes, never saved profiles or records. */
export interface DeviceReadiness {
	secure: boolean;
	crypto: boolean;
	storage: 'available' | 'unsupported' | 'blocked';
	serviceWorker: boolean;
	persistence: 'granted' | 'not-granted' | 'unsupported' | 'unavailable';
}
export function storageReady(state: DeviceReadiness): boolean {
	return state.secure && state.crypto && state.storage === 'available';
}
export function deviceIssue(state: DeviceReadiness): string {
	if (!state.secure)
		return 'Open Guad using its secure HTTPS address. This connection cannot protect saved records.';
	if (!state.crypto)
		return 'This browser cannot provide the encryption Guad needs. Try an updated browser approved by your agency.';
	if (state.storage === 'unsupported')
		return 'This browser does not support the private device storage Guad needs. Try an updated browser approved by your agency.';
	if (state.storage === 'blocked')
		return 'This browser could not write private device storage. Leave private browsing, check available space and browser storage settings, then try again. Do not clear existing Guad data while changes are waiting to sync.';
	return '';
}

export async function inspectDevice(
	env = {
		secure: globalThis.isSecureContext,
		crypto: globalThis.crypto,
		navigator: globalThis.navigator
	}
): Promise<DeviceReadiness> {
	const state: DeviceReadiness = {
		secure: env.secure,
		crypto: false,
		storage: 'unsupported',
		serviceWorker: !!env.navigator?.serviceWorker,
		persistence: 'unsupported'
	};
	if (!state.secure) return state;
	try {
		// Exercise the PIN wrapper's algorithms using a disposable key and synthetic data.
		const base = await env.crypto.subtle.importKey('raw', new Uint8Array([1]), 'PBKDF2', false, [
			'deriveKey'
		]);
		const key = await env.crypto.subtle.deriveKey(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 1 },
			base,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
		const iv = env.crypto.getRandomValues(new Uint8Array(12));
		const encrypted = await env.crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			new Uint8Array([1])
		);
		const plain = await env.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
		state.crypto = new Uint8Array(plain)[0] === 1;
	} catch {
		/* Capability errors must never expose browser internals or saved content. */
	}
	const storage = env.navigator?.storage;
	if (storage?.getDirectory) {
		state.storage = 'blocked';
		// A unique disposable file tests writes without enumerating any existing files.
		let directory: FileSystemDirectoryHandle | undefined;
		let name: string | undefined;
		try {
			directory = await storage.getDirectory();
			name = `guad-readiness-${env.crypto.randomUUID()}.tmp`;
			const file = await directory.getFileHandle(name, { create: true });
			const writer = await file.createWritable();
			try {
				await writer.write(new Uint8Array([1]));
				await writer.close();
			} catch {
				await writer.abort().catch(() => {});
				throw new Error('Storage probe failed');
			}
			state.storage = 'available';
		} catch {
			/* Blocked and full storage share a recovery message. */
		} finally {
			if (directory && name) await directory.removeEntry(name).catch(() => {});
		}
	}
	if (storage?.persisted) {
		try {
			state.persistence = (await storage.persisted()) ? 'granted' : 'not-granted';
		} catch {
			state.persistence = 'unavailable';
		}
	}
	return state;
}

/** Called only in response to an explicit user action; permission is never automatic. */
export async function requestPersistence(
	storage = navigator.storage
): Promise<DeviceReadiness['persistence']> {
	if (!storage?.persist) return 'unsupported';
	try {
		return (await storage.persist()) ? 'granted' : 'not-granted';
	} catch {
		return 'unavailable';
	}
}
