import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '#lib/server/trpc/context.ts';
import { appRouter } from '#lib/server/trpc/router.ts';
import type { RequestHandler } from './$types';

// All internal frontend-to-backend calls (constitution principle 8).
const handler: RequestHandler = (event) =>
	fetchRequestHandler({
		endpoint: '/api/trpc',
		req: event.request,
		router: appRouter,
		createContext: () => createContext(event)
	});

export const GET = handler;
export const POST = handler;
