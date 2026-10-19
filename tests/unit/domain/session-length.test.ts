import { describe, expect, it } from 'vitest';
import { SESSION_MINUTES_DEFAULT, sessionMinutes } from '../../../src/lib/domain/session-length';

describe('sessionMinutes', () => {
	it('defaults to 12 hours', () => {
		expect(SESSION_MINUTES_DEFAULT).toBe(720);
		expect(sessionMinutes(null)).toBe(720);
		expect(sessionMinutes({})).toBe(720);
		expect(sessionMinutes({ session_minutes: '30' })).toBe(720);
		expect(sessionMinutes({ session_minutes: 30.5 })).toBe(720);
	});
	it('keeps an agency setting between 15 minutes and 12 hours', () => {
		expect(sessionMinutes({ session_minutes: 30 })).toBe(30);
		expect(sessionMinutes({ session_minutes: 5 })).toBe(15);
		expect(sessionMinutes({ session_minutes: 10_000 })).toBe(720);
	});
});
