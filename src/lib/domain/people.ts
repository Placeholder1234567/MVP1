// Display helpers for staff and client names (no PHI rules here: names are
// shown only inside the signed-in app, never logged).

/** "Cara Giver" -> "CG"; one name -> its first two letters. */
export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
