// Device Service: the server copy of each device's local database key
// (offline-sync.md "Local Database Encryption Key", schema.ts #38).
//
// The key never touches disk unencrypted: it is stored AES-256-GCM-encrypted
// under DEVICE_KEY_KEK (Secret Manager in production) and sent to the device
// once per online sign-in over TLS. All access runs as app_service; the table
// has RLS with no policies, so no user session can read it.
import { randomBytes } from 'node:crypto';
import { open, seal } from '../../sealing.ts';
import { withService } from '../../db';
import { findDeviceKey, insertDeviceKey, markIssued, revokeKeys } from './device.queries';

export class DeviceRevokedError extends Error {
	constructor() {
		super('This device has been signed out by an administrator');
	}
}

export class SignInAgainError extends Error {
	constructor() {
		super('Sign in again to unlock this device');
	}
}

/**
 * How soon after a sign-in an existing key is handed out again. The key opens
 * a database that may hold unsynced work, and after 5 wrong PINs only a new
 * password (and TOTP) sign-in may reopen it, not a session that was already
 * open on the device.
 */
export const REISSUE_WINDOW_MS = 10 * 60_000;

/**
 * The 256-bit key for this user's database on this device, created on first
 * use. Throws DeviceRevokedError once the device or user has been revoked, and
 * SignInAgainError when an existing key is asked for by a session whose
 * sign-in (signedInAt, ms) is older than REISSUE_WINDOW_MS.
 */
export async function issueDeviceKey(
	agencyId: string,
	profileId: string,
	deviceId: string,
	signedInAt: number | null | undefined,
	now = Date.now()
): Promise<Buffer> {
	const aad = `${profileId}:${deviceId}`;
	return withService(async (tx) => {
		const existing = await findDeviceKey(tx, profileId, deviceId);
		if (existing) {
			if (existing.revokedAt) throw new DeviceRevokedError();
			if (!signedInAt || now - signedInAt > REISSUE_WINDOW_MS) throw new SignInAgainError();
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
