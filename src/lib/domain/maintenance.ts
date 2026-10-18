// Scheduled maintenance announcements (notifications.md §2.18). The text is
// built from the window and a fixed impact choice, so it never carries
// anything an admin typed: it is safe for lock screens and email.

export const MAINTENANCE_IMPACTS = {
	unavailable: 'Guad will be unavailable. Anything you save offline will sync when it is back.',
	slow: 'Guad may be slow or briefly unavailable.',
	sync_paused:
		'Syncing will pause. You can keep working offline; your changes sync when it is back.'
} as const;
export type MaintenanceImpact = keyof typeof MAINTENANCE_IMPACTS;

/** Windows up to 12 hours, announced at most 60 days ahead. */
export const MAINTENANCE_MAX_HOURS = 12;
export const MAINTENANCE_MAX_DAYS_AHEAD = 60;

const time = (at: Date, timeZone: string) =>
	new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at);
const date = (at: Date, timeZone: string) =>
	new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	}).format(at);
const zone = (at: Date, timeZone: string) =>
	new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
		.formatToParts(at)
		.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;

/** Why the window can't be announced, or null. */
export function maintenanceWindowError(start: Date, end: Date, now: Date): string | null {
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
		return 'Choose when maintenance starts and ends.';
	if (start.getTime() <= now.getTime()) return 'Maintenance has to start in the future.';
	if (end.getTime() <= start.getTime()) return 'Maintenance has to end after it starts.';
	if (end.getTime() - start.getTime() > MAINTENANCE_MAX_HOURS * 3_600_000)
		return `Keep the window to ${MAINTENANCE_MAX_HOURS} hours or less.`;
	if (start.getTime() - now.getTime() > MAINTENANCE_MAX_DAYS_AHEAD * 86_400_000)
		return `Announce maintenance at most ${MAINTENANCE_MAX_DAYS_AHEAD} days ahead.`;
	return null;
}

/** "Guad will undergo scheduled maintenance on Tue, Oct 20 from 10:00 PM to 11:30 PM EDT." */
export function maintenanceTitle(start: Date, end: Date, timeZone: string): string {
	const sameDay = date(start, timeZone) === date(end, timeZone);
	const until = sameDay ? time(end, timeZone) : `${date(end, timeZone)}, ${time(end, timeZone)}`;
	return `Guad will undergo scheduled maintenance on ${date(start, timeZone)} from ${time(start, timeZone)} to ${until} ${zone(start, timeZone)}.`;
}

/** The email and in-app body: what to expect and how to prepare. */
export function maintenanceBody(impact: MaintenanceImpact): string {
	return `${MAINTENANCE_IMPACTS[impact]} Before it starts, open Guad on each device you use and wait for "All changes synced".`;
}
