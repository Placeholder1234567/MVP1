import { expect, it, vi } from 'vitest';
import { UploadStatus } from '../../../src/lib/sync/upload-status';

function deferred() {
	let resolve!: (value: number) => void;
	const promise = new Promise<number>((done) => (resolve = done));
	return { resolve, promise };
}
it('does not claim sync completion while a queue read is pending', async () => {
	const queue = deferred();
	const emit = vi.fn();
	const monitor = new UploadStatus(
		() => queue.promise,
		() => ({ connected: true, synced: true }),
		emit
	);
	const check = monitor.refresh();
	expect(emit).toHaveBeenLastCalledWith(null, 'Checking sync…');
	queue.resolve(1);
	await check;
	expect(emit).toHaveBeenLastCalledWith(1, 'Syncing…');
});
it('an older empty-queue result cannot overwrite a newer pending upload', async () => {
	const first = deferred(),
		second = deferred();
	const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	const emit = vi.fn();
	const monitor = new UploadStatus(read, () => ({ connected: true, synced: true }), emit);
	const old = monitor.refresh(),
		current = monitor.refresh();
	second.resolve(2);
	await current;
	first.resolve(0);
	await old;
	expect(emit).toHaveBeenLastCalledWith(2, 'Syncing…');
});
it('only reports completion for a checked empty queue with an initial sync', async () => {
	let synced = false;
	const emit = vi.fn();
	const monitor = new UploadStatus(
		async () => 0,
		() => ({ connected: true, synced }),
		emit
	);
	await monitor.refresh();
	expect(emit).toHaveBeenLastCalledWith(0, 'Syncing…');
	synced = true;
	await monitor.refresh();
	expect(emit).toHaveBeenLastCalledWith(0, 'All changes synced');
});
it('uses the current connection and fails closed on an unavailable queue', async () => {
	const queue = deferred();
	let connected = true;
	const emit = vi.fn();
	const monitor = new UploadStatus(
		() => queue.promise,
		() => ({ connected, synced: true }),
		emit
	);
	const check = monitor.refresh();
	connected = false;
	queue.resolve(0);
	await check;
	expect(emit).toHaveBeenLastCalledWith(0, 'Offline · saved on this device');
	const failed = new UploadStatus(
		async () => {
			throw new Error('Synthetic storage failure');
		},
		() => ({ connected: true, synced: true }),
		emit
	);
	await failed.refresh();
	expect(emit).toHaveBeenLastCalledWith(null, 'Could not check sync status');
});
it('ignores outstanding and queued refreshes after the session is disposed', async () => {
	const queue = deferred();
	const emit = vi.fn();
	const monitor = new UploadStatus(
		() => queue.promise,
		() => ({ connected: true, synced: true }),
		emit
	);
	const check = monitor.refresh();
	monitor.cancel();
	queue.resolve(0);
	await check;
	await monitor.refresh();
	expect(emit).toHaveBeenCalledTimes(1);
	expect(emit).toHaveBeenLastCalledWith(null, 'Checking sync…');
});
