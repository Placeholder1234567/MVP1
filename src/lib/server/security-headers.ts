// HTTP security headers (security.md "Encryption > In Transit", "Session
// Management": strict CSP against XSS, since the in-memory ID token is
// readable by JavaScript). The Content-Security-Policy itself comes from
// SvelteKit (vite.config.ts `csp`), which nonces its own inline scripts;
// here we add the origins only known at runtime and the fixed headers.
import { configuredConnectSources, connectionOrigin } from '../config/csp.ts';

/** Origins the browser connects to that depend on the environment. */
export function runtimeConnectSources(env: Record<string, string | undefined>): string[] {
	return configuredConnectSources(env);
}

/** Adds runtime origins to the CSP's connect-src. */
export function withConnectSources(csp: string, sources: string[]): string {
	const origins = sources
		.map((source) => connectionOrigin(source, true))
		.filter((source) => !!source);
	if (!origins.length) return csp;
	return csp.replace(
		/(^|;\s*)connect-src\s+([^;]*)/,
		(_, prefix: string, list: string) =>
			`${prefix}connect-src ${[...new Set([...list.trim().split(/\s+/), ...origins])].join(' ')}`
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
