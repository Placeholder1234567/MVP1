import { describe, expect, it } from 'vitest';
import {
	onboardingSteps,
	parseDisclosure,
	showOnboarding
} from '../../../src/lib/domain/onboarding';

describe('getting started (frontend-spec-2.md §6.5)', () => {
	const none = { clockedIn: false, wroteNote: false, signedNote: false };
	it('ticks steps off from the records', () => {
		expect(onboardingSteps(none).map((s) => s.done)).toEqual([false, false, false, false]);
		expect(
			onboardingSteps({ clockedIn: true, wroteNote: true, signedNote: false }).map((s) => s.done)
		).toEqual([true, true, true, false]);
	});

	it('shows caregivers the steps until they are done or hidden', () => {
		const steps = onboardingSteps(none);
		expect(showOnboarding('caregiver', {}, steps)).toBe(true);
		expect(showOnboarding('supervisor', {}, steps)).toBe(false);
		expect(showOnboarding('caregiver', { onboardingDone: true }, steps)).toBe(false);
		const done = onboardingSteps({ clockedIn: true, wroteNote: true, signedNote: true });
		expect(showOnboarding('caregiver', {}, done)).toBe(false);
	});

	it('reads only known flags, from JSON text or an object', () => {
		expect(parseDisclosure('{"onboardingDone":true,"other":1}')).toEqual({ onboardingDone: true });
		expect(parseDisclosure({ onboardingDone: 'yes' })).toEqual({});
		expect(parseDisclosure('not json')).toEqual({});
		expect(parseDisclosure(null)).toEqual({});
	});
});
