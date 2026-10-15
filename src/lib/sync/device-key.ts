// This device's local database key (offline-sync.md "Local Database Encryption
// Key"). The key itself lives in memory only. On disk there is one small file
// in OPFS holding the device ID and the key wrapped with a PIN-derived key
// (PBKDF2-SHA256, 600k iterations, AES-256-GCM). No PHI, and nothing in
// localStorage or IndexedDB.

const deviceFile = (profileId?: string) =>
	profileId ? 'guad-device-' + profileId + '.json' : 'guad-device.json';
const ITERATIONS = 600_000;
export const MAX_PIN_ATTEMPTS = 5;

interface DeviceRecord {
	deviceId: string;
	/** Present once a PIN has been set on this device */
	wrapped?: { salt: string; iv: string; ciphertext: string };
	failedAttempts: number;
}

const b64 = (bytes: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function readRecord(profileId?: string): Promise<DeviceRecord | null> {
	const dir = await navigator.storage.getDirectory();
	try {
		const file = await (await dir.getFileHandle(deviceFile(profileId))).getFile();
		return JSON.parse(await file.text());
	} catch {
		return null;
	}
}

async function writeRecord(record: DeviceRecord, profileId?: string): Promise<void> {
	const dir = await navigator.storage.getDirectory();
	const writable = await (
		await dir.getFileHandle(deviceFile(profileId), { create: true })
	).createWritable();
	await writable.write(JSON.stringify(record));
	await writable.close();
}

async function pinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(pin),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** This device's stable random ID, created on first use. */
export async function deviceId(profileId?: string): Promise<string> {
	const record = await readRecord(profileId);
	if (record) return record.deviceId;
	const id = crypto.randomUUID();
	await writeRecord({ deviceId: id, failedAttempts: 0 }, profileId);
	return id;
}

/** Whether a PIN-wrapped key exists, so the app can ask for the PIN offline. */
export async function hasWrappedKey(profileId?: string): Promise<boolean> {
	return !!(await readRecord(profileId))?.wrapped;
}

/** Stores the key wrapped with the PIN. The plain key never touches disk. */
export async function wrapKey(key: Uint8Array, pin: string, profileId?: string): Promise<void> {
	const id = await deviceId(profileId);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		await pinKey(pin, salt),
		key as BufferSource
	);
	await writeRecord(
		{
			deviceId: id,
			wrapped: { salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) },
			failedAttempts: 0
		},
		profileId
	);
}

export class WrongPinError extends Error {
	constructor(public readonly attemptsLeft: number) {
		super(
			attemptsLeft > 0
				? `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
				: 'Too many wrong PINs. Sign in online to unlock this device.'
		);
	}
}

/**
 * The key, unwrapped with the PIN. After MAX_PIN_ATTEMPTS wrong PINs the
 * wrapped key is deleted, so the database can only be reopened by signing in
 * online (which fetches the key again, unless the device was revoked).
 */
export async function unwrapKey(pin: string, profileId?: string): Promise<Uint8Array> {
	const record = await readRecord(profileId);
	if (!record?.wrapped) throw new WrongPinError(0);
	const { salt, iv, ciphertext } = record.wrapped;
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: unb64(iv) },
			await pinKey(pin, unb64(salt)),
			unb64(ciphertext)
		);
		if (record.failedAttempts) await writeRecord({ ...record, failedAttempts: 0 }, profileId);
		return new Uint8Array(plain);
	} catch {
		const failedAttempts = record.failedAttempts + 1;
		const left = MAX_PIN_ATTEMPTS - failedAttempts;
		await writeRecord(
			left > 0 ? { ...record, failedAttempts } : { deviceId: record.deviceId, failedAttempts: 0 }, // wrapped key deleted
			profileId
		);
		throw new WrongPinError(left);
	}
}

/** Key bytes as the hex string SQLite3MultipleCiphers takes as its key. */
export function toHex(key: Uint8Array): string {
	return [...key].map((b) => b.toString(16).padStart(2, '0')).join('');
}
