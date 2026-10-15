import { expect, it } from 'vitest';
import { privacyLockDue, IDLE_LOCK_MS, BACKGROUND_LOCK_MS } from '../../../src/lib/domain/privacy';

it('locks at the idle deadline, including when a suspended timer resumes late', () => {
	const start = 100000;
	expect(privacyLockDue(start + IDLE_LOCK_MS - 1, start, null)).toBe(false);
	expect(privacyLockDue(start + IDLE_LOCK_MS, start, null)).toBe(true);
	expect(privacyLockDue(start + IDLE_LOCK_MS * 2, start, null)).toBe(true);
});

it('requires a PIN after five background minutes even when idle time has not elapsed', () => {
	const hidden = 100000;
	expect(privacyLockDue(hidden + BACKGROUND_LOCK_MS - 1, hidden, hidden)).toBe(false);
	expect(privacyLockDue(hidden + BACKGROUND_LOCK_MS, hidden, hidden)).toBe(true);
});

it('does not let recent activity or a clock rollback bypass a lock deadline', () => {
	expect(privacyLockDue(500000, 499999, 100000)).toBe(true);
	expect(privacyLockDue(99, 100, null)).toBe(true);
	expect(privacyLockDue(100, 100, 101)).toBe(true);
});
