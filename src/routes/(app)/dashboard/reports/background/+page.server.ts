import { requireFeature } from '#lib/server/feature-guard.ts';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user || locals.user.role === 'caregiver') error(403, 'Supervisor access required');
	requireFeature(locals.user, 'reports');
};
