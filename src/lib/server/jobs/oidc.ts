// Only Cloud Tasks and Cloud Scheduler may call job endpoints. They attach a
// Google-signed OIDC token for the worker's service account (queue.ts); this
// checks the signature, audience and identity.
import { OAuth2Client } from 'google-auth-library';

const verifier = new OAuth2Client();

export async function isGoogleSignedJobRequest(authorization: string | null): Promise<boolean> {
	const token = authorization?.match(/^Bearer (.+)$/)?.[1];
	const audience = process.env.WORKER_URL;
	const expected = process.env.WORKER_SERVICE_ACCOUNT;
	if (!token || !audience || !expected) return false;
	try {
		const ticket = await verifier.verifyIdToken({ idToken: token, audience });
		const p = ticket.getPayload();
		return !!p && p.email === expected && p.email_verified === true;
	} catch {
		return false;
	}
}
