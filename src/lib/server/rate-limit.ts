// Request throttling (security.md T4; trpc-router.md "rateLimitMiddleware").
// An in-memory token bucket per key and per Cloud Run instance, so the limit
// is approximate (each instance counts separately), which is what the spec
// asks for. AI endpoints have their own exact limits from audit_log (lomi).

export interface BucketOptions {
	/** Requests allowed in a burst */
	capacity: number;
	/** Tokens added back per second */
	refillPerSecond: number;
}

interface Bucket {
	tokens: number;
	updated: number;
}

export class RateLimiter {
	private buckets = new Map<string, Bucket>();

	constructor(
		private readonly options: BucketOptions,
		private readonly now: () => number = Date.now
	) {}

	/** Takes one token. Returns 0 when allowed, else seconds until the next token. */
	take(key: string): number {
		const { capacity, refillPerSecond } = this.options;
		const t = this.now();
		const b = this.buckets.get(key) ?? { tokens: capacity, updated: t };
		b.tokens = Math.min(capacity, b.tokens + ((t - b.updated) / 1000) * refillPerSecond);
		b.updated = t;
		this.buckets.set(key, b);
		if (this.buckets.size > 10_000) this.sweep(t);
		if (b.tokens >= 1) {
			b.tokens -= 1;
			return 0;
		}
		return Math.ceil((1 - b.tokens) / refillPerSecond);
	}

	/** Forgets keys whose bucket has refilled, so memory stays bounded. */
	private sweep(t: number) {
		const { capacity, refillPerSecond } = this.options;
		for (const [key, b] of this.buckets) {
			if (b.tokens + ((t - b.updated) / 1000) * refillPerSecond >= capacity)
				this.buckets.delete(key);
		}
	}
}

/** security.md T4: 100 tRPC requests a minute per user. */
export const userRequests = new RateLimiter({ capacity: 100, refillPerSecond: 100 / 60 });

/** Session sign-ins per client IP; Identity Platform also throttles password guesses. */
export const signInsByIp = new RateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });
