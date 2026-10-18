import { describe, expect, it } from 'vitest';
import { ReportJobGuard, reportCanConnect, reportStillRunning } from '#lib/app/report-job.ts';

describe('in-memory report viewing context', () => {
	it('rejects old completions after home/account/lock transitions, even after returning', () => {
		const guard = new ReportJobGuard();
		guard.change('agency/profile/home/unlocked');
		const first = guard.capture();
		expect(first()).toBe(true);
		expect(guard.change('agency/profile/home/unlocked')).toBe(false);
		expect(first()).toBe(true);
		for (const context of [
			'agency/profile/home/locked',
			'agency/profile/other/unlocked',
			'agency/other/home/unlocked'
		]) {
			const previous = guard.capture();
			guard.change(context);
			expect(previous()).toBe(false);
		}
		guard.change('agency/profile/home/unlocked');
		expect(first()).toBe(false);
	});
	it('connects only while online, visible and unlocked', () => {
		for (const online of [true, false])
			for (const visible of [true, false])
				for (const locked of [true, false]) {
					expect(reportCanConnect(online, visible, locked)).toBe(online && visible && !locked);
				}
	});
	it('polls only pending jobs, never automatically retries terminal jobs', () => {
		expect(reportStillRunning('queued')).toBe(true);
		expect(reportStillRunning('processing')).toBe(true);
		for (const status of ['ready', 'failed', 'expired', undefined])
			expect(reportStillRunning(status)).toBe(false);
	});
});
