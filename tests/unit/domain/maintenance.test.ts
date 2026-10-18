import { describe, expect, it } from 'vitest';
import {
	maintenanceBody,
	maintenanceTitle,
	maintenanceWindowError
} from '../../../src/lib/domain/maintenance';

const NY = 'America/New_York';
const now = new Date('2026-10-18T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('maintenanceWindowError', () => {
	it('accepts a future window up to 12 hours', () => {
		expect(
			maintenanceWindowError(at('2026-10-21T02:00:00Z'), at('2026-10-21T03:30:00Z'), now)
		).toBeNull();
	});

	it('explains what is wrong with a window', () => {
		const err = (s: string, e: string) => maintenanceWindowError(at(s), at(e), now);
		expect(err('2026-10-18T11:00:00Z', '2026-10-18T13:00:00Z')).toMatch(/future/);
		expect(err('2026-10-21T03:00:00Z', '2026-10-21T02:00:00Z')).toMatch(/end after/);
		expect(err('2026-10-21T00:00:00Z', '2026-10-21T13:00:00Z')).toMatch(/12 hours/);
		expect(err('2027-01-10T00:00:00Z', '2027-01-10T01:00:00Z')).toMatch(/60 days/);
		expect(maintenanceWindowError(new Date('x'), at('2026-10-21T01:00:00Z'), now)).toMatch(
			/Choose/
		);
	});
});

describe('maintenanceTitle', () => {
	it('uses the agency time zone', () => {
		expect(maintenanceTitle(at('2026-10-21T02:00:00Z'), at('2026-10-21T03:30:00Z'), NY)).toBe(
			'Guad will undergo scheduled maintenance on Tue, Oct 20 from 10:00 PM to 11:30 PM EDT.'
		);
	});

	it('names the end date when the window crosses midnight', () => {
		expect(maintenanceTitle(at('2026-10-21T03:00:00Z'), at('2026-10-21T05:00:00Z'), NY)).toBe(
			'Guad will undergo scheduled maintenance on Tue, Oct 20 from 11:00 PM to Wed, Oct 21, 1:00 AM EDT.'
		);
	});
});

describe('maintenanceBody', () => {
	it('says what to expect and how to prepare', () => {
		expect(maintenanceBody('sync_paused')).toMatch(/^Syncing will pause\..*All changes synced/);
	});
});
