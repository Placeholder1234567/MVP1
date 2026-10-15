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
