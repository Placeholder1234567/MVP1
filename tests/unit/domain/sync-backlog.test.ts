import { describe, expect, it } from 'vitest';
import { backlogWarning, storageWarning } from '../../../src/lib/domain/sync-backlog';

const MB = 1024 * 1024;

describe('backlogWarning', () => {
	it('stays quiet up to 100 waiting changes', () => {
		expect(backlogWarning(0)).toBeNull();
		expect(backlogWarning(100)).toBeNull();
	});
	it('warns from 101 and is critical from 500', () => {
		expect(backlogWarning(101)).toEqual({
			level: 'warn',
			text: 'You have 101 unsynced changes. Connect to sync.'
		});
		expect(backlogWarning(500)?.level).toBe('bad');
		expect(backlogWarning(500)?.text).toMatch(/Wi-Fi/);
	});
});

describe('storageWarning', () => {
	it('is quiet without an estimate or under 80 MB', () => {
		expect(storageWarning()).toBeNull();
		expect(storageWarning(40 * MB, 2000 * MB)).toBeNull();
	});
	it('warns at 80 MB and when free space runs low', () => {
		expect(storageWarning(80 * MB, 2000 * MB)?.level).toBe('warn');
		expect(storageWarning(20 * MB, 60 * MB)?.level).toBe('bad');
	});
});
