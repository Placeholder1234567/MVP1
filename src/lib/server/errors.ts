// Errors a service throws when a request breaks a rule. Messages are shown to
// the user, so they never contain PHI (no names, health data or note text).
// tRPC turns them into TRPCErrors; sync.upload turns them into rejected-op
// codes (offline-sync.md Appendix B).

export type ServiceErrorCode =
	| 'VALIDATION_FAILED' // input is malformed or out of range
	| 'RULE_VIOLATION' // a business rule forbids it (e.g. editing a signed note)
	| 'NOT_FOUND' // the record doesn't exist or is outside the caller's access
	| 'FORBIDDEN'; // the caller's role or certification doesn't allow it

export class ServiceError extends Error {
	constructor(
		public readonly code: ServiceErrorCode,
		message: string
	) {
		super(message);
		this.name = 'ServiceError';
	}
}

/** Postgres SQLSTATE of a database error (Drizzle wraps it in .cause). */
export function pgCode(err: unknown): string | undefined {
	const e = err as { code?: unknown; cause?: { code?: unknown } };
	const code = e?.cause?.code ?? e?.code;
	return typeof code === 'string' ? code : undefined;
}

/** Name of the constraint a Postgres error is about, if any. */
export function pgConstraint(err: unknown): string | undefined {
	const e = err as { constraint?: unknown; cause?: { constraint?: unknown } };
	const c = e?.cause?.constraint ?? e?.constraint;
	return typeof c === 'string' ? c : undefined;
}
