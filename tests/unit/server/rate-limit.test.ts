import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../../src/lib/server/rate-limit';

describe('RateLimiter (security.md T4)', () => {
	it('allows a burst up to capacity, then says how long to wait', () => {
		let now = 0;
		const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1 }, () => now);
		expect([1, 2, 3].map(() => limiter.take('a'))).toEqual([0, 0, 0]);
		expect(limiter.take('a')).toBe(1);
		// Other keys have their own bucket.
		expect(limiter.take('b')).toBe(0);
		now = 1000;
		expect(limiter.take('a')).toBe(0);
		expect(limiter.take('a')).toBe(1);
	});

	it('refills to capacity at most', () => {
		let now = 0;
		const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1 }, () => now);
		limiter.take('a');
		now = 60_000;
		expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([0, 0, 1]);
	});

	it('reports what is left and when the bucket is full again (X-RateLimit-* headers)', () => {
		let now = 0;
		const limiter = new RateLimiter({ capacity: 30, refillPerSecond: 0.5 }, () => now);
		expect(limiter.status('k')).toEqual({ remaining: 30, resetSeconds: 0 });
		limiter.take('k');
		limiter.take('k');
		expect(limiter.status('k')).toEqual({ remaining: 28, resetSeconds: 4 });
		now = 2000;
		expect(limiter.status('k')).toEqual({ remaining: 29, resetSeconds: 2 });
	});
});
