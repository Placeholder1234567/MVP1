import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Agency settings are admin-only (trpc-router.md: agency.update, home.create/update).
export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user?.role !== 'admin') redirect(303, '/dashboard');
};
