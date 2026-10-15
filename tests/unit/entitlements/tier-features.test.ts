import { describe, expect, it } from 'vitest';
import { resolveFeatures, TIER_FEATURES } from '../../../src/lib/entitlements/tier-features';

describe('resolveFeatures', () => {
	it('tiers are cumulative and match entitlements.md', () => {
		expect([...TIER_FEATURES.starter].sort()).toEqual(
			[
				'coverage',
				'messaging',
				'notifications',
				'reports_basic',
				'scheduling',
				'timekeeping'
			].sort()
		);
		for (const f of TIER_FEATURES.starter) expect(TIER_FEATURES.professional).toContain(f);
		for (const f of TIER_FEATURES.professional) expect(TIER_FEATURES.complete).toContain(f);
		expect(TIER_FEATURES.professional).not.toContain('intake');
		expect(TIER_FEATURES.complete).toContain('intake');
	});

	it('per-agency overrides are added on top of the tier', () => {
		const f = resolveFeatures('starter', ['analytics']);
		expect(f.has('analytics')).toBe(true);
		expect(f.has('charting')).toBe(false);
	});

	it('adds prerequisites for dependent flags', () => {
		const f = resolveFeatures('starter', ['note_review', 'analytics_advanced']);
		expect(f.has('charting')).toBe(true);
		expect(f.has('analytics')).toBe(true);
	});

	it('unknown tiers fall back to Starter and unknown flags are ignored', () => {
		const f = resolveFeatures('platinum', ['teleport']);
		expect([...f].sort()).toEqual([...TIER_FEATURES.starter].sort());
		expect(resolveFeatures(null, null).has('scheduling')).toBe(true);
	});
});
