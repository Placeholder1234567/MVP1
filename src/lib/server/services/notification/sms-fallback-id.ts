import { createHash } from 'node:crypto';
// Stable UUIDv5 means repeated receipts/final attempts cannot create another row.
const NAMESPACE = Buffer.from('5cc51fc4053a4396a1f5f2886d0f943d', 'hex');
export function smsFallbackId(id: string): string {
	const bytes = createHash('sha1')
		.update(NAMESPACE)
		.update(Buffer.from(id.replaceAll('-', ''), 'hex'))
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x50;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
