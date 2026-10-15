// Prints the Cloud Tasks queues and Cloud Scheduler jobs that the job registry
// needs (infrastructure.md §5), as shell-friendly lines for deploy/deploy.sh:
//   queue <name> <maxConcurrentDispatches> <maxDispatchesPerSecond> <maxAttempts>
//   cron <job> <schedule>
// Run with: npx tsx scripts/cloud-jobs.ts
import { queueAttempts, SCHEDULE } from '../src/lib/server/jobs/registry.ts';

// services.md "Queue configuration". Queues not listed there get the default.
const SETTINGS: Record<string, { concurrency: number; perSecond?: number }> = {
	ai: { concurrency: 3 },
	scheduling: { concurrency: 10 },
	timekeeping: { concurrency: 5 },
	'notifications-push': { concurrency: 20 },
	'notifications-sms': { concurrency: 5, perSecond: 1 },
	'notifications-email': { concurrency: 10 },
	'notifications-escalation': { concurrency: 5 },
	'notifications-digest': { concurrency: 3 },
	reports: { concurrency: 2 },
	maintenance: { concurrency: 1 }
};

for (const [queue, attempts] of Object.entries(queueAttempts()).sort()) {
	const s = SETTINGS[queue] ?? { concurrency: 5 };
	console.log(`queue ${queue} ${s.concurrency} ${s.perSecond ?? 10} ${attempts}`);
}
for (const { job, cron } of SCHEDULE) console.log(`cron ${job} ${cron}`);
