// API keys for the external API (openapi.yaml "Authentication"; rls.sql
// api_keys). Admins create and revoke keys in the app; the plaintext key is
// shown once and only its SHA-256 is stored (keys are 256 random bits, so a
// fast hash is enough). Keys are revoked, never deleted, so access history
// stays auditable.
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { API_KEY_PATTERN, API_KEY_PREFIX_LENGTH, type ApiScope } from '../../../domain/index.ts';
import { resolveFeatures } from '../../../entitlements/tier-features.ts';
import { withService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { deactivateKeyWebhooks } from './webhooks.queries';
import {
	insertAccess,
	insertKey,
	keyByHash,
	selectKeys,
	setRevoked,
	touchKey
} from './keys.queries';

export const CreateKeyInput = z.object({
	name: z.string().trim().min(1).max(80),
	scope: z.enum(['read', 'write']).default('read')
});

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function listApiKeys(tx: Tx, agencyId: string) {
	return selectKeys(tx, agencyId);
}

/** Creates a key and returns its plaintext, which is never shown again. */
export async function createApiKey(
	tx: Tx,
	agencyId: string,
	profileId: string,
	input: z.input<typeof CreateKeyInput>
) {
	const { name, scope } = CreateKeyInput.parse(input);
	const key = `guad_${randomBytes(32).toString('base64url')}`;
	const prefix = key.slice(0, API_KEY_PREFIX_LENGTH);
	const row = await insertKey(tx, {
		agency_id: agencyId,
		name,
		key_hash: hashKey(key),
		key_prefix: prefix,
		scope,
		created_by: profileId
	});
	return { id: row.id, name, prefix, scope, createdAt: row.createdAt, key };
}

export async function revokeApiKey(tx: Tx, agencyId: string, id: string) {
	if (!(await setRevoked(tx, agencyId, id)))
		throw new ServiceError('NOT_FOUND', 'That key does not exist or is already revoked');
	// Its webhooks stop too: a leaked key's webhooks mustn't keep receiving events.
	await deactivateKeyWebhooks(tx, agencyId, id);
	return { revoked: true };
}

export interface ApiCaller {
	keyId: string;
	agencyId: string;
	scope: ApiScope;
	timeZone: string;
	features: Set<string>;
}

/** The caller for a bearer token, or null if it isn't a live key. */
export async function authenticateKey(token: string, now = new Date()): Promise<ApiCaller | null> {
	if (!API_KEY_PATTERN.test(token)) return null;
	return withService(async (tx) => {
		const row = await keyByHash(tx, hashKey(token));
		if (!row) return null;
		await touchKey(tx, row.agencyId, row.id, now);
		return {
			keyId: row.id,
			agencyId: row.agencyId,
			scope: row.scope === 'write' ? 'write' : 'read',
			timeZone: row.timeZone,
			features: resolveFeatures(row.tier, row.enabledFeatures)
		};
	});
}

/** One audit row per API call: which key, which operation, its parameters and the outcome. */
export function logApiAccess(entry: {
	caller: ApiCaller;
	operation: string;
	params: Record<string, string>;
	status: number;
	records?: number;
	ip: string | null;
	userAgent: string | null;
}) {
	return withService((tx) =>
		insertAccess(tx, {
			agencyId: entry.caller.agencyId,
			keyId: entry.caller.keyId,
			values: {
				operation: entry.operation,
				params: entry.params,
				status: entry.status,
				...(entry.records !== undefined ? { records: entry.records } : {})
			},
			ip: entry.ip,
			userAgent: entry.userAgent
		})
	);
}
