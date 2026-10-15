import { router } from './middleware.ts';
import { agencyRouter } from './routers/agency.ts';
import { authRouter } from './routers/auth.ts';
import { deviceRouter } from './routers/device.ts';
import { homeRouter } from './routers/home.ts';
import { syncRouter } from './routers/sync.ts';

// Root router (trpc-router.md). One router per domain, added as they're built.
export const appRouter = router({
	auth: authRouter,
	agency: agencyRouter,
	device: deviceRouter,
	home: homeRouter,
	sync: syncRouter
});

export type AppRouter = typeof appRouter;
