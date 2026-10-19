// Typed tRPC client for the browser. Types come straight from the server
// router, so there are no hand-written API types (CLAUDE.md tRPC conventions).
import { createTRPCClient, httpBatchLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import superjson from 'superjson';
import type { AppRouter } from '#lib/server/trpc/router.ts';
import { showUpgrade } from '#lib/app/upgrade.svelte.ts';

/**
 * Plan gates (entitlements.md §9): a FORBIDDEN answer naming a missing
 * feature opens the upgrade dialog. The error still reaches the caller.
 */
const upgradeLink: TRPCLink<AppRouter> =
	() =>
	({ next, op }) =>
		observable((observer) =>
			next(op).subscribe({
				next: (value) => observer.next(value),
				error: (err) => {
					const data = err.data as { upgradeRequired?: boolean; feature?: string } | undefined;
					if (data?.upgradeRequired && data.feature) showUpgrade(data.feature);
					observer.error(err);
				},
				complete: () => observer.complete()
			})
		);

export const trpc = createTRPCClient<AppRouter>({
	links: [upgradeLink, httpBatchLink({ url: '/api/trpc', transformer: superjson })]
});
