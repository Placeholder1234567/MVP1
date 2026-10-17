import { eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies } from '../../db/schema';

export async function findAgency(tx: Tx, agencyId: string) {
	const [row] = await tx.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
	return row ?? null;
}

export async function updateAgencyRow(
	tx: Tx,
	agencyId: string,
	set: Partial<typeof agencies.$inferInsert>
) {
	const [row] = await tx
		.update(agencies)
		.set({ ...set, updated_at: new Date() })
		.where(eq(agencies.id, agencyId))
		.returning();
	return row ?? null;
}

export async function agencyBySlug(tx: Tx, slug: string) {
	const [row] = await tx
		.select({ id: agencies.id })
		.from(agencies)
		.where(eq(agencies.slug, slug))
		.limit(1);
	return row ?? null;
}

export async function insertAgency(tx: Tx, row: typeof agencies.$inferInsert) {
	const [created] = await tx.insert(agencies).values(row).returning({ id: agencies.id });
	return created;
}
