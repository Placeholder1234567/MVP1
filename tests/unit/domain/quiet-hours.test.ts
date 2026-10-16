import { expect, it } from 'vitest';
import { quietHoursMinutes, validQuietHours } from '../../../src/lib/domain/quiet-hours';
import { canSendNow } from '../../../src/lib/domain/notifications';
it('validates same-day and overnight windows including the exact bounds', () => {
	expect(quietHoursMinutes('23:00', '06:00')).toBe(420);
	expect(validQuietHours('00:00', '04:00')).toBe(true);
	expect(validQuietHours('20:00', '06:00')).toBe(true);
	expect(validQuietHours('22:00', '01:59')).toBe(false);
	expect(validQuietHours('20:00', '06:01')).toBe(false);
	expect(validQuietHours('00:00', '00:00')).toBe(false);
});
it('rejects ambiguous and invalid time input', () => {
	for (const time of ['24:00', '12:60', '1:00', '00:00:00', '', 'bad'])
		expect(quietHoursMinutes(time, '06:00')).toBeNull();
});
it('retains urgent/high and email bypass with a customized overnight window', () => {
	const window = { start: '21:30', end: '05:30' };
	expect(canSendNow('push', 3, '21:30', window)).toBe(false);
	expect(canSendNow('sms', 4, '04:00', window)).toBe(false);
	expect(canSendNow('push', 3, '05:30', window)).toBe(true);
	expect(canSendNow('push', 1, '23:00', window)).toBe(true);
	expect(canSendNow('sms', 2, '23:00', window)).toBe(true);
	expect(canSendNow('email', 4, '23:00', window)).toBe(true);
});
