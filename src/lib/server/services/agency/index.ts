// Agency Service (services.md): the caller's agency and its configuration.
import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { findAgency, updateAgencyRow } from './agency.queries';

export async function getAgency(tx: Tx, agencyId: string) {
	const a = await findAgency(tx, agencyId);
	if (!a) return null;
	return {
		id: a.id,
		name: a.name,
		slug: a.slug,
		chartingPreset: a.charting_preset,
		settings: a.settings ?? {},
		subscriptionTier: a.subscription_tier ?? 'starter',
		enabledFeatures: a.enabled_features ?? [],
		timezone: a.timezone,
		createdAt: a.created_at,
		updatedAt: a.updated_at
	};
}

/**
 * Settings an admin may change. Unknown keys are kept, so settings added by
 * later features survive; the known ones are checked.
 */
export const AgencySettings = z
	.object({
		mfa_required_roles: z.array(z.enum(['caregiver', 'supervisor'])).optional()
	})
	.passthrough();

export const AgencyChanges = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	/** Labels and form order only, never schema, API or validation (CLAUDE.md). */
	chartingPreset: z.enum(['therap', 'default']).optional(),
	timezone: z
		.string()
		.refine((tz) => {
			try {
				new Intl.DateTimeFormat('en', { timeZone: tz });
				return true;
			} catch {
				return false;
			}
		}, 'Unknown time zone')
		.optional(),
	settings: AgencySettings.optional()
});

/** Plan (subscription tier, features) is not changed here: that is billing's job. */
export async function updateAgency(tx: Tx, agencyId: string, input: z.infer<typeof AgencyChanges>) {
	const data = AgencyChanges.parse(input);
	const current = await findAgency(tx, agencyId);
	if (!current) throw new ServiceError('NOT_FOUND', 'Agency not found');
	const row = await updateAgencyRow(tx, agencyId, {
		name: data.name,
		charting_preset: data.chartingPreset,
		timezone: data.timezone,
		settings: data.settings
			? { ...((current.settings as object | null) ?? {}), ...data.settings }
			: undefined
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Agency not found');
	return getAgency(tx, agencyId);
}
