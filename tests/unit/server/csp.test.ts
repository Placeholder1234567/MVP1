import { describe, expect, it } from 'vitest';
import {
	configuredConnectSources,
	connectionOrigin,
	FIREBASE_CONNECT_SOURCES
} from '../../../src/lib/config/csp';
import { withConnectSources } from '../../../src/lib/server/security-headers';

describe('configured CSP connections', () => {
	it('uses exact origins and WebSocket equivalents without paths, credentials or queries', () => {
		expect(
			configuredConnectSources(
				{
					PUBLIC_POWERSYNC_URL: 'https://sync.example.test:8443/stream?public=true',
					PUBLIC_AUTH_EMULATOR_URL: 'http://[::1]:9099'
				},
				true
			)
		).toEqual([
			'https://sync.example.test:8443',
			'wss://sync.example.test:8443',
			'http://[::1]:9099',
			'ws://[::1]:9099'
		]);
		expect(
			configuredConnectSources({
				PUBLIC_POWERSYNC_URL: 'https://same.test/path',
				PUBLIC_AUTH_EMULATOR_URL: 'https://same.test/other'
			})
		).toEqual(['https://same.test', 'wss://same.test']);
	});
	it('rejects wildcard, userinfo, CSP syntax, insecure remote and non-HTTP endpoints', () => {
		for (const value of [
			'https://*.example.test',
			'https://name:secret@example.test',
			'https://example.test;script-src',
			'https://example.test; script-src *',
			'http://remote.example.test',
			'ws://127.0.0.1:8080',
			'data:text/html,test',
			'javascript:alert(1)',
			'not a url'
		]) {
			expect(connectionOrigin(value)).toBeUndefined();
			expect(configuredConnectSources({ PUBLIC_POWERSYNC_URL: value })).toEqual([]);
			expect(() => configuredConnectSources({ PUBLIC_POWERSYNC_URL: value }, true)).toThrow(
				'Invalid public connection endpoint configuration'
			);
		}
	});
	it('adds exact Firebase registration endpoints without allowing arbitrary Google hosts', () => {
		expect(FIREBASE_CONNECT_SOURCES).toContain('https://firebaseinstallations.googleapis.com');
		expect(FIREBASE_CONNECT_SOURCES).toContain('https://fcmregistrations.googleapis.com');
		expect(FIREBASE_CONNECT_SOURCES).not.toContain('https://*.googleapis.com');
		expect(configuredConnectSources({})).toEqual([]);
	});
	it('deduplicates runtime additions and preserves framework script nonce/hash directives', () => {
		const policy =
			"default-src 'self'; connect-src 'self' https://sync.test; script-src 'self' 'wasm-unsafe-eval' 'nonce-test' 'sha256-test'; object-src 'none'";
		expect(
			withConnectSources(policy, ['https://sync.test', 'https://sync.test/path', 'wss://sync.test'])
		).toBe(policy.replace('https://sync.test;', 'https://sync.test wss://sync.test;'));
		expect(
			withConnectSources(policy, [
				'https://*.evil.test',
				'https://evil.test;script-src',
				'javascript:alert(1)'
			])
		).toBe(policy);
	});
});
