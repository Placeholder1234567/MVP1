// Route guards for plan features (entitlements.md §7 "Route Guard Summary").
// The tRPC procedures already refuse ungated calls; these keep people from
// landing on a screen their agency's plan doesn't include. v1 hides such
// features entirely: no upgrade prompts.
import { redirect } from '@sveltejs/kit';
import type { FeatureFlag } from '../entitlements/tier-features.ts';

/** Redirects home unless the agency has at least one of the features. */
export function requireFeature(
	user: { features: readonly string[] } | null | undefined,
	...anyOf: FeatureFlag[]
): void {
	if (!user || !anyOf.some((f) => user.features.includes(f))) redirect(303, '/');
}
