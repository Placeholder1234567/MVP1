import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { notificationSandboxAllowed } from '#lib/server/notification-sandbox.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!notificationSandboxAllowed(dev, process.env) || locals.user?.role !== 'admin')
		error(404, 'Not found');
	return {};
};
