// This device's local database key (offline-sync.md "Local Database Encryption
// Key"). The key itself lives in memory only. On disk there is one small file
// in OPFS holding the device ID and the key wrapped with a PIN-derived key
// (PBKDF2-SHA256, 600k iterations, AES-256-GCM). No PHI, and nothing in
// localStorage or IndexedDB.
//
// Where the device supports it, the wrapping key also needs a secret held by a
// platform passkey (WebAuthn PRF), so a copy of this storage cannot be opened
// by guessing PINs offline: every guess needs the device's own authenticator
// (research/decisions-2026-10.md §3). The PIN still matters on a shared
// tablet, whose screen lock any coworker may know. Nothing about the passkey
// goes to the server; it protects the key on this device, it is not sign-in.

import { offlineAccessValid, OFFLINE_ACCESS_MS } from '../domain/pwa';

const deviceFile = (profileId?: string) =>
	profileId ? 'guad-device-' + profileId + '.json' : 'guad-device.json';
const ITERATIONS = 600_000;
export const MAX_PIN_ATTEMPTS = 5;
/**
 * How long a privacy-lock unlock needs only the PIN (NIST SP 800-63B-4
 * "partial reauthentication": after an inactivity lock, a single factor plus
 * the live session; research/decisions-2026-10.md §4). Capped at the longest
 * sign-in (12 hours); a reload, a closed app or sign-out starts over with the
 * full check, passkey included.
 */
export const SESSION_UNLOCK_MS = 12 * 60 * 60 * 1000;

interface DeviceRecord {
	deviceId: string;
	/** Present once a PIN has been set on this device */
	wrapped?: { salt: string; iv: string; ciphertext: string };
	failedAttempts: number;
	/** Non-PHI freshness marker; offline access never renews it. */
	verifiedAt?: number;
	/** The passkey whose PRF secret is mixed into the wrapping key, if any. */
	passkey?: { credentialId: string; salt: string };
}

/** The passkey was cancelled, removed, or is not on this device. Not a wrong PIN. */
export class PasskeyError extends Error {
	constructor() {
		super(
			"Confirm with this device's screen lock to unlock. If that keeps failing, sign in again with your password."
		);
	}
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

async function pinKey(pin: string, salt: Uint8Array, secret?: Uint8Array): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(pin),
		'PBKDF2',
		false,
		['deriveKey', 'deriveBits']
	);
	const pbkdf2 = {
		name: 'PBKDF2',
		hash: 'SHA-256',
		salt: salt as BufferSource,
		iterations: ITERATIONS
	};
	const aes = { name: 'AES-GCM', length: 256 };
	if (!secret) return crypto.subtle.deriveKey(pbkdf2, base, aes, false, ['encrypt', 'decrypt']);
	// PIN and passkey secret together: HKDF over both, so neither alone is enough.
	const ikm = new Uint8Array([
		...new Uint8Array(await crypto.subtle.deriveBits(pbkdf2, base, 256)),
		...secret
	]);
	const both = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
	ikm.fill(0);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt as BufferSource,
			info: new TextEncoder().encode('guad-device-key:pin+passkey')
		},
		both,
		aes,
		false,
		['encrypt', 'decrypt']
	);
}

/** Whether this device can hold the unlock secret in a platform passkey (WebAuthn PRF). */
export async function passkeyUnlockAvailable(): Promise<boolean> {
	try {
		const PKC = globalThis.PublicKeyCredential;
		if (!PKC?.getClientCapabilities) return false;
		const [platform, capabilities] = await Promise.all([
			PKC.isUserVerifyingPlatformAuthenticatorAvailable(),
			PKC.getClientCapabilities()
		]);
		return platform && capabilities['extension:prf'] === true;
	} catch {
		return false;
	}
}

const PASSKEY_TIMEOUT_MS = 60_000;
const bytesOf = (v: BufferSource) =>
	new Uint8Array(
		ArrayBuffer.isView(v) ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v
	);

/** The passkey's PRF secret for this salt, after the device verifies the user. */
async function passkeySecret(credentialId: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
	let credential: Credential | null;
	try {
		credential = await navigator.credentials.get({
			publicKey: {
				challenge: crypto.getRandomValues(new Uint8Array(32)),
				allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
				userVerification: 'required',
				timeout: PASSKEY_TIMEOUT_MS,
				extensions: { prf: { eval: { first: salt as BufferSource } } }
			}
		});
	} catch {
		throw new PasskeyError();
	}
	const first = (credential as PublicKeyCredential | null)?.getClientExtensionResults().prf?.results
		?.first;
	if (!first) throw new PasskeyError();
	return bytesOf(first);
}

