import { createHash } from 'node:crypto';
// Stable UUIDv5 means repeated receipts/final attempts cannot create another row.
const NAMESPACE = Buffer.from('5cc51fc4053a4396a1f5f2886d0f943d', 'hex');
const PUSH_NAMESPACE = Buffer.from('9b1f0e2a6c8d4e5fa3b7c1d2e4f60718', 'hex');
export const smsFallbackId = (id: string) => fallbackId(NAMESPACE, id);
/** The SMS sent when a mandatory push fails (push-fallback.ts). */
export const pushFallbackId = (id: string) => fallbackId(PUSH_NAMESPACE, id);
function fallbackId(namespace: Buffer, id: string): string {
	const bytes = createHash('sha1')
		.update(namespace)
		.update(Buffer.from(id.replaceAll('-', ''), 'hex'))
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x50;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
