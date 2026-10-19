// Password rules for setting or changing a password (security.md "Password
// Requirements", NIST SP 800-63B-4 §3.1.1.2). Length is what counts: no
// character-type rules and no forced rotation. 15 characters because some
// roles sign in with a password alone; a passphrase of a few words is fine.
// The breached-password check runs on the server (pwned.ts).

export const PASSWORD_MIN = 15;
/** NIST: allow at least 64. */
export const PASSWORD_MAX = 128;

/** Why this password can't be used, or null. Counts characters, not bytes. */
export function passwordProblem(password: string, email?: string): string | null {
	const length = [...password].length;
	if (length < PASSWORD_MIN)
		return `Use at least ${PASSWORD_MIN} characters. A few words with spaces work well.`;
	if (length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
	if (new Set(password).size < 4) return 'Use a password that isn’t one character repeated.';
	const lower = password.toLowerCase();
	const name = email?.split('@')[0]?.toLowerCase() ?? '';
	if (name.length >= 4 && lower.includes(name)) return 'Don’t include your email in your password.';
	return null;
}
