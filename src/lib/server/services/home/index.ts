// Home Service (services.md): homes the caller can see.
import type { Tx } from '../../db';
import { selectHome, selectHomes } from './home.queries';

export function listHomes(tx: Tx, agencyId: string) {
	return selectHomes(tx, agencyId);
}

/** null when the home doesn't exist or is outside the caller's access. */
export function getHome(tx: Tx, agencyId: string, id: string) {
	return selectHome(tx, agencyId, id);
}
