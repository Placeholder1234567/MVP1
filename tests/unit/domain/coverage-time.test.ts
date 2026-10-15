import { expect, it } from 'vitest';
import { shiftIsPast } from '../../../src/lib/domain/shifts';
it('keeps the previous day’s overnight shift open after midnight', () => {
	const now = new Date('2026-10-15T05:00:00Z');
	expect(shiftIsPast('2026-10-14', 'on', now, 'America/New_York')).toBe(false);
	expect(shiftIsPast('2026-10-14', 'pm', now, 'America/New_York')).toBe(true);
	expect(shiftIsPast('2026-10-15', 'am', now, 'America/New_York')).toBe(false);
});
