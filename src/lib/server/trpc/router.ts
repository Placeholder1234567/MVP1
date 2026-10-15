import { router } from './middleware.ts';
import { agencyRouter } from './routers/agency.ts';
import { authRouter } from './routers/auth.ts';
import { attendanceRouter, healthRouter, incidentRouter } from './routers/care.ts';
import { deviceRouter } from './routers/device.ts';
import { homeRouter } from './routers/home.ts';
import { lomiRouter } from './routers/lomi.ts';
import { intakeRouter } from './routers/intake.ts';
import { marRouter, medicationRouter } from './routers/mar.ts';
import { noteRouter } from './routers/note.ts';
import { syncRouter } from './routers/sync.ts';
import { clockRouter, scheduleRouter, coverageRouter } from './routers/workforce.ts';

// Root router (trpc-router.md). One router per domain, added as they're built.
export const appRouter = router({
	auth: authRouter,
	agency: agencyRouter,
	attendance: attendanceRouter,
	clock: clockRouter,
	coverage: coverageRouter,
	device: deviceRouter,
	health: healthRouter,
	home: homeRouter,
	lomi: lomiRouter,
	intake: intakeRouter,
	incident: incidentRouter,
	mar: marRouter,
	medication: medicationRouter,
	note: noteRouter,
	schedule: scheduleRouter,
	sync: syncRouter
});

export type AppRouter = typeof appRouter;
