import { describe, expect, it } from 'vitest';
import {
	runtimeConnectSources,
	securityHeaders,
	withConnectSources
} from '../../../src/lib/server/security-headers';

describe('security headers', () => {
	it('sends HSTS in production only, plus the fixed hardening headers', () => {
		const prod = securityHeaders(false);
		expect(prod['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
		expect(prod).toMatchObject({
			'x-content-type-options': 'nosniff',
			'x-frame-options': 'DENY',
			'cross-origin-opener-policy': 'same-origin'
		});
		expect(prod['permissions-policy']).toContain('camera=()');
		expect(securityHeaders(true)['strict-transport-security']).toBeUndefined();
	});

	it('allows the PowerSync and Auth emulator origins, over HTTP and WebSocket', () => {
		expect(
			runtimeConnectSources({
				PUBLIC_POWERSYNC_URL: 'https://powersync.example.test/sync',
				PUBLIC_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099'
			})
		).toEqual([
			'https://powersync.example.test',
			'wss://powersync.example.test',
			'http://127.0.0.1:9099',
			'ws://127.0.0.1:9099'
		]);
		expect(runtimeConnectSources({ PUBLIC_POWERSYNC_URL: 'not a url' })).toEqual([]);
	});

	it('adds them to connect-src without touching other directives', () => {
		const csp = "default-src 'self'; connect-src 'self' https://a.test; script-src 'self'";
		expect(withConnectSources(csp, ['https://b.test'])).toBe(
			"default-src 'self'; connect-src 'self' https://a.test https://b.test; script-src 'self'"
		);
		expect(withConnectSources(csp, [])).toBe(csp);
	});
});
