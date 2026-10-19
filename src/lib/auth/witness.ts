// A witness signs in on someone else's device (controlled medication count
// book). This uses a separate Firebase app instance in memory, so the device
// owner's own sign-in is never touched. The ID token goes to the server once,
// to confirm the witness, and the instance is deleted straight after.
import * as env from '$app/env/public';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
	connectAuthEmulator,
	getMultiFactorResolver,
	inMemoryPersistence,
	initializeAuth,
	signInWithEmailAndPassword,
	TotpMultiFactorGenerator,
	type MultiFactorError,
	type MultiFactorResolver,
	type User
} from 'firebase/auth';

export class WitnessSignIn {
	private app: FirebaseApp | undefined;
	private resolver: MultiFactorResolver | undefined;

	private auth() {
		this.app ??= initializeApp(
			{
				// Public identifiers, not secrets (CLAUDE.md "NO secrets in client bundle")
				apiKey: env.PUBLIC_FIREBASE_API_KEY || 'demo-key',
				authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
				appId: env.PUBLIC_FIREBASE_APP_ID,
				messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
				projectId: env.PUBLIC_FIREBASE_PROJECT_ID || 'demo-guad'
			},
			`witness-${crypto.randomUUID()}`
		);
		const auth = initializeAuth(this.app, { persistence: inMemoryPersistence });
		if (env.PUBLIC_AUTH_EMULATOR_URL)
			connectAuthEmulator(auth, env.PUBLIC_AUTH_EMULATOR_URL, { disableWarnings: true });
		return auth;
	}

	/** Email and password. Returns the token, or 'code' when an authenticator code is needed. */
	async start(email: string, password: string): Promise<{ token: string } | 'code'> {
		await this.dispose();
		const auth = this.auth();
		try {
			const { user } = await signInWithEmailAndPassword(auth, email, password);
			return { token: await this.token(user) };
		} catch (e) {
			if ((e as { code?: string }).code === 'auth/multi-factor-auth-required') {
				this.resolver = getMultiFactorResolver(auth, e as MultiFactorError);
				return 'code';
			}
			await this.dispose();
			throw new Error('That email and password didn’t work for the witness.', { cause: e });
		}
	}

	/** The 6-digit code from the witness's authenticator app. */
	async finish(code: string): Promise<{ token: string }> {
		const hint = this.resolver?.hints.find(
			(h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
		);
		if (!this.resolver || !hint) throw new Error('Start the witness sign-in again.');
		try {
			const cred = await this.resolver.resolveSignIn(
				TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)
			);
			return { token: await this.token(cred.user) };
		} catch (e) {
			throw new Error('That code didn’t work. Try the current code.', { cause: e });
		}
	}

	private async token(user: User) {
		try {
			return await user.getIdToken();
		} finally {
			await this.dispose();
		}
	}

	/** Forgets the witness's sign-in. Safe to call more than once. */
	async dispose() {
		this.resolver = undefined;
		const app = this.app;
		this.app = undefined;
		if (app) await deleteApp(app).catch(() => {});
	}
}
