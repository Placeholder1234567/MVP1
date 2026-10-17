import { redirect } from '@sveltejs/kit';
import { requireFeature } from '#lib/server/feature-guard.ts';
import type { LayoutServerLoad } from './$types';

// trpc-router.md audit.*: admins on a plan with audit_log.
export const load: LayoutServerLoad = ({ locals }) => {
	requireFeature(locals.user, 'audit_log');
	if (locals.user?.role !== 'admin') redirect(303, '/dashboard');
};
