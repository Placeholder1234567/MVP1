// Changing an agency's plan (services.md §2 updateAgency "subscription tier";
// entitlements.md "v1 constraints": no self-service, plan changes go through
// support). Operator only, from scripts/set-plan.ts, never from the app.
// The profiles_plan_features trigger (sql-patches/0001) copies the new
// feature set to every profile, so devices pick it up on their next sync.
import { z } from 'zod';
import {
	FEATURE_FLAGS,
	resolveFeatures,
	SUBSCRIPTION_TIERS
} from '../../../entitlements/tier-features.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { agencyPlanBySlug, recordPlanChange, updateAgencyRow } from './agency.queries';

export const PlanChange = z
	.object({
		slug: z.string().trim().min(1),
		tier: z.enum(SUBSCRIPTION_TIERS).optional(),
		/** Per-agency extras on top of the tier (enabled_features); replaces the current list. */
		features: z.array(z.enum(FEATURE_FLAGS)).optional(),
		/** Who is making the change, for the audit log (e.g. the operator's email). */
		operator: z.string().trim().min(3).max(254)
	})
	.refine((p) => p.tier !== undefined || p.features !== undefined, {
		message: 'Give --tier, --feature or --clear-features'
	});

export async function setAgencyPlan(
	tx: Tx,
	input: z.input<typeof PlanChange>,
	{ dryRun = false } = {}
) {
	const change = PlanChange.parse(input);
	const agency = await agencyPlanBySlug(tx, change.slug);
	if (!agency) throw new ServiceError('NOT_FOUND', 'No agency with that slug');
	const before = { tier: agency.tier, features: agency.features ?? [] };
	const after = {
		tier: change.tier ?? before.tier,
		features: change.features ? [...new Set(change.features)].sort() : before.features
	};
	const result = {
		agencyId: agency.id,
		before,
		after,
		effective: [...resolveFeatures(after.tier, after.features)].sort()
	};
	if (dryRun) return result;
	await updateAgencyRow(tx, agency.id, {
		subscription_tier: after.tier,
		enabled_features: after.features
	});
	// agencies has no row trigger, so the change is recorded here.
	await recordPlanChange(tx, agency.id, before, after, change.operator);
	return result;
}
