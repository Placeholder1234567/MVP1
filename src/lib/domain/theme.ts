// Display theme (frontend-spec-1.md §10.1, §10.5): light, dark, night (dimmer
// still, for documenting while people sleep) or auto (follow the device's
// setting). Saved per person in user_settings.theme.
export const THEMES = ['light', 'dark', 'night', 'auto'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (value: unknown): value is Theme =>
	typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/** The data-theme attribute for <html>: none for auto, so the system setting applies. */
export const themeAttribute = (theme: Theme): Exclude<Theme, 'auto'> | null =>
	theme === 'auto' ? null : theme;

/**
 * The theme to show. Night comes on by itself while the person is clocked in
 * to an overnight shift, unless they chose Light (§10.5).
 */
export function effectiveTheme(choice: Theme, overnightOnClock: boolean): Theme {
	return overnightOnClock && (choice === 'auto' || choice === 'dark') ? 'night' : choice;
}

/**
 * Whether to suggest dark mode (§10.1 "Auto"): from 8pm until 6am, only for
 * people on Auto whose device is showing light, at most once a day. It never
 * switches by itself.
 */
export function suggestDark(input: {
	choice: Theme;
	deviceDark: boolean;
	hour: number;
	today: string;
	dismissedOn: string | null | undefined;
}): boolean {
	return (
		input.choice === 'auto' &&
		!input.deviceDark &&
		(input.hour >= 20 || input.hour < 6) &&
		input.dismissedOn !== input.today
	);
}
