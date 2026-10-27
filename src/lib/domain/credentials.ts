// Staff training and certifications (schema.ts staff_credentials): what an
// agency tracks for each staff member and when each lapses. Most expire on a
// one- or two-year cycle; a medication administration certificate's
// expiration date is the last day the person may give medications (Tennessee
// DIDD medication administration rules, and similar in other states).

export const CREDENTIAL_KINDS = [
	'med_admin',
	'cpr',
	'first_aid',
	'abuse_neglect',
	'other'
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = {
	med_admin: 'Medication administration',
	cpr: 'CPR',
	first_aid: 'First aid',
	abuse_neglect: 'Abuse and neglect training',
	other: 'Other training'
};

/** The stored name: the kind's label, or the agency's own name for 'other'. */
export function credentialName(kind: CredentialKind, name?: string | null): string {
	return kind === 'other' ? (name ?? '').trim() : CREDENTIAL_LABEL[kind];
}

/** Days before expiry when reminders go out; one more goes out once it lapses. */
export const REMINDER_DAYS = [30, 14, 7] as const;

/** From this many days before expiry a credential shows as expiring. */
export const EXPIRING_DAYS = 30;

export type CredentialStatus = 'current' | 'expiring' | 'expired' | 'no_expiry';

/** Days from today to the last valid day (negative once lapsed). */
export function daysLeft(expiresOn: string, today: string): number {
	return Math.round((Date.parse(expiresOn) - Date.parse(today)) / 86_400_000);
}

/** Valid through expiresOn; lapsed from the day after. */
export function credentialStatus(expiresOn: string | null, today: string): CredentialStatus {
	if (!expiresOn) return 'no_expiry';
	const left = daysLeft(expiresOn, today);
	if (left < 0) return 'expired';
	return left <= EXPIRING_DAYS ? 'expiring' : 'current';
}

/**
 * The reminder due today: the smallest reminder window the credential is in
 * (30, 14 or 7 days), or 'expired' once lapsed. Null when none is due. A
 * credential recorded inside a window gets that window's reminder only.
 */
export function reminderStage(
	expiresOn: string | null,
	today: string
): (typeof REMINDER_DAYS)[number] | 'expired' | null {
	if (!expiresOn) return null;
	const left = daysLeft(expiresOn, today);
	if (left < 0) return 'expired';
	let stage: (typeof REMINDER_DAYS)[number] | null = null;
	for (const d of REMINDER_DAYS) if (left <= d) stage = d;
	return stage;
}

/** Push and inbox text for the person it belongs to. No client data. */
export function ownReminderTitle(
	name: string,
	expiresOn: string,
	stage: NonNullable<ReturnType<typeof reminderStage>>
): string {
	return stage === 'expired'
		? `Your ${name} expired on ${expiresOn}. Renew it and tell your admin.`
		: `Your ${name} expires on ${expiresOn}. Plan your renewal.`;
}

/** Text for admins: names the credential, not the person (Staff shows who). */
export function adminReminderTitle(
	name: string,
	expiresOn: string,
	stage: 'expired' | (typeof REMINDER_DAYS)[number]
): string {
	return stage === 'expired'
		? `A staff member's ${name} expired on ${expiresOn}`
		: `A staff member's ${name} expires on ${expiresOn}`;
}

/**
 * Admins hear about a credential once while it is expiring (the first
 * reminder that goes out, whatever its window) and once when it lapses.
 */
export function adminReminderKey(stage: NonNullable<ReturnType<typeof reminderStage>>) {
	return stage === 'expired' ? 'expired' : 'expiring';
}
