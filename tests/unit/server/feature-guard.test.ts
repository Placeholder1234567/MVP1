import { isRedirect } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
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

describe('route guards (entitlements.md §7 "Route Guard Summary")', () => {
	// Every screen that only makes sense with a plan feature, and that feature.
	const GUARDS: Record<string, string[]> = {
		notes: ['charting'],
		shifts: ['scheduling'],
		messages: ['messaging'],
		controlled: ['mar'],
		'dashboard/notes': ['note_review'],
		'dashboard/timesheets': ['timekeeping'],
		'dashboard/intake': ['intake'],
		'dashboard/reports': ['reports', 'reports_basic'],
		'dashboard/goals': ['goals'],
		'dashboard/medications': ['mar'],
		'dashboard/mar': ['mar'],
		'dashboard/analytics': ['analytics'],
		'dashboard/audit': ['audit_log'],
		'people/[id]/note': ['charting'],
		'people/[id]/behavior': ['charting'],
		'people/[id]/attendance': ['charting'],
		'people/[id]/summary': ['charting'],
		'people/[id]/medications': ['mar'],
		'people/[id]/health': ['health'],
		'people/[id]/incident': ['incidents']
	};
	it.each(Object.entries(GUARDS))('%s needs %j', (route, features) => {
		const file = readFileSync(`src/routes/(app)/${route}/+layout.server.ts`, 'utf8');
		const call = file.match(/requireFeature\(\s*locals\.user,([^)]*)\)/);
		expect(call, route).not.toBeNull();
		expect([...call![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual(features);
	});
});
