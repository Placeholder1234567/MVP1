export function quietHoursMinutes(start: string, end: string): number | null {
	if (![start, end].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
	const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
	return (minutes(end) - minutes(start) + 1440) % 1440;
}
export function validQuietHours(start: string, end: string): boolean {
	const duration = quietHoursMinutes(start, end);
	return duration !== null && duration >= 240 && duration <= 600;
}
