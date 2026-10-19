// How long a sign-in lasts before the person must sign in again (security.md
// "Session Management": 12 hours, configurable per agency down to 15
// minutes). Stored in agencies.settings.session_minutes. Identity Platform
// session cookies can't be extended, so this is an absolute limit.

export const SESSION_MINUTES_DEFAULT = 12 * 60;
export const SESSION_MINUTES_MIN = 15;
export const SESSION_MINUTES_MAX = SESSION_MINUTES_DEFAULT;

/** The agency's session length in minutes; anything missing or invalid is the default. */
export function sessionMinutes(settings: unknown): number {
	const raw = (settings as { session_minutes?: unknown } | null)?.session_minutes;
	if (typeof raw !== 'number' || !Number.isInteger(raw)) return SESSION_MINUTES_DEFAULT;
	return Math.min(SESSION_MINUTES_MAX, Math.max(SESSION_MINUTES_MIN, raw));
}
