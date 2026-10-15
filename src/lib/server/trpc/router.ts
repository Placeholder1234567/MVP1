import { router } from './middleware.ts';
import { agencyRouter } from './routers/agency.ts';
import { authRouter } from './routers/auth.ts';
import { homeRouter } from './routers/home.ts';

// Root router (trpc-router.md). One router per domain, added as they're built.
export const appRouter = router({
	auth: authRouter,
	agency: agencyRouter,
	home: homeRouter
});

export type AppRouter = typeof appRouter;
