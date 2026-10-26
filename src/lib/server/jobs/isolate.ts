// Sweeps that work through every agency (or every pending row) run each one
// on its own: one agency's bad data or a failed write must not stop the
// medication and incident alerts of every agency after it in the loop.

export class SweepFailures extends Error {
	constructor(label: string, count: number) {
		super(`${label}: ${count} failed`);
		this.name = 'SweepFailures';
	}
}

/**
 * Runs `fn` for each item in turn, carrying on past failures. Each failure
 * is logged by ID and error name only (no PHI). If any failed, throws
 * SweepFailures once all have run, so the job still reports a failure.
 */
export async function forEachIsolated<T>(
	label: string,
	items: readonly T[],
	id: (item: T) => string,
	fn: (item: T) => Promise<void>
): Promise<void> {
	let failed = 0;
	for (const item of items) {
		try {
			await fn(item);
		} catch (e) {
			failed++;
			console.error(`${label} ${id(item)} failed: ${(e as Error)?.name ?? 'Error'}`);
		}
	}
	if (failed) throw new SweepFailures(label, failed);
}
