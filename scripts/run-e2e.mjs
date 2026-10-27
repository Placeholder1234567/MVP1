import { spawnSync } from 'node:child_process';

// Browser tests seed synthetic identities. Refuse cloud projects or non-local services.
const loopback = (value) => {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	} catch {
		return false;
	}
};
const project = process.env.GOOGLE_CLOUD_PROJECT;
let database;
try {
	database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
} catch {
	throw new Error('Browser tests require a valid local test database URL.');
}
if (
	!project?.startsWith('demo-') ||
	process.env.PUBLIC_FIREBASE_PROJECT_ID !== project ||
	!loopback(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`) ||
	!loopback(process.env.PUBLIC_AUTH_EMULATOR_URL) ||
	!loopback(process.env.PUBLIC_POWERSYNC_URL) ||
	!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
	!['postgres:', 'postgresql:'].includes(database.protocol)
) {
	throw new Error(
		'Browser tests require a demo-* project and loopback-only database, Auth and PowerSync.'
	);
}
// CI runs each viewport against its own ephemeral services and seed. Keep the
// default local command running both; reject arbitrary shell arguments.
const viewport = process.env.GUAD_E2E_PROJECT;
if (viewport && !['desktop', 'phone'].includes(viewport))
	throw new Error('GUAD_E2E_PROJECT must be desktop or phone.');
const selection = viewport ? ` --project=${viewport}` : '';
process.env.GUAD_E2E = '1';
process.env.APP_ORIGIN = 'http://127.0.0.1:4175';
process.env.APP_URL = process.env.APP_ORIGIN;
process.env.JOBS_DRIVER = 'local';
process.env.PUSH_DRIVER = 'console';
process.env.EMAIL_DRIVER = 'smtp';
process.env.SMS_DRIVER = 'console';
process.env.SMTP_URL = 'smtp://127.0.0.1:1025';
process.env.VERTEX_REGION = '';
process.env.LOMI_MODEL = '';
process.env.STT_RECOGNIZER = '';

function run(script, args) {
	const result = spawnSync(process.execPath, [script, ...args], {
		stdio: 'inherit',
		env: process.env
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
run('node_modules/vite/bin/vite.js', ['build']);
run('node_modules/firebase-tools/lib/bin/firebase.js', [
	'emulators:exec',
	'--only',
	'auth',
	'--project',
	project,
	`npm run db:seed && npx playwright test${selection} && npx playwright test --config=playwright.dev.config.ts${selection}`
]);
