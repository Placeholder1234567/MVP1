// HTTP security headers (security.md "Encryption > In Transit", "Session
// Management": strict CSP against XSS, since the in-memory ID token is
// readable by JavaScript). The Content-Security-Policy itself comes from
// SvelteKit (vite.config.ts `csp`), which nonces its own inline scripts;
// here we add the origins only known at runtime and the fixed headers.

/** Origins the browser connects to that depend on the environment. */
export function runtimeConnectSources(env: Record<string, string | undefined>): string[] {
	const sources: string[] = [];
	for (const raw of [env.PUBLIC_POWERSYNC_URL, env.PUBLIC_AUTH_EMULATOR_URL]) {
		if (!raw) continue;
		try {
			const url = new URL(raw);
			sources.push(url.origin);
			// PowerSync streams over WebSocket on the same host.
			sources.push(`${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
		} catch {
			// A malformed URL simply isn't allowed.
		}
	}
	return [...new Set(sources)];
}

/** Adds runtime origins to the CSP's connect-src. */
export function withConnectSources(csp: string, sources: string[]): string {
	if (!sources.length) return csp;
	return csp.replace(
		/connect-src ([^;]*)/,
		(_, list: string) => `connect-src ${list} ${sources.join(' ')}`
	);
}

export function securityHeaders(dev: boolean): Record<string, string> {
	return {
		...(dev ? {} : { 'strict-transport-security': 'max-age=31536000; includeSubDomains; preload' }),
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'strict-origin-when-cross-origin',
		// Microphone for Lomi dictation and location for clock-in; nothing else.
		'permissions-policy':
			'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()',
		'cross-origin-opener-policy': 'same-origin'
	};
}
