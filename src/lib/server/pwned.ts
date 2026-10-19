// Breached-password check (security.md "Password Requirements"; NIST SP
// 800-63B-4 requires comparing new passwords against known-compromised ones).
// Uses the Have I Been Pwned range API with k-anonymity: only the first 5
// hex characters of the password's SHA-1 leave the server, padded so the
// response size reveals nothing. No PHI or user identifier is sent.
import { createHash } from 'node:crypto';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2000;

/**
 * How many breaches the password appears in, or null when the check is off
 * or the service didn't answer in time (fail open: a sign-in outage is worse
 * than skipping one check; the miss is logged without the password).
 */
export async function breachCount(
	password: string,
	fetchFn: typeof fetch = fetch,
	env: Record<string, string | undefined> = process.env
): Promise<number | null> {
	// Off by default against the local emulator (no outside calls in dev and CI).
	const mode = env.PWNED_PASSWORDS ?? (env.FIREBASE_AUTH_EMULATOR_HOST ? 'off' : 'on');
	if (mode === 'off') return null;
	const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
	const prefix = hash.slice(0, 5);
	const suffix = hash.slice(5);
	try {
		const res = await fetchFn(`${env.PWNED_PASSWORDS_URL ?? RANGE_URL}${prefix}`, {
			headers: { 'Add-Padding': 'true', 'User-Agent': 'Guad password check' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`status ${res.status}`);
		for (const line of (await res.text()).split('\n')) {
			const [s, n] = line.trim().split(':');
			// Padding lines have a count of 0.
			if (s === suffix) return Number(n) || 0;
		}
		return 0;
	} catch (e) {
		console.warn('password.breach_check_unavailable', (e as Error).name);
		return null;
	}
}
