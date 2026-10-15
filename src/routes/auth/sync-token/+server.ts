import { error, json } from '@sveltejs/kit';
import { createSyncToken } from '#lib/server/identity.ts';
import type { RequestHandler } from './$types';

/**
 * POST: a Firebase custom token for the signed-in user. The browser exchanges
 * it (signInWithCustomToken) for an in-memory ID token that PowerSync uses.
 * Needed after a reload, because the ID token is never stored (infrastructure.md §3).
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json({ customToken: await createSyncToken(locals.user.authUid) });
};
