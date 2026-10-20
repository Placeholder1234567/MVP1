import { asService, type Tx } from '../../db';
import { developmentHistory } from './dev-history.queries';

/** Read-only agency view for the separately guarded admin development endpoint. */
export function developmentNotificationHistory(tx: Tx, agencyId: string, profileId?: string) {
	return asService(tx, (service) => developmentHistory(service, agencyId, profileId));
}
