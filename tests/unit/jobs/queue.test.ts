import { afterEach, expect, it, vi } from 'vitest';

const cloud = vi.hoisted(() => ({
	queuePath: vi.fn(() => 'projects/test/locations/test/queues/maintenance'),
	deleteTask: vi.fn(async () => ({})),
	createTask: vi.fn(async () => ({}))
}));
const runJob = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@google-cloud/tasks', () => ({
	CloudTasksClient: class {
		queuePath = cloud.queuePath;
		deleteTask = cloud.deleteTask;
		createTask = cloud.createTask;
	}
}));
vi.mock('../../../src/lib/server/jobs/registry.ts', () => ({
	queueFor: () => 'maintenance',
	maxAttemptsFor: () => 2,
	runJob
}));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
	vi.resetModules();
});

it('can cancel a Cloud Task before any task has been enqueued in this process', async () => {
	vi.stubEnv('JOBS_DRIVER', 'cloud-tasks');
	vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test');
	vi.stubEnv('GOOGLE_CLOUD_REGION', 'test');
	const { cancel } = await import('../../../src/lib/server/jobs/queue');
	await cancel('sync-window', 'pending-task');
	expect(cloud.deleteTask).toHaveBeenCalledWith({
		name: 'projects/test/locations/test/queues/maintenance/tasks/pending-task'
	});
});

it('deduplicates delayed local tasks and cancellation prevents execution', async () => {
	vi.useFakeTimers();
	vi.stubEnv('JOBS_DRIVER', 'local');
	const { enqueue, cancel } = await import('../../../src/lib/server/jobs/queue');
	await enqueue('sync-window', {}, { taskName: 'one', delaySeconds: 10 });
	await enqueue('sync-window', {}, { taskName: 'one', delaySeconds: 10 });
	await enqueue('sync-window', {}, { taskName: 'cancelled', delaySeconds: 10 });
	await cancel('sync-window', 'cancelled');
	await vi.advanceTimersByTimeAsync(10000);
	expect(runJob).toHaveBeenCalledExactlyOnceWith('sync-window', {}, { attempt: 0, final: true });
});

function sandbox() {
	vi.stubEnv('NODE_ENV', 'development');
	vi.stubEnv('JOBS_DRIVER', 'local');
	vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'demo-guad');
	vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
	vi.stubEnv('DATABASE_URL', 'postgres://localhost/test');
	vi.stubEnv('CLOUD_SQL_INSTANCE', '');
	vi.stubEnv('PUSH_DRIVER', 'console');
	vi.stubEnv('SMS_DRIVER', 'console');
	vi.stubEnv('EMAIL_DRIVER', 'smtp');
	vi.stubEnv('SMTP_URL', '');
}

it('claims a synthetic notification timer once across explicit fire and the natural timer', async () => {
	vi.useFakeTimers();
	sandbox();
	const { enqueue, localNotificationTasks, fireLocalNotificationTask } =
		await import('../../../src/lib/server/jobs/queue');
	const payload = { referenceId: 'synthetic-reference' };
	await enqueue('notifications-escalate', payload, { taskName: 'test', delaySeconds: 10 });
	const [task] = localNotificationTasks();
	expect(task.payload).toBe(payload);
	const results = await Promise.all([
		fireLocalNotificationTask(task.id),
		fireLocalNotificationTask(task.id)
	]);
	expect(results.sort()).toEqual(['completed', 'gone']);
	await vi.advanceTimersByTimeAsync(10000);
	expect(runJob).toHaveBeenCalledExactlyOnceWith('notifications-escalate', payload, {
		attempt: 0,
		final: true
	});
	expect(localNotificationTasks()).toEqual([]);
});

it('never exposes report cleanup jobs and preserves their revision-bound payload on natural execution', async () => {
	vi.useFakeTimers();
	sandbox();
	const { enqueue, localNotificationTasks, fireLocalNotificationTask } =
		await import('../../../src/lib/server/jobs/queue');
	const payload = { id: 'report-id', revision: 'captured-revision' };
	await enqueue('report-cleanup', payload, { taskName: 'report', delaySeconds: 10 });
	expect(localNotificationTasks()).toEqual([]);
	expect(await fireLocalNotificationTask('missing')).toBe('gone');
	await vi.advanceTimersByTimeAsync(10000);
	expect(runJob).toHaveBeenCalledExactlyOnceWith('report-cleanup', payload, {
		attempt: 0,
		final: true
	});
});

it('fails closed for development inspection and fire when a real delivery provider is configured', async () => {
	vi.useFakeTimers();
	sandbox();
	const { enqueue, cancel, localNotificationTasks, fireLocalNotificationTask } =
		await import('../../../src/lib/server/jobs/queue');
	await enqueue('notifications-escalate', {}, { taskName: 'guarded', delaySeconds: 10 });
	const [task] = localNotificationTasks();
	vi.stubEnv('SMS_DRIVER', 'aws');
	expect(localNotificationTasks()).toEqual([]);
	expect(await fireLocalNotificationTask(task.id)).toBe('gone');
	expect(runJob).not.toHaveBeenCalled();
	await cancel('notifications-escalate', 'guarded');
});

function cloudEnv() {
	vi.stubEnv('JOBS_DRIVER', 'cloud-tasks');
	vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test');
	vi.stubEnv('GOOGLE_CLOUD_REGION', 'test');
	vi.stubEnv('WORKER_URL', 'https://worker.example.test');
	vi.stubEnv('WORKER_SERVICE_ACCOUNT', 'worker@test.iam.gserviceaccount.com');
}
const grpcError = (code: number) => Object.assign(new Error('Synthetic gRPC error'), { code });

it('retries a named Cloud Task through a brief outage', async () => {
	vi.useFakeTimers();
	cloudEnv();
	cloud.createTask
		.mockRejectedValueOnce(grpcError(14))
		.mockRejectedValueOnce(grpcError(4))
		.mockResolvedValueOnce({});
	const { enqueue } = await import('../../../src/lib/server/jobs/queue');
	const done = enqueue('sync-window', {}, { taskName: 'named' });
	await vi.runAllTimersAsync();
	await done;
	expect(cloud.createTask).toHaveBeenCalledTimes(3);
});

it('gives up after three tries, and never retries an unnamed task or a lasting error', async () => {
	vi.useFakeTimers();
	cloudEnv();
	const { enqueue } = await import('../../../src/lib/server/jobs/queue');

	cloud.createTask.mockRejectedValue(grpcError(14));
	const named = enqueue('sync-window', {}, { taskName: 'named' }).catch((e) => e);
	await vi.runAllTimersAsync();
	expect((await named).code).toBe(14);
	expect(cloud.createTask).toHaveBeenCalledTimes(3);

	cloud.createTask.mockClear();
	await expect(enqueue('sync-window', {})).rejects.toMatchObject({ code: 14 });
	expect(cloud.createTask).toHaveBeenCalledTimes(1);

	cloud.createTask.mockClear().mockRejectedValue(grpcError(7));
	await expect(enqueue('sync-window', {}, { taskName: 'named' })).rejects.toMatchObject({
		code: 7
	});
	expect(cloud.createTask).toHaveBeenCalledTimes(1);
});
