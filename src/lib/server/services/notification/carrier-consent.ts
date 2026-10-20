import type { Tx } from '../../db';
import { carrierOptOut } from './carrier-consent.queries';

/** Call under app_service; verified carrier STOP is independent of UI preferences. */
export async function smsCarrierSuppressed(tx: Tx, agencyId: string, phone: string) {
	return (await carrierOptOut(tx, agencyId, phone)) === true;
}