/** Creates this profile's unlock passkey on this device; null when the device can't. */
async function createPasskey(
	salt: Uint8Array
): Promise<{ credentialId: Uint8Array; secret: Uint8Array } | null> {
	if (!(await passkeyUnlockAvailable())) return null;
	try {
		const credential = (await navigator.credentials.create({
			publicKey: {
				rp: { name: 'Guad' },
				// Random, not the profile ID: password managers list this, and it is no one's identity.
				user: {
					id: crypto.getRandomValues(new Uint8Array(16)),
					name: 'Guad device unlock',
					displayName: 'Guad device unlock'
				},
				challenge: crypto.getRandomValues(new Uint8Array(32)),
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				authenticatorSelection: {
					authenticatorAttachment: 'platform',
					residentKey: 'discouraged',
					userVerification: 'required'
				},
				timeout: PASSKEY_TIMEOUT_MS,
				extensions: { prf: { eval: { first: salt as BufferSource } } }
			}
		})) as PublicKeyCredential | null;
		const prf = credential?.getClientExtensionResults().prf;
		if (!credential || !prf?.enabled) return null;
		const credentialId = new Uint8Array(credential.rawId);
		// Some platforms evaluate PRF only on get(), not while creating.
		const secret = prf.results?.first
			? bytesOf(prf.results.first)
			: await passkeySecret(credentialId, salt);
		return { credentialId, secret };
	} catch {
		return null; // cancelled or unsupported: the PIN alone protects the key
	}
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

/** Called only in the server-authenticated workspace after unlocking. */
export async function verifyOfflineAccess(profileId: string): Promise<void> {
	const record = await readRecord(profileId);
	if (record?.wrapped) await writeRecord({ ...record, verifiedAt: Date.now() }, profileId);
}
/** Lists only profile UUIDs; names and records remain behind the PIN. */
export async function offlineProfiles(): Promise<string[]> {
	const dir = await navigator.storage.getDirectory();
	const profiles: string[] = [];
	for await (const [name] of dir.entries()) {
		const match = /^guad-device-([0-9a-f-]{36})\.json$/i.exec(name);
		if (!match) continue;
		const record = await readRecord(match[1]);
		if (record?.wrapped && offlineAccessValid(record.verifiedAt)) profiles.push(match[1]);
	}
	return profiles.sort();
}
export async function unwrapOfflineKey(pin: string, profileId: string): Promise<Uint8Array> {
	if (!offlineAccessValid((await readRecord(profileId))?.verifiedAt))
		throw new Error('Connect and sign in to refresh this device');
	return unwrapKey(pin, profileId);
}
export async function offlineAccessUntil(profileId: string): Promise<number> {
	return ((await readRecord(profileId))?.verifiedAt ?? 0) + OFFLINE_ACCESS_MS;
}

/**
 * Signing out: drops the PIN-wrapped key and the offline-access marker, so
 * neither this lock screen nor /offline can reopen the database. The device ID
 * stays: unsynced work in the encrypted database is reopened by the next
 * password sign-in, which fetches the same key from the server.
 */
export async function forgetPin(profileId: string): Promise<void> {
	const record = await readRecord(profileId);
	if (record) await writeRecord({ deviceId: record.deviceId, failedAttempts: 0 }, profileId);
	if (record?.passkey) forgetPasskey(record.passkey.credentialId);
	forgetSessionUnlock();
}

/** Asks the password manager to drop an unlock passkey nothing can use any more. */
function forgetPasskey(credentialId: string) {
	try {
		void PublicKeyCredential.signalUnknownCredential?.({
			rpId: location.hostname,
			credentialId: credentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
		}).catch(() => {});
	} catch {
		// Not supported: the passkey stays listed but unlocks nothing.
	}
}

/**
 * Stores the key wrapped with the PIN, and with a new platform passkey's
 * secret when `passkey` is set and the device supports it. The plain key
 * never touches disk.
 */
export async function wrapKey(
	key: Uint8Array,
	pin: string,
	profileId?: string,
	options: { passkey?: boolean } = {}
): Promise<void> {
	const id = await deviceId(profileId);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const prfSalt = crypto.getRandomValues(new Uint8Array(32));
	const passkey = options.passkey ? await createPasskey(prfSalt) : null;
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		await pinKey(pin, salt, passkey?.secret),
		key as BufferSource
	);
	passkey?.secret.fill(0);
	if (profileId) remember(key, pin, profileId);
	await writeRecord(
		{
			deviceId: id,
			wrapped: { salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) },
			failedAttempts: 0,
			...(passkey && {
				passkey: { credentialId: b64(passkey.credentialId), salt: b64(prfSalt) }
			})
		},
		profileId
	);
}

