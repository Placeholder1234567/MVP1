import { error, json } from '@sveltejs/kit';
import { createSyncCredential } from '#lib/server/identity.ts';
import type { RequestHandler } from './$types';

/**
 * POST: what the browser needs for a PowerSync token (see createSyncCredential).
 * Needed after a reload, because tokens are never stored (infrastructure.md §3).
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json(await createSyncCredential(locals.user.authUid));
};
