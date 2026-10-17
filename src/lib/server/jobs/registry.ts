// Every background job: its Cloud Tasks queue, payload schema and handler
// (services.md "Job Registry"). Handlers call services and database helpers,
// never UI code (constitution principle 15).
import { z } from 'zod';
import {
	dispatchNotifications,
	escalate,
	sendDigest,
	sweepDigests,
	sweepMedReminders,
	sweepNotifications
} from '../services/notification/index.ts';
import { applySyncWindows } from '../services/sync/index.ts';
import { searchCoverage, coverageTimer, sweepCoverage } from '../services/schedule/index.ts';
import { checkMissedPunches } from '../services/clock/index.ts';

export interface RunContext {
	/** Cloud Tasks retry count (0 on the first attempt) */
	attempt: number;
	/** True on the last attempt Cloud Tasks will make */
	final: boolean;
}

interface JobDef<P> {
	queue: string;
	payload: z.ZodType<P>;
	/** Matches the queue's retry config, so a handler knows its last attempt */
	maxAttempts: number;
	run(payload: P, ctx: RunContext): Promise<unknown>;
}

const job = <P>(def: JobDef<P>) => def;
const deliveryIds = z.object({ ids: z.array(z.uuid()).max(500).optional() });

const JOBS = {
	'missed-punch-check': job({
		queue: 'timekeeping',
		payload: z.object({}),
		maxAttempts: 2,
		run: () => checkMissedPunches()
	}),
	'coverage-search': job({
		queue: 'scheduling',
		payload: z.object({ agencyId: z.uuid(), id: z.uuid() }),
		maxAttempts: 3,
		run: (p) => searchCoverage(p)
	}),
	'coverage-timeout': job({
		queue: 'scheduling',
		payload: z.object({ agencyId: z.uuid(), id: z.uuid() }),
		maxAttempts: 1,
		run: (p) => coverageTimer(p)
	}),
	'coverage-reminder': job({
		queue: 'scheduling',
		payload: z.object({ agencyId: z.uuid(), id: z.uuid() }),
		maxAttempts: 1,
		run: (p) => coverageTimer(p, true)
	}),
	'coverage-sweep': job({
		queue: 'maintenance',
		payload: z.object({}),
		maxAttempts: 1,
		run: () => sweepCoverage()
	}),
	// One job per channel queue (notifications.md §3): SMS is rate limited to
	// 1/s and each channel has its own retries.
	'notifications-push': job({
		queue: 'notifications-push',
		payload: deliveryIds,
		maxAttempts: 3,
		run: (p, ctx) => dispatchNotifications(p, ctx)
	}),
	'notifications-sms': job({
		queue: 'notifications-sms',
		payload: deliveryIds,
		maxAttempts: 2,
		run: (p, ctx) => dispatchNotifications(p, ctx)
	}),
	'notifications-email': job({
		queue: 'notifications-email',
		payload: deliveryIds,
		maxAttempts: 3,
		run: (p, ctx) => dispatchNotifications(p, ctx)
	}),
	// Kept so tasks queued before the per-channel queues still run.
	'notifications-dispatch': job({
		queue: 'notifications-push',
		payload: deliveryIds,
		maxAttempts: 3,
		run: (p, ctx) => dispatchNotifications(p, ctx)
	}),
	'notifications-escalate': job({
		queue: 'notifications-escalation',
		payload: z.object({
			agencyId: z.uuid(),
			type: z.string().max(64),
			referenceId: z.uuid().nullable(),
			notificationId: z.uuid(),
			step: z.number().int().min(1).max(3)
		}),
		maxAttempts: 1,
		run: (p) => escalate(p)
	}),
	'daily-digest-sweep': job({
		queue: 'maintenance',
		payload: z.object({}).passthrough(),
		maxAttempts: 1,
		run: () => sweepDigests()
	}),
	'daily-digest': job({
		queue: 'notifications-digest',
		payload: z.object({ agencyId: z.uuid() }),
		maxAttempts: 1,
		run: (p) => sendDigest(p)
	}),
	'med-reminder-sweep': job({
		queue: 'maintenance',
		payload: z.object({}).passthrough(),
		maxAttempts: 1,
		run: () => sweepMedReminders()
	}),
	'notifications-sweep': job({
		queue: 'maintenance',
		payload: z.object({}).passthrough(),
		maxAttempts: 1,
		run: () => sweepNotifications()
	}),
	'sync-window': job({
		queue: 'maintenance',
		payload: z.object({}).passthrough(),
		maxAttempts: 2,
		run: () => applySyncWindows()
	})
};

export type JobName = keyof typeof JOBS;

export function isJob(name: string): name is JobName {
	return Object.hasOwn(JOBS, name);
}

export function queueFor(name: string): string {
	if (!isJob(name)) throw new Error(`unknown job ${name}`);
	return JOBS[name].queue;
}

/** Every Cloud Tasks queue the jobs use, with the most attempts any of its jobs needs. */
export function queueAttempts(): Record<string, number> {
	const out: Record<string, number> = {};
	for (const def of Object.values(JOBS)) {
		out[def.queue] = Math.max(out[def.queue] ?? 1, def.maxAttempts);
	}
	return out;
}

export function maxAttemptsFor(name: string): number {
	if (!isJob(name)) throw new Error(`unknown job ${name}`);
	return JOBS[name].maxAttempts;
}

export async function runJob(name: string, payload: unknown, ctx: RunContext) {
	if (!isJob(name)) throw new Error(`unknown job ${name}`);
	const def = JOBS[name] as JobDef<unknown>;
	return def.run(def.payload.parse(payload ?? {}), ctx);
}

/**
 * Recurring jobs. In production each is a Cloud Scheduler job calling the
 * worker; locally schedule.ts runs them in-process. Times are UTC
 * (03:00 America/New_York is 07:00 or 08:00 UTC; per-agency times come later).
 */
export const SCHEDULE: Array<{ job: JobName; cron: string }> = [
	{ job: 'missed-punch-check', cron: '*/15 * * * *' },
	{ job: 'coverage-sweep', cron: '*/5 * * * *' },
	{ job: 'notifications-sweep', cron: '*/5 * * * *' },
	// Each agency's digest goes out at 06:00 its local time (digest.ts).
	{ job: 'daily-digest-sweep', cron: '*/15 * * * *' },
	// Doses due in 30 minutes, and doses 30 minutes late (med-reminders.ts).
	{ job: 'med-reminder-sweep', cron: '*/5 * * * *' },
	{ job: 'sync-window', cron: '0 8 * * *' }
];
