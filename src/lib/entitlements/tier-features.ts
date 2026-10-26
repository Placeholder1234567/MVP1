// Subscription tiers and feature flags (entitlements.md §2-4). Shared by the
// server (tRPC gating) and the app (hiding what an agency doesn't have), so
// both always agree. Pure data and functions: no server or browser imports.

export const FEATURE_FLAGS = [
	'scheduling',
	'coverage',
	'timekeeping',
	'charting',
	'lomi_drafting',
	'mar',
	'goals',
	'health',
	'incidents',
	'note_review',
	'analytics',
	'analytics_advanced',
	'reports',
	'reports_basic',
	'reports_scheduled',
	'lomi_summary',
	'audit_log',
	'intake',
	'messaging',
	'notifications'
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const SUBSCRIPTION_TIERS = ['starter', 'professional', 'complete'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/** If a flag is present without its prerequisite, the prerequisite is added. */
export const FEATURE_DEPENDENCIES: Partial<Record<FeatureFlag, FeatureFlag[]>> = {
	note_review: ['charting'],
	analytics_advanced: ['analytics'],
	reports_scheduled: ['reports']
};

const STARTER: FeatureFlag[] = [
	'scheduling',
	'coverage',
	'timekeeping',
	'reports_basic',
	'messaging',
	'notifications'
];
const PROFESSIONAL: FeatureFlag[] = [
	...STARTER,
	'charting',
	'lomi_drafting',
	'lomi_summary',
	'mar',
	'goals',
	'health',
	'incidents',
	'note_review',
	'reports'
];
const COMPLETE: FeatureFlag[] = [
	...PROFESSIONAL,
	'analytics',
	'analytics_advanced',
	'audit_log',
	'intake',
	'reports_scheduled'
];

/** Baseline features per tier; each tier includes the ones below it. */
export const TIER_FEATURES: Record<SubscriptionTier, readonly FeatureFlag[]> = {
	starter: STARTER,
	professional: PROFESSIONAL,
	complete: COMPLETE
};

export function isFeatureFlag(f: string): f is FeatureFlag {
	return (FEATURE_FLAGS as readonly string[]).includes(f);
}

function isTier(t: string): t is SubscriptionTier {
	return (SUBSCRIPTION_TIERS as readonly string[]).includes(t);
}

/**
 * An agency's effective features: its tier's baseline plus any per-agency
 * overrides (enabled_features), with prerequisites added. Unknown tiers fall
 * back to Starter; unknown flags are ignored.
 */
export function resolveFeatures(
	tier: string | null | undefined,
	enabledFeatures: readonly string[] | null | undefined = []
): Set<FeatureFlag> {
	const baseline = TIER_FEATURES[tier && isTier(tier) ? tier : 'starter'];
	const effective = new Set<FeatureFlag>([
		...baseline,
		...(enabledFeatures ?? []).filter(isFeatureFlag)
	]);
	for (const [flag, deps] of Object.entries(FEATURE_DEPENDENCIES)) {
		if (effective.has(flag as FeatureFlag)) for (const d of deps!) effective.add(d);
	}
	return effective;
}

/** For UI checks: the effective list (sorted) as sent by agency.get. */
export function hasFeature(features: readonly string[], feature: FeatureFlag): boolean {
	return features.includes(feature);
}
