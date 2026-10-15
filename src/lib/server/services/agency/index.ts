// Agency Service (services.md): the caller's agency and its configuration.
import type { Tx } from '../../db';
import { findAgency } from './agency.queries';

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
