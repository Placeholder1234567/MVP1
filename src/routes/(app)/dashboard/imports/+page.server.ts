import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user || locals.user.role === 'caregiver') error(403, 'Supervisor access required');
	return {
		importFeatures: {
			people: true,
			goals: locals.user.features.includes('goals'),
			medications: locals.user.features.includes('mar')
		}
	};
};
