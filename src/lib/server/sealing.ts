// AES-256-GCM sealing for server-held secrets (device database keys, webhook
// signing secrets). The key-encryption key is DEVICE_KEY_KEK (Secret Manager
// in production); each secret is bound to its record by the AAD, so a sealed
// value copied to another record won't open.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function kek(): Buffer {
	const raw = process.env.DEVICE_KEY_KEK;
	if (!raw) throw new Error('DEVICE_KEY_KEK is not set');
	const key = Buffer.from(raw, 'base64url');
	if (key.length !== 32) throw new Error('DEVICE_KEY_KEK must be 32 bytes (base64url)');
	return key;
}

/** iv (12) | tag (16) | ciphertext, base64url. */
export function seal(plain: Buffer, aad: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', kek(), iv).setAAD(Buffer.from(aad));
	const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

export function open(sealed: string, aad: string): Buffer {
	const buf = Buffer.from(sealed, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', kek(), buf.subarray(0, 12))
		.setAAD(Buffer.from(aad))
		.setAuthTag(buf.subarray(12, 28));
	return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}
