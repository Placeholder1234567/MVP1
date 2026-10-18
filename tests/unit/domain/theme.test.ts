import { describe, expect, it } from 'vitest';
import { isTheme, themeAttribute } from '../../../src/lib/domain/theme';

describe('theme', () => {
	it('accepts only light, dark and auto', () => {
		expect(['light', 'dark', 'auto'].every(isTheme)).toBe(true);
		expect(isTheme('guad-dark-off')).toBe(false);
		expect(isTheme(null)).toBe(false);
	});
	it('leaves auto to the device setting', () => {
		expect(themeAttribute('auto')).toBeNull();
		expect(themeAttribute('dark')).toBe('dark');
		expect(themeAttribute('light')).toBe('light');
	});
});
