import { expect, it } from 'vitest';
import { matchPlacement, placementNeeds } from '../../src/lib/domain/placement';
const facts = [
	{ homeId: 'a', homeName: 'Certified', availableRooms: 1, certifiedCaregivers: 1 },
	{ homeId: 'b', homeName: 'Gap', availableRooms: 1, certifiedCaregivers: 0 },
	{ homeId: 'c', homeName: 'Full', availableRooms: 0, certifiedCaregivers: 3 }
];
it('treats missing or invalid needs as unknown and never infers them from narrative', () => {
	for (const value of [
		null,
		{},
		{ notes: 'Medication support required' },
		{ medicationCertifiedStaff: 'yes' }
	]) {
		expect(placementNeeds(value)).toEqual({ medicationCertifiedStaff: 'unknown' });
	}
	expect(matchPlacement(placementNeeds(null), facts, true).map((h) => h.guidance)).toEqual([
		'needs_review',
		'needs_review',
		'no_available_room'
	]);
});
it('ranks recorded certification facts without calling them clinical eligibility or coverage', () => {
	expect(
		matchPlacement({ medicationCertifiedStaff: 'required' }, facts, true).map((h) => h.guidance)
	).toEqual(['review_candidate', 'certification_gap', 'no_available_room']);
	expect(
		matchPlacement({ medicationCertifiedStaff: 'not_required' }, facts, true)[1].guidance
	).toBe('review_candidate');
});
it('never labels a truncated comparison a candidate or a definite gap', () => {
	expect(
		matchPlacement({ medicationCertifiedStaff: 'required' }, facts, false).every(
			(h) => h.guidance === 'needs_review'
		)
	).toBe(true);
});
