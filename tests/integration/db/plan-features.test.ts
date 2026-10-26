// The database copy of the plan rules (sql-patches/0001_plan_features.sql, as replaced by 0019)
// must agree with the app's resolveFeatures() for every tier and override,
// or offline sync would gate differently from the API.
import { afterAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import {
	FEATURE_FLAGS,
	resolveFeatures,
	SUBSCRIPTION_TIERS
} from '../../../src/lib/entitlements/tier-features';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
afterAll(closeDb);

const dbFeatures = (tier: string | null, extra: string[]) =>
	withService(async (tx) => {
		const res = await tx.execute(
			sql`SELECT app.plan_features(${tier}, ARRAY(SELECT json_array_elements_text(${JSON.stringify(extra)}::json))) AS f`
		);
		return [...((res.rows[0] as { f: string[] }).f ?? [])].sort();
	});

it('matches resolveFeatures for every tier, override and prerequisite', async () => {
	const overrides = [
		[],
		['intake'],
		['note_review'],
		['analytics_advanced'],
		['reports_scheduled'],
		['not-a-flag', 'mar']
	];
	for (const tier of [...SUBSCRIPTION_TIERS, null, 'unknown-tier'])
		for (const extra of overrides) {
			const expected = [
				...resolveFeatures((tier ?? 'starter') as (typeof SUBSCRIPTION_TIERS)[number], extra)
			].sort();
			expect(await dbFeatures(tier, extra), `${tier} + ${extra.join(',')}`).toEqual(expected);
		}
	expect(FEATURE_FLAGS.length).toBe(20);
});
