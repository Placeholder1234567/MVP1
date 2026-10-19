import { describe, expect, it } from 'vitest';
import {
	effectiveTheme,
	isTheme,
	suggestDark,
	themeAttribute
} from '../../../src/lib/domain/theme';

describe('theme', () => {
	it('accepts only light, dark, night and auto', () => {
		expect(['light', 'dark', 'night', 'auto'].every(isTheme)).toBe(true);
		expect(isTheme('guad-dark-off')).toBe(false);
		expect(isTheme(null)).toBe(false);
	});
	it('leaves auto to the device setting', () => {
		expect(themeAttribute('auto')).toBeNull();
		expect(themeAttribute('dark')).toBe('dark');
		expect(themeAttribute('night')).toBe('night');
		expect(themeAttribute('light')).toBe('light');
	});
	it('turns night on during a clocked-in overnight shift, unless Light was chosen', () => {
		expect(effectiveTheme('auto', true)).toBe('night');
		expect(effectiveTheme('dark', true)).toBe('night');
		expect(effectiveTheme('light', true)).toBe('light');
		expect(effectiveTheme('dark', false)).toBe('dark');
		expect(effectiveTheme('night', false)).toBe('night');
	});
	it('suggests dark mode in the evening on Auto, once a day, never when already dark', () => {
		const base = {
			choice: 'auto' as const,
			deviceDark: false,
			hour: 20,
			today: '2026-10-18',
			dismissedOn: null
		};
		expect(suggestDark(base)).toBe(true);
		expect(suggestDark({ ...base, hour: 2 })).toBe(true);
		expect(suggestDark({ ...base, hour: 19 })).toBe(false);
		expect(suggestDark({ ...base, hour: 6 })).toBe(false);
		expect(suggestDark({ ...base, deviceDark: true })).toBe(false);
		expect(suggestDark({ ...base, choice: 'light' })).toBe(false);
		expect(suggestDark({ ...base, dismissedOn: '2026-10-18' })).toBe(false);
		expect(suggestDark({ ...base, dismissedOn: '2026-10-17' })).toBe(true);
	});
});
