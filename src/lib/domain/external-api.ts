// External API rules (openapi.yaml): API key format, request bounds, and the
// plan feature each data type needs. The API is for integrations only; the app
// itself uses tRPC.

/** Keys look like `guad_<43 base64url chars>`; the first 12 characters are the shown prefix. */
export const API_KEY_PATTERN = /^guad_[A-Za-z0-9_-]{43}$/;
export const API_KEY_PREFIX_LENGTH = 12;
export type ApiScope = 'read' | 'write';

/** Longest date range one request may ask for. */
export const MAX_RANGE_DAYS = 366;

export const EXPORT_TYPES = [
	'clients',
	'staff',
	'notes',
	'incidents',
	'mar',
	'medications',
	'health',
	'attendance',
	'clock_records',
	'schedule',
	'goals',
	'referrals'
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

/** The plan feature an export type needs (entitlements.md); null means every plan. */
export const EXPORT_FEATURE: Record<ExportType, string | null> = {
	clients: null,
	staff: null,
	notes: 'charting',
	incidents: 'incidents',
	mar: 'mar',
	medications: 'mar',
	health: 'health',
	attendance: 'charting',
	clock_records: 'timekeeping',
	schedule: 'scheduling',
	goals: 'goals',
	referrals: 'intake'
};
export const EVV_FEATURE = 'timekeeping';

export class ApiInputError extends Error {}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Checks a from/to pair of YYYY-MM-DD days (either may be optional). */
export function dateRange(
	from: string | null,
	to: string | null,
	required: boolean
): { from: string | null; to: string | null } {
	if (required && (!from || !to)) throw new ApiInputError("'from' and 'to' are required");
	for (const [name, v] of [
		['from', from],
		['to', to]
	] as const)
		if (v !== null && !isDay(v)) throw new ApiInputError(`'${name}' must be a date (YYYY-MM-DD)`);
	if (from && to) {
		if (from > to) throw new ApiInputError("'from' date must be before 'to' date");
		const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
		if (days >= MAX_RANGE_DAYS)
			throw new ApiInputError(`Date ranges are limited to ${MAX_RANGE_DAYS} days`);
	}
	return { from, to };
}

/** Reads a bounded integer query parameter. */
export function intParam(
	value: string | null,
	name: string,
	{ min, max, fallback }: { min: number; max: number; fallback: number }
): number {
	if (value === null || value === '') return fallback;
	if (!/^\d+$/.test(value)) throw new ApiInputError(`'${name}' must be a whole number`);
	const n = Number(value);
	if (n < min || n > max) throw new ApiInputError(`'${name}' must be between ${min} and ${max}`);
	return n;
}

export function boolParam(value: string | null, name: string): boolean {
	if (value === null || value === '' || value === 'false') return false;
	if (value === 'true') return true;
	throw new ApiInputError(`'${name}' must be true or false`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(value: string | null, name: string): string | null {
	if (value === null || value === '') return null;
	if (!UUID.test(value)) throw new ApiInputError(`'${name}' must be a UUID`);
	return value.toLowerCase();
}
export const isUuid = (value: string) => UUID.test(value);

/** An ISO 8601 date-time, for `since`. */
export function instantParam(value: string | null, name: string): Date | null {
	if (value === null || value === '') return null;
	const at = new Date(value);
	if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(at.getTime()))
		throw new ApiInputError(`'${name}' must be an ISO 8601 date-time`);
	return at;
}

export const REPORT_TYPES = [
	'incidents',
	'notes',
	'mar',
	'goals',
	'attendance',
	'timesheets',
	'audit'
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const isReportType = (t: string): t is ReportType =>
	(REPORT_TYPES as readonly string[]).includes(t);

/** Reports are kept for 24 hours after they're generated (openapi.yaml generateReport). */
export const REPORT_RETENTION_HOURS = 24;

/** Whether the agency's plan includes a report type (entitlements.md: reports, reports_basic, audit_log). */
export function reportAllowed(type: ReportType, features: ReadonlySet<string>): boolean {
	const has = (f: string) => features.has(f);
	switch (type) {
		case 'timesheets':
			return has('timekeeping') && (has('reports') || has('reports_basic'));
		case 'audit':
			return has('audit_log');
		case 'incidents':
			return has('reports') && has('incidents');
		case 'mar':
			return has('reports') && has('mar');
		case 'goals':
			return has('reports') && has('goals');
		default:
			return has('reports') && has('charting');
	}
}
