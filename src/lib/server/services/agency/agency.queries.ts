import { eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, auditLog } from '../../db/schema';

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

/** An agency's plan by slug, locked for the change. */
export async function agencyPlanBySlug(tx: Tx, slug: string) {
	const [row] = await tx
		.select({
			id: agencies.id,
			tier: agencies.subscription_tier,
			features: agencies.enabled_features
		})
		.from(agencies)
		.where(eq(agencies.slug, slug))
		.for('update')
		.limit(1);
	return row ?? null;
}

/** A plan change by the operator (no app user), for the audit log. */
export async function recordPlanChange(
	tx: Tx,
	agencyId: string,
	before: { tier: string; features: string[] },
	after: { tier: string; features: string[] },
	operator: string
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'agency_plan',
		record_id: agencyId,
		action: 'UPDATE',
		old_values: before,
		new_values: { ...after, operator }
	});
}

/** A full data export by the operator, with row counts and file checksums. */
export async function recordAgencyExport(
	tx: Tx,
	agencyId: string,
	manifest: { operationId: string; tables: Record<string, { rows: number; sha256: string }> },
	operator: string
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'agency_export',
		record_id: manifest.operationId,
		action: 'INSERT',
		new_values: { format: 'csv', tables: manifest.tables, operator }
	});
}
