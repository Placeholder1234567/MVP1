// Job endpoints accept only Google-signed OIDC tokens for the worker's
// service account (src/lib/server/jobs/oidc.ts). Google's verifier is mocked;
// these pin what is checked once a token's signature is valid.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
	OAuth2Client: class {
		verifyIdToken = verifyIdToken;
	}
}));
const { isGoogleSignedJobRequest } = await import('../../../src/lib/server/jobs/oidc');

const WORKER = 'https://guad-worker.example.run.app';
const SA = 'guad-tasks@project.iam.gserviceaccount.com';
const payload = (p: object) => ({ getPayload: () => p });

beforeEach(() => {
	vi.stubEnv('WORKER_URL', WORKER);
	vi.stubEnv('WORKER_SERVICE_ACCOUNT', SA);
	verifyIdToken.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it('accepts a verified token for the worker service account, checking the worker URL as audience', async () => {
	verifyIdToken.mockResolvedValue(payload({ email: SA, email_verified: true }));
	expect(await isGoogleSignedJobRequest('Bearer good-token')).toBe(true);
	expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'good-token', audience: WORKER });
});

it('refuses a missing or malformed header without calling Google', async () => {
	for (const header of [null, '', 'good-token', 'Basic abc', 'Bearer'])
		expect(await isGoogleSignedJobRequest(header)).toBe(false);
	expect(verifyIdToken).not.toHaveBeenCalled();
});

it('refuses everything when the worker URL or service account is not configured', async () => {
	verifyIdToken.mockResolvedValue(payload({ email: SA, email_verified: true }));
	vi.stubEnv('WORKER_URL', '');
	expect(await isGoogleSignedJobRequest('Bearer good-token')).toBe(false);
	vi.stubEnv('WORKER_URL', WORKER);
	vi.stubEnv('WORKER_SERVICE_ACCOUNT', '');
	expect(await isGoogleSignedJobRequest('Bearer good-token')).toBe(false);
});

it('refuses another identity, an unverified email, no payload, or a token Google rejects', async () => {
	verifyIdToken.mockResolvedValueOnce(
		payload({ email: 'someone@project.iam.gserviceaccount.com', email_verified: true })
	);
	expect(await isGoogleSignedJobRequest('Bearer t')).toBe(false);
	verifyIdToken.mockResolvedValueOnce(payload({ email: SA, email_verified: false }));
	expect(await isGoogleSignedJobRequest('Bearer t')).toBe(false);
	verifyIdToken.mockResolvedValueOnce(payload(undefined as unknown as object));
	expect(await isGoogleSignedJobRequest('Bearer t')).toBe(false);
	verifyIdToken.mockRejectedValueOnce(
		new Error('Wrong recipient, payload audience != requiredAudience')
	);
	expect(await isGoogleSignedJobRequest('Bearer t')).toBe(false);
});
