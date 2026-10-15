import type { RequestEvent } from '@sveltejs/kit';
import type { CurrentUser } from '../services/auth/index.ts';
import type { RequestInfo } from '../db/index.ts';

export interface Context {
	/** Signed-in user from hooks.server.ts, or null */
	user: CurrentUser | null;
	/** Recorded by the audit trigger for every row a mutation changes */
	request: RequestInfo;
}

export function createContext(event: RequestEvent): Context {
	return {
		user: event.locals.user,
		request: {
			ip: event.getClientAddress(),
			user_agent: event.request.headers.get('user-agent') ?? undefined
		}
	};
}
