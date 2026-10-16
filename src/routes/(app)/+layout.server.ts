import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { profileId, agencyId, name, role, homeIds, timeZone, medCertified, features } =
		locals.user;
	return { user: { profileId, agencyId, name, role, homeIds, timeZone, medCertified, features } };
};
