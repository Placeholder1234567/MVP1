/** Reconnect may replace only original, untouched sections of an unsigned review. */
export function mergeReconnectDraft(
	current: Record<string, string>,
	original: Record<string, string>,
	fresh: Record<string, string>,
	edited: ReadonlySet<string>
): { content: Record<string, string>; updated: string[] } {
	const content = { ...current };
	const updated: string[] = [];
	for (const key of Object.keys(original)) {
		if (edited.has(key) || !Object.hasOwn(current, key) || current[key] !== original[key]) continue;
		const value = fresh[key];
		if (typeof value !== 'string' || value.length > 6000 || value === current[key]) continue;
		content[key] = value;
		updated.push(key);
	}
	return { content, updated };
}
