// Typed tRPC client for the browser. Types come straight from the server
// router, so there are no hand-written API types (CLAUDE.md tRPC conventions).
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '#lib/server/trpc/router.ts';

export const trpc = createTRPCClient<AppRouter>({
	links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })]
});
