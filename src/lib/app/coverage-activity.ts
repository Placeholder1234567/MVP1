interface RequestRow {
	id: string;
	home_id: string | null;
	created_at?: string | null;
}
interface StepRow extends RequestRow {
	coverage_request_id: string | null;
	occurred_at?: string | null;
}
function timestamp(value?: string | null): number {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Saved activity is a bounded recent view, not a complete historical report. */
export function recentCoverage<T extends RequestRow>(rows: readonly T[], homeId: string): T[] {
	if (!homeId) return [];
	return rows
		.filter((row) => row.home_id === homeId)
		.sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at) || b.id.localeCompare(a.id))
		.slice(0, 6);
}

/** Both keys matter: an event must belong to this request and the selected home. */
export function coverageTimeline<T extends StepRow>(
	rows: readonly T[],
	homeId: string,
	requestId: string
): T[] {
	if (!homeId || !requestId) return [];
	return rows
		.filter((row) => row.home_id === homeId && row.coverage_request_id === requestId)
		.sort(
			(a, b) =>
				timestamp(a.occurred_at ?? a.created_at) - timestamp(b.occurred_at ?? b.created_at) ||
				a.id.localeCompare(b.id)
		);
}

export function coverageLabel(status: string | null, filledName?: string | null): string {
	switch (status) {
		case 'searching':
			return 'Finding cover';
		case 'filled':
			return filledName ? `Filled by ${filledName}` : 'Filled';
		case 'unfilled':
			return 'Needs attention';
		default:
			return 'Status unavailable';
	}
}
