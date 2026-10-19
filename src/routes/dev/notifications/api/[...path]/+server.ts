import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { notificationSandboxAllowed } from '#lib/server/notification-sandbox.ts';
import { createContext } from '#lib/server/trpc/context.ts';
import { devNotificationRouter } from '#lib/server/trpc/routers/dev-notification.ts';
import type { RequestHandler } from './$types';

const handler: RequestHandler = (event) => {
	if (!notificationSandboxAllowed(dev, process.env)) error(404, 'Not found');
	return fetchRequestHandler({
		endpoint: '/dev/notifications/api',
		req: event.request,
		router: devNotificationRouter,
		createContext: () => createContext(event)
	});
};
export const GET = handler;
export const POST = handler;
