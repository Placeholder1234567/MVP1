import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// API keys are admin-only (rls.sql api_keys; openapi.yaml "Authentication").
export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user?.role !== 'admin') redirect(303, '/dashboard');
};
