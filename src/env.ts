// Environment variables (SvelteKit 3: declared here, imported from
// $app/env/public or $app/env/private). Only public, non-secret values are
// listed so far; server code reads its settings from process.env because the
// same modules also run in scripts and tests outside SvelteKit.
import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

const optional = z.string().optional();

export const variables = defineEnvVars({
	PUBLIC_FIREBASE_API_KEY: {
		public: true,
		schema: optional,
		description: 'Firebase web API key. A public identifier, not a secret.'
	},
	PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true, schema: optional },
	PUBLIC_FIREBASE_APP_ID: { public: true, schema: optional },
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { public: true, schema: optional },
	PUBLIC_FIREBASE_VAPID_KEY: {
		public: true,
		schema: optional,
		description: 'Public web push VAPID key; never a private key.'
	},
	PUBLIC_FIREBASE_PROJECT_ID: {
		public: true,
		schema: z.string().default('demo-guad'),
		description: 'Identity Platform project. demo-* projects only work with the emulator.'
	},
	PUBLIC_AUTH_EMULATOR_URL: {
		public: true,
		schema: optional,
		description: 'Local dev only, e.g. http://127.0.0.1:9099'
	},
	PUBLIC_POWERSYNC_URL: { public: true, schema: optional }
});
