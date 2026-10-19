import { expect, it } from 'vitest';
import { pushAskReasons, recordUseDay, shouldAskForPush } from '../../../src/lib/domain/push-ask';

const now = new Date('2026-10-19T12:00:00Z');

it('counts distinct days of use, keeping only the first three', () => {
	let days: string[] = [];
	for (const d of ['2026-10-01', '2026-10-01', '2026-10-03', '2026-10-02', '2026-10-09'])
		days = recordUseDay(days, d);
	expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
});

it('asks from the third day of use, never once decided, and again 30 days after Not now', () => {
	const three = ['2026-10-01', '2026-10-02', '2026-10-03'];
	const ask = (o: Partial<Parameters<typeof shouldAskForPush>[0]>) =>
		shouldAskForPush({ days: three, dismissedAt: null, now, permission: 'default', ...o });
	expect(ask({})).toBe(true);
	expect(ask({ days: three.slice(0, 2) })).toBe(false);
	expect(ask({ permission: 'granted' })).toBe(false);
	expect(ask({ permission: 'denied' })).toBe(false);
	expect(ask({ dismissedAt: '2026-10-01T12:00:00Z' })).toBe(false);
	expect(ask({ dismissedAt: '2026-09-19T12:00:00Z' })).toBe(true);
	expect(pushAskReasons('caregiver')[0]).toBe('A shift coverage offer comes in');
	expect(pushAskReasons('supervisor')).toHaveLength(3);
});
