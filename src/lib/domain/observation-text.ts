/** Append complete observations or refuse them; never cut off clinical qualifiers. */
export function appendObservations(
	current: string,
	incoming: string,
	limit: number
): string | null {
	const combined = [current, incoming].filter(Boolean).join(' ');
	return combined.length <= limit ? combined : null;
}
