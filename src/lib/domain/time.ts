// Wall-clock helpers that work the same on the device and on the server.
// The server runs in UTC, so every "what day / what shift is it" question is
// answered in the agency's time zone (agencies.timezone), never the machine's.

export interface LocalTime {
	/** Calendar day in the agency's time zone, YYYY-MM-DD */
	day: string;
	/** Hour 0-23 */
	hour: number;
	/** Minute 0-59 */
	minute: number;
}

export function localTime(at: Date, timeZone: string): LocalTime {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(at);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return {
		day: `${get('year')}-${get('month')}-${get('day')}`,
		hour: Number(get('hour')),
		minute: Number(get('minute'))
	};
}

/** Adds days to a YYYY-MM-DD key without time-zone drift. */
export function addDays(day: string, days: number): string {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Sunday that starts the week containing day (weeks run Sunday-Saturday). */
export function weekStart(day: string): string {
	const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
	return addDays(day, -dow);
}

/** "08:00:00" or "8:00" -> "08:00". Postgres `time` values arrive with seconds. */
export function hhmm(time: string): string {
	const [h = '0', m = '0'] = time.split(':');
	return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}
