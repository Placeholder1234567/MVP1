// The feature the person just tried that their agency's plan doesn't include
// (entitlements.md §9). Set by the tRPC client link when a plan gate answers;
// UpgradeDialog shows it.
export const upgrade = $state<{ feature: string | null }>({ feature: null });

export function showUpgrade(feature: string) {
	upgrade.feature = feature;
}
