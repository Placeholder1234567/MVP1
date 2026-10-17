import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, goals, goalTemplates } from '../../db/schema';

const goalFields = {
	id: goals.id,
	clientId: goals.client_id,
	area: goals.area,
	text: goals.text,
	steps: goals.steps,
	frequency: goals.frequency,
	target: goals.target,
	startedAt: goals.started_at,
	stoppedAt: goals.stopped_at,
	createdAt: goals.created_at,
	updatedAt: goals.updated_at
};
export async function visibleGoalClient(tx: Tx, agencyId: string, id: string, lock = false) {
	const q = tx
		.select({ id: clients.id, active: clients.active })
		.from(clients)
		.where(and(eq(clients.agency_id, agencyId), eq(clients.id, id)))
		.limit(1);
	return (await (lock ? q.for('update') : q))[0];
}
export function goalRows(tx: Tx, agencyId: string, clientId: string, includeStopped: boolean) {
	return tx
		.select(goalFields)
		.from(goals)
		.where(
			and(
				eq(goals.agency_id, agencyId),
				eq(goals.client_id, clientId),
				includeStopped ? undefined : isNull(goals.stopped_at)
			)
		)
		.orderBy(asc(goals.created_at), asc(goals.id))
		.limit(501);
}
export async function lockedGoal(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select(goalFields)
			.from(goals)
			.where(and(eq(goals.agency_id, agencyId), eq(goals.id, id)))
			.for('update')
	)[0];
}
export async function insertGoal(tx: Tx, row: typeof goals.$inferInsert) {
	return (await tx.insert(goals).values(row).returning(goalFields))[0];
}
export async function updateGoalRow(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<
		Pick<
			typeof goals.$inferInsert,
			'area' | 'text' | 'steps' | 'frequency' | 'target' | 'stopped_at'
		>
	>
) {
	return (
		await tx
			.update(goals)
			.set({ ...set, updated_at: new Date() })
			.where(and(eq(goals.agency_id, agencyId), eq(goals.id, id), isNull(goals.stopped_at)))
			.returning(goalFields)
	)[0];
}
const templateFields = {
	id: goalTemplates.id,
	area: goalTemplates.area,
	text: goalTemplates.text,
	steps: goalTemplates.steps,
	isDefault: goalTemplates.is_default,
	createdAt: goalTemplates.created_at
};
export function templateRows(tx: Tx, agencyId: string, area?: string) {
	return tx
		.select(templateFields)
		.from(goalTemplates)
		.where(
			and(eq(goalTemplates.agency_id, agencyId), area ? eq(goalTemplates.area, area) : undefined)
		)
		.orderBy(asc(goalTemplates.area), asc(goalTemplates.created_at), asc(goalTemplates.id))
		.limit(501);
}
export async function insertTemplate(tx: Tx, row: typeof goalTemplates.$inferInsert) {
	return (await tx.insert(goalTemplates).values(row).returning(templateFields))[0];
}
