// SvelteKit's CSP host type requires a dotted hostname; the parser below also
// validates loopback/IPv6 origins, which CSP supports at runtime.
type ConnectionOrigin = `${string}://${string}.${string}`;

/** Exact connection origins only. Public configuration must never become CSP syntax. */
export function connectionOrigin(raw: string, websocket = false): ConnectionOrigin | undefined {
	try {
		const url = new URL(raw);
		const allowed = websocket ? ['https:', 'http:', 'wss:', 'ws:'] : ['https:', 'http:'];
		if (
			!allowed.includes(url.protocol) ||
			url.username ||
			url.password ||
			!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:.]+\])$/i.test(url.hostname)
		)
			return;
		if (
			['http:', 'ws:'].includes(url.protocol) &&
			!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
		)
			return;
		return url.origin as ConnectionOrigin;
	} catch {
		return;
	}
}

/** Shared by the production build (including prerendered HTML) and runtime hooks. */
export function configuredConnectSources(
	env: Record<string, string | undefined>,
	strict = false
): ConnectionOrigin[] {
	const sources = new Set<ConnectionOrigin>();
	for (const raw of [env.PUBLIC_POWERSYNC_URL, env.PUBLIC_AUTH_EMULATOR_URL]) {
		if (!raw?.trim()) continue;
		const origin = connectionOrigin(raw);
		if (!origin) {
			if (strict) throw new Error('Invalid public connection endpoint configuration');
			continue;
		}
		sources.add(origin);
		// Preserve runtime WebSocket compatibility, with the same exact host and port.
		sources.add(origin.replace(/^http/, 'ws') as ConnectionOrigin);
	}
	return [...sources];
}

// Firebase Auth token exchange and FCM installation/registration when push is configured.
// These allowlisted public endpoints do not initialize SDKs or perform network requests.
export const FIREBASE_CONNECT_SOURCES = [
	'https://identitytoolkit.googleapis.com',
	'https://securetoken.googleapis.com',
	'https://firebaseinstallations.googleapis.com',
	'https://fcmregistrations.googleapis.com'
] as const;
