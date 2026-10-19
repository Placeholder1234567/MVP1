import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { breachCount } from '../../../src/lib/server/pwned';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();
const on = { PWNED_PASSWORDS: 'on' };

describe('breachCount', () => {
	it('sends only the 5-character prefix, padded, and finds the suffix', async () => {
		const hash = sha1('password123456789');
		const fetchFn = vi.fn(
			async () => new Response(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`)
		);
		expect(await breachCount('password123456789', fetchFn as typeof fetch, on)).toBe(42);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
		expect(url).not.toContain(hash.slice(5));
		expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
	});
	it('is 0 when the suffix is missing or only a padding line', async () => {
		const hash = sha1('a quiet morning walk');
		const fetchFn = async () => new Response(`${hash.slice(5)}:0\nFFFF:3\n`);
		expect(await breachCount('a quiet morning walk', fetchFn as typeof fetch, on)).toBe(0);
	});
	it('fails open when the service is down, and is off with the emulator', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const down = async () => new Response('', { status: 503 });
		expect(await breachCount('anything at all here', down as typeof fetch, on)).toBeNull();
		expect(JSON.stringify(warn.mock.calls)).not.toContain('anything');
		warn.mockRestore();
		const never = vi.fn();
		expect(
			await breachCount('anything at all here', never as unknown as typeof fetch, {
				FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099'
			})
		).toBeNull();
		expect(never).not.toHaveBeenCalled();
	});
});
