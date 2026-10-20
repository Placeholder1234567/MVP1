import type { Tx } from '../../db';
import { carrierOptOut, carrierRecipient, carrierState } from './carrier-consent.queries';

/** Call under app_service; verified carrier STOP is independent of UI preferences. */
export async function smsCarrierSuppressed(tx: Tx, agencyId: string, phone: string) {
	return (await carrierOptOut(tx, agencyId, phone)) === true;
}

/** Read-only: preview must never initialize consent rows or infer new consent. */
export async function smsCarrierOverrideAllowed(
	tx: Tx,
	agencyId: string,
	profileId: string,
	expectedPhone?: string
) {
	const person = await carrierRecipient(tx, agencyId, profileId);
	return !!(
		person?.active &&
		person.role === 'supervisor' &&
		person.phone &&
		(expectedPhone === undefined || person.phone === expectedPhone) &&
		(await carrierState(tx, agencyId, person.phone)) === 'started'
	);
}
