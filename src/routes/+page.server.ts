import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	// Only what the page shows; no client data yet.
	return { user: { name: locals.user.name, role: locals.user.role, homeIds: locals.user.homeIds } };
};
