import { router } from './middleware.ts';
import { agencyRouter } from './routers/agency.ts';
import { analyticsRouter } from './routers/analytics.ts';
import { auditRouter } from './routers/audit.ts';
import { apiKeyRouter } from './routers/api-key.ts';
import { authRouter } from './routers/auth.ts';
import { caseNoteRouter } from './routers/case-note.ts';
import { clientRouter } from './routers/client.ts';
import { attendanceRouter, healthRouter, incidentRouter } from './routers/care.ts';
import { deviceRouter } from './routers/device.ts';
import { goalRouter } from './routers/goal.ts';
import { homeRouter } from './routers/home.ts';
import { lomiRouter } from './routers/lomi.ts';
import { intakeRouter } from './routers/intake.ts';
import { notificationRouter } from './routers/notification.ts';
import { marRouter, medicationRouter } from './routers/mar.ts';
import { noteRouter } from './routers/note.ts';
import { syncRouter } from './routers/sync.ts';
import { reportRouter } from './routers/report.ts';
import { staffRouter } from './routers/staff.ts';
import { clockRouter, scheduleRouter, coverageRouter } from './routers/workforce.ts';

// Root router (trpc-router.md). One router per domain, added as they're built.
export const appRouter = router({
	auth: authRouter,
	agency: agencyRouter,
	analytics: analyticsRouter,
	audit: auditRouter,
	apiKey: apiKeyRouter,
	attendance: attendanceRouter,
	caseNote: caseNoteRouter,
	client: clientRouter,
	clock: clockRouter,
	coverage: coverageRouter,
	device: deviceRouter,
	goal: goalRouter,
	health: healthRouter,
	home: homeRouter,
	lomi: lomiRouter,
	intake: intakeRouter,
	notification: notificationRouter,
	incident: incidentRouter,
	mar: marRouter,
	medication: medicationRouter,
	note: noteRouter,
	report: reportRouter,
	schedule: scheduleRouter,
	staff: staffRouter,
	sync: syncRouter
});

export type AppRouter = typeof appRouter;
