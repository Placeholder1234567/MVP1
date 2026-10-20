import { expect, it } from 'vitest';
import { notificationSandboxAllowed } from '../../../src/lib/server/notification-sandbox';
const local = {
	GOOGLE_CLOUD_PROJECT: 'demo-guad',
	FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
	DATABASE_URL: 'postgres://guad:guad@localhost:5433/guad',
	SMTP_URL: 'smtp://localhost:1025'
};
it('allows only development with local emulator/database and synthetic delivery drivers', () => {
	expect(notificationSandboxAllowed(true, local)).toBe(true);
	expect(notificationSandboxAllowed(false, local)).toBe(false);
	for (const overrides of [
		{ GOOGLE_CLOUD_PROJECT: 'real-project' },
		{ FIREBASE_AUTH_EMULATOR_HOST: 'identity.example:9099' },
		{ DATABASE_URL: 'postgres://db.example/guad' },
		{ CLOUD_SQL_INSTANCE: 'project:region:db' },
		{ PUSH_DRIVER: 'fcm' },
		{ SMS_DRIVER: 'aws' },
		{ EMAIL_DRIVER: 'ses' },
		{ JOBS_DRIVER: 'cloud-tasks' },
		{ SMTP_URL: 'smtp://mail.example:25' },
		{ SMTP_URL: 'smtp://localhost:1025?service=gmail' },
		{ DATABASE_URL: 'postgres://localhost/guad?host=db.example' }
	])
		expect(notificationSandboxAllowed(true, { ...local, ...overrides })).toBe(false);
});
