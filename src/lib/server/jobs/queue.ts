// Background jobs (infrastructure.md §5). enqueue() hands a job to Cloud Tasks
// in production, which calls the worker service's /api/jobs/<name> endpoint.
// Locally (JOBS_DRIVER=local, the default) the job runs in this process after
// its delay, through the same handler code.
//
// Payloads carry record IDs only, never PHI: handlers load data themselves.
import { CloudTasksClient } from '@google-cloud/tasks';
import { randomUUID } from 'node:crypto';
import { notificationSandboxAllowed } from '../notification-sandbox.ts';

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

interface LocalTask {
	id: string;
	key?: string;
	job: string;
	payload: unknown;
	scheduledAt: number;
	timer: ReturnType<typeof setTimeout>;
}
const timers = new Map<string, LocalTask>();
const localTasks = new Map<string, LocalTask>();

function takeTask(task: LocalTask) {
	if (!localTasks.delete(task.id)) return false;
	clearTimeout(task.timer);
	if (task.key) timers.delete(task.key);
	return true;
}
async function executeLocal(task: LocalTask): Promise<'completed' | 'failed' | 'gone'> {
	// Timer and explicit fire race for the same claim; only one can run.
	if (!takeTask(task)) return 'gone';
	try {
		const { runJob } = await import('./registry.ts');
		await runJob(task.job, task.payload, { attempt: 0, final: true });
		return 'completed';
	} catch (e) {
		console.error(`local job ${task.job} failed: ${(e as Error).name}`);
		return 'failed';
	}
}

/** Internal development inspection only. The router must additionally authorize each task. */
export function localNotificationTasks() {
	if (!notificationSandboxAllowed(process.env.NODE_ENV !== 'production', process.env)) return [];
	return [...localTasks.values()]
		.filter((task) => task.job === 'notifications-escalate')
		.map((task) => ({
			id: task.id,
			job: task.job,
			scheduledAt: task.scheduledAt,
			payload: task.payload
		}));
}
export async function fireLocalNotificationTask(id: string) {
	if (!notificationSandboxAllowed(process.env.NODE_ENV !== 'production', process.env))
		return 'gone' as const;
	const task = localTasks.get(id);
	if (!task || task.job !== 'notifications-escalate') return 'gone' as const;
	return executeLocal(task);
}

const local: Driver = {
	async enqueue(job, queue, payload, opts) {
		const key = opts.taskName ? `${queue}/${opts.taskName}` : undefined;
		if (key && timers.has(key)) return; // like Cloud Tasks: a named task runs once
		const delay = (opts.delaySeconds ?? 0) * 1000;
		const task: LocalTask = {
			id: randomUUID(),
			key,
			job,
			payload,
			scheduledAt: Date.now() + delay,
			timer: setTimeout(() => void executeLocal(task), delay)
		};
		task.timer.unref?.();
		localTasks.set(task.id, task);
		if (key) timers.set(key, task);
	},
	async cancel(queue, taskName) {
		const key = `${queue}/${taskName}`;
		const task = timers.get(key);
		if (task) takeTask(task);
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

/** gRPC DEADLINE_EXCEEDED and UNAVAILABLE: worth another try. */
const TRANSIENT = new Set([4, 14]);
const CREATE_ATTEMPTS = 3;
const CREATE_BACKOFF_MS = 250;

const cloudTasks: Driver = {
	async enqueue(job, queue, payload, opts) {
		const parent = queuePath(queue);
		const { maxAttemptsFor } = await import('./registry.ts');
		const workerUrl = env('WORKER_URL');
		const request = {
			parent,
			task: {
				name: opts.taskName ? `${parent}/tasks/${opts.taskName}` : undefined,
				scheduleTime: opts.delaySeconds
					? { seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds }
					: undefined,
				httpRequest: {
					httpMethod: 'POST' as const,
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
		};
		for (let attempt = 1; ; attempt++) {
			try {
				await client!.createTask(request);
				return;
			} catch (e) {
				const code = (e as { code?: number }).code;
				// ALREADY_EXISTS: a task with this name was queued already. That's the point of naming it.
				if (code === 6) return;
				// The client doesn't retry createTask, since an unnamed task could be
				// created twice. A named one can't, so a brief outage is retried:
				// a lost escalation step or delivery would otherwise end its chain.
				if (!opts.taskName || !TRANSIENT.has(code ?? -1) || attempt >= CREATE_ATTEMPTS) throw e;
				await new Promise((r) => setTimeout(r, CREATE_BACKOFF_MS * 4 ** (attempt - 1)));
			}
		}
	},
	async cancel(queue, taskName) {
		const parent = queuePath(queue);
		try {
			await client!.deleteTask({ name: `${parent}/tasks/${taskName}` });
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
