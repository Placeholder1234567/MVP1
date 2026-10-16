// Synthetic demo staff for local development (seed.ts). They exist only in the
// Auth emulator, so DEV_PASSWORD is not a secret and signs in nowhere else.
export const DEV_PASSWORD = 'guad-dev-only-1';

export const DEMO_STAFF = [
	{
		name: 'Ada Admin',
		email: 'admin@guad.test',
		role: 'admin',
		homes: ['oak', 'maple'],
		med: true
	},
	{
		name: 'Sam Supervisor',
		email: 'supervisor@guad.test',
		role: 'supervisor',
		homes: ['oak', 'maple'],
		med: true
	},
	{ name: 'Cara Giver', email: 'cara@guad.test', role: 'caregiver', homes: ['oak'], med: true },
	{
		name: 'Dev Okafor',
		email: 'dev@guad.test',
		role: 'caregiver',
		homes: ['oak', 'maple'],
		med: false
	},
	{ name: 'Lena Park', email: 'lena@guad.test', role: 'caregiver', homes: ['maple'], med: true }
] as const;

/** Only with the Auth emulator: the sign-in page lists these for local testing. */
export function demoSignIn() {
	if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) return null;
	return {
		password: DEV_PASSWORD,
		accounts: DEMO_STAFF.map((s) => ({ name: s.name, email: s.email, role: s.role }))
	};
}
