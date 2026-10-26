import { afterEach, expect, it, vi } from 'vitest';
import { forEachIsolated, SweepFailures } from '../../../../src/lib/server/jobs/isolate';

afterEach(() => vi.restoreAllMocks());

it('runs every item even when one fails, then reports the failure', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const done: string[] = [];
	const run = forEachIsolated(
		'test agency',
		['a', 'b', 'c'],
		(id) => id,
		async (id) => {
			if (id === 'b') throw new TypeError('Synthetic person name in message');
			done.push(id);
		}
	);
	await expect(run).rejects.toBeInstanceOf(SweepFailures);
	await expect(run).rejects.toThrow('test agency: 1 failed');
	expect(done).toEqual(['a', 'c']);
	// ID and error name only: the message can carry PHI.
	expect(log).toHaveBeenCalledWith('test agency b failed: TypeError');
	expect(String(log.mock.calls)).not.toContain('Synthetic');
});

it('resolves when every item succeeds', async () => {
	const seen: number[] = [];
	await forEachIsolated('test', [1, 2], String, async (n) => void seen.push(n));
	expect(seen).toEqual([1, 2]);
});
