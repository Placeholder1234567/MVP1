type Environment = Record<string, string | undefined>;
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function localUrl(value: string | undefined, protocols: string[]): boolean {
	try {
		const url = new URL(value ?? '');
		return (
			protocols.includes(url.protocol) && loopback.has(url.hostname) && !url.search && !url.hash
		);
	} catch {
		return false;
	}
}

/** Development tools never connect to real identity, database or delivery providers. */
export function notificationSandboxAllowed(development: boolean, env: Environment): boolean {
	return (
		development &&
		/^demo-[a-z0-9-]+$/.test(env.GOOGLE_CLOUD_PROJECT ?? '') &&
		localUrl(`http://${env.FIREBASE_AUTH_EMULATOR_HOST ?? ''}`, ['http:']) &&
		localUrl(env.DATABASE_URL, ['postgres:', 'postgresql:']) &&
		!env.CLOUD_SQL_INSTANCE &&
		(env.JOBS_DRIVER || 'local') === 'local' &&
		(env.PUSH_DRIVER || 'console') === 'console' &&
		(env.SMS_DRIVER || 'console') === 'console' &&
		(env.EMAIL_DRIVER || 'smtp') === 'smtp' &&
		(!env.SMTP_URL || localUrl(env.SMTP_URL, ['smtp:']))
	);
}
