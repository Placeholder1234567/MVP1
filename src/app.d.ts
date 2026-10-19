// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { CurrentUser } from '#lib/server/services/auth/index.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Set by hooks.server.ts from a verified session cookie; null when signed out */
			user: CurrentUser | null;
			/** When that session's sign-in happened (ms), from the session cookie */
			signedInAt: number | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
