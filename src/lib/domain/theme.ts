// Display theme (frontend-spec-1.md §10.1): light, dark, or auto (follow the
// device's setting). Saved per person in user_settings.theme.
export const THEMES = ['light', 'dark', 'auto'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (value: unknown): value is Theme =>
	typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/** The data-theme attribute for <html>: none for auto, so the system setting applies. */
export const themeAttribute = (theme: Theme): 'light' | 'dark' | null =>
	theme === 'auto' ? null : theme;
