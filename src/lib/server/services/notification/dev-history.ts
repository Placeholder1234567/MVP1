import { asService, type Tx } from '../../db';
import { developmentHistory, syntheticNotificationEvent } from './dev-history.queries';

/** Read-only agency view for the separately guarded admin development endpoint. */
export function developmentNotificationHistory(tx: Tx, agencyId: string, profileId?: string) {
	return asService(tx, (service) => developmentHistory(service, agencyId, profileId));
}

export function isSyntheticNotificationEvent(
	tx: Tx,
	agencyId: string,
	notificationId: string,
	referenceId: string
) {
	return asService(tx, (service) =>
		syntheticNotificationEvent(service, agencyId, notificationId, referenceId)
	);
}
