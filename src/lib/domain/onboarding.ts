// Getting started for caregivers (frontend-spec-2.md §6.5 "Onboarding flow
// for DSPs (learn-by-doing)"): clock in, open a person, write a quick note,
// sign it. Each step is done when the records show it, not when a tour is
// clicked through. Whether the tips were hidden lives in
// user_settings.disclosure, so it follows the person to other devices.

export interface Disclosure {
	onboardingDone?: boolean;
	/** The day the evening dark-mode suggestion was last dismissed (theme.ts). */
	darkSuggestionDay?: string;
}

/** The disclosure keys a client may set; anything else stored is ignored. */
export function parseDisclosure(value: unknown): Disclosure {
	let v = value;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return {};
		}
	}
	const r = ((typeof v === 'object' && v) || {}) as Disclosure;
	const out: Disclosure = {};
	if (typeof r.onboardingDone === 'boolean') out.onboardingDone = r.onboardingDone;
	if (typeof r.darkSuggestionDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.darkSuggestionDay))
		out.darkSuggestionDay = r.darkSuggestionDay;
	return out;
}

export interface OnboardingProgress {
	clockedIn: boolean;
	wroteNote: boolean;
	signedNote: boolean;
}
export interface OnboardingStep {
	key: 'clock' | 'person' | 'note' | 'sign';
	label: string;
	done: boolean;
}

export function onboardingSteps(p: OnboardingProgress): OnboardingStep[] {
	return [
		{ key: 'clock', label: 'Clock in at your home', done: p.clockedIn },
		{ key: 'person', label: 'Tap a person you support', done: p.wroteNote },
		{ key: 'note', label: 'Write a quick note about how they are doing', done: p.wroteNote },
		{ key: 'sign', label: 'Review it and sign', done: p.signedNote }
	];
}

/** Caregivers see the steps until they are all done or they hide them. */
export function showOnboarding(
	role: string,
	disclosure: Disclosure,
	steps: OnboardingStep[]
): boolean {
	return role === 'caregiver' && !disclosure.onboardingDone && steps.some((s) => !s.done);
}
