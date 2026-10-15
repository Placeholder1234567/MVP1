// AWS access for messaging without stored keys (infrastructure.md §2): the
// worker's Google service account gets a Google-signed ID token, and AWS STS
// exchanges it for short-lived credentials for AWS_ROLE_ARN (an IAM role that
// trusts accounts.google.com for that service account and may only send
// SES email and SMS). The SDK refreshes the credentials before they expire.
import { fromWebToken } from '@aws-sdk/credential-providers';
import { GoogleAuth } from 'google-auth-library';

const google = new GoogleAuth();

function need(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
}

/** Credentials provider for the AWS SDK clients. */
export function awsCredentials() {
	// AWS_ACCESS_KEY_ID set explicitly (e.g. a developer's own sandbox account)
	// lets the SDK's default chain take over instead.
	if (process.env.AWS_ACCESS_KEY_ID) return undefined;
	const roleArn = need('AWS_ROLE_ARN');
	const audience = process.env.AWS_WEB_IDENTITY_AUDIENCE ?? 'sts.amazonaws.com';
	return async () => {
		const client = await google.getIdTokenClient(audience);
		const webIdentityToken = await client.idTokenProvider.fetchIdToken(audience);
		return fromWebToken({ roleArn, webIdentityToken, roleSessionName: 'guad-worker' })();
	};
}

export function awsRegion(): string {
	return need('AWS_REGION');
}
