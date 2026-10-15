import { randomUUID } from 'node:crypto';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { withUser, type Tx } from '../db/index.ts';
import { hasRole, type Role } from '../services/auth/index.ts';
import type { Context } from './context.ts';

const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		// Unexpected errors can carry query parameters (client data) in their
		// message, so the client only gets an operation ID. The server log gets
		// the same ID plus the Postgres error code, never the message.
		if (error.code === 'INTERNAL_SERVER_ERROR') {
			const opId = randomUUID().slice(0, 8);
			const pgCode = (error.cause as { cause?: { code?: string } } | undefined)?.cause?.code;
			console.error(`trpc internal error op=${opId}${pgCode ? ` pg=${pgCode}` : ''}`);
			return {
				...shape,
				message: `Something went wrong (ref: ${opId}). Try again.`,
				data: { code: shape.data.code, httpStatus: shape.data.httpStatus, opId }
			};
		}
		return { ...shape, data: { code: shape.data.code, httpStatus: shape.data.httpStatus } };
	}
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * authMiddleware (trpc-router.md §1): requires a signed-in, active user, then
 * runs the procedure inside withUser(), so ctx.db is a transaction where RLS
 * and the integrity triggers apply with this user's claims.
 */
const authed = t.middleware(({ ctx, next }) => {
	const user = ctx.user;
	if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue' });
	return withUser(user.claims, ctx.request, (db: Tx) => next({ ctx: { user, db } }));
});

/** Procedures for signed-in users. ctx.user and ctx.db are always set. */
export const userProcedure = t.procedure.use(authed);

/** roleMiddleware (trpc-router.md §2): caregiver < supervisor < admin. */
export function roleProcedure(minRole: Role) {
	return userProcedure.use(({ ctx, next }) => {
		if (!hasRole(ctx.user, minRole)) {
			throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this' });
		}
		return next();
	});
}
