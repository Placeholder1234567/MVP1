// Local stand-in for Cloud Scheduler: runs SCHEDULE in this process when
// JOBS_DRIVER=local. Started once from hooks.server.ts in dev.
import { Cron } from 'croner';
import { jobsDriver } from './queue.ts';
import { runJob, SCHEDULE } from './registry.ts';

let started = false;

export function startLocalSchedule(): void {
	if (started || jobsDriver() !== 'local') return;
	started = true;
	for (const { job, cron } of SCHEDULE) {
		new Cron(cron, { timezone: 'UTC', protect: true }, async () => {
			try {
				await runJob(job, {}, { attempt: 0, final: true });
			} catch (e) {
				console.error(`scheduled job ${job} failed: ${(e as Error).name}`);
			}
		});
	}
}
