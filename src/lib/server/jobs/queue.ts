// Background jobs (infrastructure.md §5). enqueue() hands a job to Cloud Tasks
// in production, which calls the worker service's /api/jobs/<name> endpoint.
// Locally (JOBS_DRIVER=local, the default) the job runs in this process after
// its delay, through the same handler code.
//
// Payloads carry record IDs only, never PHI: handlers load data themselves.
import { CloudTasksClient } from '@google-cloud/tasks';

export interface EnqueueOptions {
	/** Run no sooner than this many seconds from now (Cloud Tasks allows up to 30 days). */
	delaySeconds?: number;
	/**
	 * Deterministic name, so the same job isn't queued twice and can be
	 * cancelled (e.g. a coverage timeout once the shift is filled).
	 */
	taskName?: string;
}

interface Driver {
	enqueue(job: string, queue: string, payload: unknown, opts: EnqueueOptions): Promise<void>;
	cancel(queue: string, taskName: string): Promise<void>;
}

// ─── Local driver ────────────────────────────────────────────────────────────

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const local: Driver = {
	async enqueue(job, queue, payload, opts) {
		const key = opts.taskName ? `${queue}/${opts.taskName}` : undefined;
		if (key && timers.has(key)) return; // like Cloud Tasks: a named task runs once
		const timer = setTimeout(
			async () => {
				if (key) timers.delete(key);
				try {
					const { runJob } = await import('./registry.ts');
					await runJob(job, payload, { attempt: 0, final: true });
				} catch (e) {
					console.error(`local job ${job} failed: ${(e as Error).name}`);
				}
			},
			(opts.delaySeconds ?? 0) * 1000
		);
		timer.unref?.();
		if (key) timers.set(key, timer);
	},
	async cancel(queue, taskName) {
		const key = `${queue}/${taskName}`;
		clearTimeout(timers.get(key));
		timers.delete(key);
	}
};

// ─── Cloud Tasks driver ──────────────────────────────────────────────────────

let client: CloudTasksClient | undefined;

function env(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
}

function queuePath(queue: string) {
	client ??= new CloudTasksClient();
	const [project, location, prefix] = [
		env('GOOGLE_CLOUD_PROJECT'),
		env('GOOGLE_CLOUD_REGION'),
		process.env.TASKS_QUEUE_PREFIX ?? ''
	];
	return client.queuePath(project, location, `${prefix}${queue}`);
}

const cloudTasks: Driver = {
	async enqueue(job, queue, payload, opts) {
		const parent = queuePath(queue);
		const { maxAttemptsFor } = await import('./registry.ts');
		const workerUrl = env('WORKER_URL');
		try {
			await client!.createTask({
				parent,
				task: {
					name: opts.taskName ? `${parent}/tasks/${opts.taskName}` : undefined,
					scheduleTime: opts.delaySeconds
						? { seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds }
						: undefined,
					httpRequest: {
						httpMethod: 'POST',
						url: `${workerUrl}/api/jobs/${job}`,
						headers: {
							'content-type': 'application/json',
							// Lets the handler know its last attempt (Cloud Tasks only sends the retry count).
							'x-guad-max-attempts': String(maxAttemptsFor(job))
						},
						body: Buffer.from(JSON.stringify(payload ?? {})).toString('base64'),
						// Google signs a token for the worker's service account; the
						// endpoint accepts nothing else (jobs/oidc.ts).
						oidcToken: { serviceAccountEmail: env('WORKER_SERVICE_ACCOUNT'), audience: workerUrl }
					}
				}
			});
		} catch (e) {
			// ALREADY_EXISTS: a task with this name was queued already. That's the point of naming it.
			if ((e as { code?: number }).code === 6) return;
			throw e;
		}
	},
	async cancel(queue, taskName) {
		try {
			await client!.deleteTask({ name: `${queuePath(queue)}/tasks/${taskName}` });
		} catch (e) {
			if ((e as { code?: number }).code === 5) return; // NOT_FOUND: already ran or never queued
			throw e;
		}
	}
};

export function jobsDriver(): 'local' | 'cloud-tasks' {
	return process.env.JOBS_DRIVER === 'cloud-tasks' ? 'cloud-tasks' : 'local';
}

const driver = () => (jobsDriver() === 'cloud-tasks' ? cloudTasks : local);

/** Queues a job by name. Use afterCommit() when it reads rows the caller is writing. */
export async function enqueue(job: string, payload: unknown, opts: EnqueueOptions = {}) {
	const { queueFor } = await import('./registry.ts');
	await driver().enqueue(job, queueFor(job), payload, opts);
}

/** Cancels a named job that hasn't run yet. No error if it already ran. */
export async function cancel(job: string, taskName: string) {
	const { queueFor } = await import('./registry.ts');
	await driver().cancel(queueFor(job), taskName);
}
