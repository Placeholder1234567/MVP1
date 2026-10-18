// Request handling shared by the external API routes (src/routes/api/v1,
// openapi.yaml). Authenticates the Bearer API key, applies the per-key rate
// limit with X-RateLimit-* headers, checks the plan feature and key scope,
// turns errors into the spec's { error, message } bodies (never PHI), and
// writes one audit_log row per call.
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiInputError, WebhookUrlError } from '#lib/domain/index.ts';
import {
	authenticateKey,
	logApiAccess,
	type ApiCaller
} from '#lib/server/services/integration/index.ts';
import { apiExports, apiFailuresByIp, apiRequests, type RateLimiter } from './rate-limit.ts';

export interface ApiOptions {
	/** openapi.yaml operationId, recorded in the audit log */
	operation: string;
	/** Plan feature the operation needs */
	feature?: string | null;
	/** 'write' for operations that change data */
	scope?: 'read' | 'write';
	/** The bulk export bucket instead of the default one */
	bulk?: boolean;
}

export interface ApiResult {
	body: unknown;
	status?: number;
	/** A file instead of JSON */
	contentType?: string;
	filename?: string;
	/** Records returned, for the audit row */
	records?: number;
}

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
	});

const fail = (status: number, error: string, message: string, headers?: Record<string, string>) =>
	json(status, { error, message }, headers);

function bearer(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const m = header.match(/^Bearer\s+(\S+)$/i);
	return m ? m[1] : null;
}

function limitHeaders(limiter: RateLimiter, capacity: number, key: string) {
	const s = limiter.status(key);
	return {
		'x-ratelimit-limit': String(capacity),
		'x-ratelimit-remaining': String(s.remaining),
		'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + s.resetSeconds)
	};
}

/** Query parameters for the audit row: names and values (IDs, dates, flags; never PHI). */
const auditParams = (event: RequestEvent) => ({
	...event.params,
	...Object.fromEntries(event.url.searchParams)
});

export async function handleApi(
	event: RequestEvent,
	opts: ApiOptions,
	run: (caller: ApiCaller) => Promise<ApiResult>
): Promise<Response> {
	const ip = event.getClientAddress();
	const token = bearer(event.request);
	const caller = token ? await authenticateKey(token) : null;
	if (!caller) {
		const wait = apiFailuresByIp.take(ip);
		if (wait)
			return fail(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${wait} seconds.`, {
				'retry-after': String(wait)
			});
		return fail(401, 'UNAUTHORIZED', 'Invalid or expired API key');
	}

	const [limiter, capacity] = opts.bulk ? [apiExports, 60] : [apiRequests, 30];
	const bucket = `${caller.keyId}`;
	const wait = limiter.take(bucket);
	const headers = limitHeaders(limiter, capacity, bucket);
	const audit = (status: number, records?: number) =>
		logApiAccess({
			caller,
			operation: opts.operation,
			params: auditParams(event),
			status,
			records,
			ip,
			userAgent: event.request.headers.get('user-agent')
		});

	if (wait) {
		await audit(429);
		return fail(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${wait} seconds.`, {
			...headers,
			'retry-after': String(wait)
		});
	}
	if (opts.feature && !caller.features.has(opts.feature)) {
		await audit(403);
		return fail(403, 'FORBIDDEN', "This data isn't included in the agency's plan", headers);
	}
	if (opts.scope === 'write' && caller.scope !== 'write') {
		await audit(403);
		return fail(403, 'FORBIDDEN', 'API key does not have write access', headers);
	}

	try {
		const result = await run(caller);
		const status = result.status ?? 200;
		await audit(status, result.records);
		if (result.contentType) {
			return new Response(result.body as BodyInit, {
				status,
				headers: {
					...headers,
					'content-type': result.contentType,
					'cache-control': 'no-store',
					...(result.filename
						? { 'content-disposition': `attachment; filename="${result.filename}"` }
						: {})
				}
			});
		}
		return status === 204
			? new Response(null, { status, headers })
			: json(status, result.body, headers);
	} catch (e) {
		if (e instanceof ApiInputError) {
			await audit(400);
			return fail(400, 'BAD_REQUEST', e.message, headers);
		}
		if (e instanceof ZodError) {
			await audit(400);
			const issue = e.issues[0];
			return fail(
				400,
				'BAD_REQUEST',
				issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body',
				headers
			);
		}
		if (e instanceof WebhookUrlError) {
			await audit(422);
			return fail(422, 'UNPROCESSABLE', e.message, headers);
		}
		if (e instanceof ApiError) {
			await audit(e.status);
			return fail(e.status, e.code, e.message, headers);
		}
		// Messages can carry query values, so log only an operation ID and the error name.
		const id = randomUUID();
		console.error(`api ${opts.operation} failed op=${id} ${(e as Error)?.name ?? 'Error'}`);
		await audit(500).catch(() => {});
		return fail(500, 'INTERNAL', `Something went wrong (reference ${id})`, headers);
	}
}

export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Resource not found');

/** The JSON request body, as an object; anything else is a 400. */
export async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
	if (!(event.request.headers.get('content-type') ?? '').includes('application/json'))
		throw new ApiInputError('Send a JSON body with Content-Type: application/json');
	const text = await event.request.text();
	if (text.length > 16_384) throw new ApiInputError('Request body is too large');
	try {
		const value = JSON.parse(text);
		if (value && typeof value === 'object' && !Array.isArray(value)) return value;
	} catch {
		// fall through
	}
	throw new ApiInputError('Request body must be a JSON object');
}
