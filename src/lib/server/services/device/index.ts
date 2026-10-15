// Device Service: the server copy of each device's local database key
// (offline-sync.md "Local Database Encryption Key", schema.ts #38).
//
// The key never touches disk unencrypted: it is stored AES-256-GCM-encrypted
// under DEVICE_KEY_KEK (Secret Manager in production) and sent to the device
// once per online sign-in over TLS. All access runs as app_service; the table
// has RLS with no policies, so no user session can read it.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { withService } from '../../db';
import { findDeviceKey, insertDeviceKey, markIssued, revokeKeys } from './device.queries';

export class DeviceRevokedError extends Error {
	constructor() {
		super('This device has been signed out by an administrator');
	}
}

function kek(): Buffer {
	const raw = process.env.DEVICE_KEY_KEK;
	if (!raw) throw new Error('DEVICE_KEY_KEK is not set');
	const key = Buffer.from(raw, 'base64url');
	if (key.length !== 32) throw new Error('DEVICE_KEY_KEK must be 32 bytes (base64url)');
	return key;
}

/** iv (12) | tag (16) | ciphertext, base64url. The profile+device ID is bound as AAD. */
function seal(plain: Buffer, aad: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', kek(), iv).setAAD(Buffer.from(aad));
	const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

function open(sealed: string, aad: string): Buffer {
	const buf = Buffer.from(sealed, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', kek(), buf.subarray(0, 12))
		.setAAD(Buffer.from(aad))
		.setAuthTag(buf.subarray(12, 28));
	return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

/**
 * The 256-bit key for this user's database on this device, created on first
 * use. Throws DeviceRevokedError once the device or user has been revoked.
 */
export async function issueDeviceKey(
	agencyId: string,
	profileId: string,
	deviceId: string
): Promise<Buffer> {
	const aad = `${profileId}:${deviceId}`;
	return withService(async (tx) => {
		const existing = await findDeviceKey(tx, profileId, deviceId);
		if (existing) {
			if (existing.revokedAt) throw new DeviceRevokedError();
			await markIssued(tx, existing.id);
			return open(existing.ciphertext, aad);
		}
		const key = randomBytes(32);
		await insertDeviceKey(tx, { agencyId, profileId, deviceId, ciphertext: seal(key, aad) });
		return key;
	});
}

/**
 * Revokes one device, or every device of a user (deactivation). Returns how
 * many keys were revoked. A revoked device can't fetch its key again, so
 * after 5 wrong PINs or a lost phone its local database stays unreadable.
 */
export function revokeDeviceKeys(
	agencyId: string,
	profileId: string,
	deviceId?: string
): Promise<number> {
	return withService((tx) => revokeKeys(tx, agencyId, profileId, deviceId));
}
