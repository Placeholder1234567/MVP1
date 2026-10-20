/** Explicitly recorded needs only. Free text is never used as eligibility evidence. */
export type PlacementNeeds = {
	medicationCertifiedStaff: 'unknown' | 'required' | 'not_required';
};
export function placementNeeds(value: unknown): PlacementNeeds {
	const need = (value as Partial<PlacementNeeds> | null)?.medicationCertifiedStaff;
	return {
		medicationCertifiedStaff: need === 'required' || need === 'not_required' ? need : 'unknown'
	};
}
export type PlacementFacts = {
	homeId: string;
	homeName: string;
	availableRooms: number;
	certifiedCaregivers: number;
};
export function matchPlacement(needs: PlacementNeeds, facts: PlacementFacts[], complete: boolean) {
	return facts
		.map((home) => ({
			...home,
			guidance: !complete
				? ('needs_review' as const)
				: !home.availableRooms
					? ('no_available_room' as const)
					: needs.medicationCertifiedStaff === 'unknown'
						? ('needs_review' as const)
						: needs.medicationCertifiedStaff === 'required' && !home.certifiedCaregivers
							? ('certification_gap' as const)
							: ('review_candidate' as const)
		}))
		.sort((a, b) => {
			const rank = {
				review_candidate: 0,
				needs_review: 1,
				certification_gap: 2,
				no_available_room: 3
			};
			return (
				rank[a.guidance] - rank[b.guidance] ||
				a.homeName.localeCompare(b.homeName) ||
				a.homeId.localeCompare(b.homeId)
			);
		});
}
export const PLACEMENT_GUIDANCE = {
	review_candidate: 'Candidate for human review',
	needs_review: 'Needs review · incomplete information',
	certification_gap: 'Medication certification gap',
	no_available_room: 'No available room recorded'
} as const;
