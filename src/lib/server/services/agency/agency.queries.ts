import { eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies } from '../../db/schema';

export async function findAgency(tx: Tx, agencyId: string) {
	const [row] = await tx.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
	return row ?? null;
}
