// Every background job: its Cloud Tasks queue, payload schema and handler
// (services.md "Job Registry"). Handlers call services and database helpers,
// never UI code (constitution principle 15).
import { z } from 'zod';
import { dispatchNotifications, sweepNotifications } from '../services/notification/index.ts';
import { applySyncWindows } from '../services/sync/index.ts';

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

const JOBS = {
	'notifications-dispatch': job({
		queue: 'notifications-push',
		payload: z.object({ ids: z.array(z.uuid()).max(500).optional() }),
		maxAttempts: 3,
		run: (p) => dispatchNotifications(p)
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
	{ job: 'notifications-sweep', cron: '*/5 * * * *' },
	{ job: 'sync-window', cron: '0 8 * * *' }
];
