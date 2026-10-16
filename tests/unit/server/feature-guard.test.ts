import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { requireFeature } from '../../../src/lib/server/feature-guard';

const caught = (fn: () => void) => {
	try {
		fn();
		return undefined;
	} catch (e) {
		return e;
	}
};

describe('requireFeature (entitlements.md §7)', () => {
	it('lets the page load when the plan has any of the features', () => {
		expect(
			caught(() => requireFeature({ features: ['reports_basic'] }, 'reports', 'reports_basic'))
		).toBeUndefined();
	});

	it('sends people home when the plan lacks them, or nobody is signed in', () => {
		for (const user of [{ features: ['scheduling'] }, null]) {
			const e = caught(() => requireFeature(user, 'intake'));
			expect(isRedirect(e)).toBe(true);
			expect(e).toMatchObject({ status: 303, location: '/' });
		}
	});
});
