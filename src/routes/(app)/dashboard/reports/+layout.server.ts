import { requireFeature } from '#lib/server/feature-guard.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) =>
	requireFeature(locals.user, 'reports', 'reports_basic');
