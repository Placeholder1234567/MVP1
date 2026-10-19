// Operator plan changes (scripts/set-plan.ts): tier and extra features, the
// profiles' synced feature list follows, and the change is audited.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { setAgencyPlan } from '../../../src/lib/server/services/agency';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID();
const profile = randomUUID();
const slug = `plan-${agency.slice(0, 8)}`;

beforeAll(async () => {
	await withService(async (tx) => {
		await tx
			.insert(s.agencies)
			.values({ id: agency, name: 'Plan Test', subscription_tier: 'starter', slug });
		await tx.insert(s.profiles).values({
			id: profile,
			agency_id: agency,
			auth_uid: `plan-${profile}`,
			email: `${profile}@example.test`,
			name: 'Plan Admin',
			role: 'admin'
		});
	});
});

afterAll(closeDb);

const planOf = () =>
	withService(async (tx) => {
		const [a] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agency));
		const [p] = await tx.select().from(s.profiles).where(eq(s.profiles.id, profile));
		return { tier: a.subscription_tier, extras: a.enabled_features, synced: p.plan_features };
	});

it('a dry run reports the change without making it', async () => {
	const result = await withService((tx) =>
		setAgencyPlan(tx, { slug, tier: 'complete', operator: 'ops@example.test' }, { dryRun: true })
	);
	expect(result.after.tier).toBe('complete');
	expect(result.effective).toContain('intake');
	expect((await planOf()).tier).toBe('starter');
});

it('changes the tier and extras, updates staff profiles, and audits who did it', async () => {
	await withService((tx) =>
		setAgencyPlan(tx, {
			slug,
			tier: 'professional',
			features: ['intake', 'intake'],
			operator: 'ops@example.test'
		})
	);
	const plan = await planOf();
	expect(plan.tier).toBe('professional');
	expect(plan.extras).toEqual(['intake']);
	// The device's feature list follows (profiles_plan_features trigger).
	expect(plan.synced).toEqual(expect.arrayContaining(['charting', 'intake']));
	const [audit] = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'agency_plan')))
	);
	expect(audit.old_values).toEqual({ tier: 'starter', features: [] });
	expect(audit.new_values).toEqual({
		tier: 'professional',
		features: ['intake'],
		operator: 'ops@example.test'
	});
});

it('refuses unknown agencies, tiers, features and a missing operator', async () => {
	const run = (input: Record<string, unknown>) =>
		withService((tx) => setAgencyPlan(tx, input as never));
	await expect(
		run({ slug: 'no-such-agency', tier: 'complete', operator: 'ops@x.test' })
	).rejects.toThrow(/No agency/);
	await expect(run({ slug, tier: 'platinum', operator: 'ops@x.test' })).rejects.toThrow();
	await expect(run({ slug, features: ['teleport'], operator: 'ops@x.test' })).rejects.toThrow();
	await expect(run({ slug, tier: 'complete' })).rejects.toThrow();
	await expect(run({ slug, operator: 'ops@x.test' })).rejects.toThrow(/--tier/);
});
