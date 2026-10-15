/** Static-code caches only; encrypted care data is managed separately by PowerSync. */
export async function clearShellCaches(): Promise<void> {
	if (typeof caches === 'undefined') return;
	for (const name of await caches.keys())
		if (name.startsWith('guad-shell-')) await caches.delete(name);
}