/**
 * The key wrapped with the PIN in this page's memory only, after a full unlock.
 * Never written anywhere, so a copy of the device's storage doesn't include it.
 */
let session: {
	profileId: string;
	salt: Uint8Array;
	iv: Uint8Array;
	ciphertext: ArrayBuffer;
	until: number;
} | null = null;

let remembering: Promise<void> = Promise.resolve();

function remember(key: Uint8Array, pin: string, profileId: string) {
	const copy = key.slice(); // callers zero theirs once the database is open
	remembering = (async () => {
		try {
			const salt = crypto.getRandomValues(new Uint8Array(16));
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const ciphertext = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv },
				await pinKey(pin, salt),
				copy as BufferSource
			);
			session = { profileId, salt, iv, ciphertext, until: Date.now() + SESSION_UNLOCK_MS };
		} catch {
			// Not remembered: the next unlock is the full one.
		} finally {
			copy.fill(0);
		}
	})();
}

/** Drops the in-memory unlock, so the next unlock is the full one. */
export function forgetSessionUnlock(): void {
	session = null;
	remembering = remembering.then(() => {
		session = null;
	});
}

/** Whether this profile's key on this device also needs its passkey. */
export async function usesPasskey(profileId: string): Promise<boolean> {
	return !!(await readRecord(profileId))?.passkey;
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
	// Within a live session (a privacy lock, not a cold start), the PIN alone.
	await remembering;
	const held =
		session && session.profileId === profileId && session.until > Date.now() ? session : null;
	if (held) {
		let plain: ArrayBuffer;
		try {
			plain = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: held.iv as BufferSource },
				await pinKey(pin, held.salt),
				held.ciphertext
			);
		} catch {
			throw await wrongPin(record, profileId);
		}
		if (record.failedAttempts)
			await writeRecord({ ...record, failedAttempts: 0 }, profileId).catch(() => {});
		return new Uint8Array(plain);
	}
	// The passkey first: cancelling it is not a wrong PIN and costs no attempt.
	const secret = record.passkey
		? await passkeySecret(unb64(record.passkey.credentialId), unb64(record.passkey.salt))
		: undefined;
	let plain: ArrayBuffer;
	try {
		plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: unb64(iv) },
			await pinKey(pin, unb64(salt), secret),
			unb64(ciphertext)
		);
	} catch {
		throw await wrongPin(record, profileId);
	} finally {
		secret?.fill(0);
	}
	// Outside the try: a failed write here (another tab writing the file, a
	// full disk) must not count a correct PIN as a wrong one.
	if (record.failedAttempts)
		await writeRecord({ ...record, failedAttempts: 0 }, profileId).catch(() => {});
	const key = new Uint8Array(plain);
	if (profileId) remember(key, pin, profileId);
	return key;
}

/** Counts a wrong PIN; the last one deletes the wrapped key (and the passkey and in-memory unlock). */
async function wrongPin(record: DeviceRecord, profileId?: string): Promise<WrongPinError> {
	const failedAttempts = record.failedAttempts + 1;
	const left = MAX_PIN_ATTEMPTS - failedAttempts;
	await writeRecord(
		left > 0 ? { ...record, failedAttempts } : { deviceId: record.deviceId, failedAttempts: 0 }, // wrapped key deleted
		profileId
	);
	if (left <= 0) {
		if (record.passkey) forgetPasskey(record.passkey.credentialId);
		forgetSessionUnlock();
	}
	return new WrongPinError(left);
}

/** Key bytes as the hex string SQLite3MultipleCiphers takes as its key. */
export function toHex(key: Uint8Array): string {
	return [...key].map((b) => b.toString(16).padStart(2, '0')).join('');
}
