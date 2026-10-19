import { and, eq, gte, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, auditLog, clients, goals } from '../../db/schema';

export async function personContext(tx: Tx, agencyId: string, clientId: string) {
	const [person] = await tx
		.select({ firstName: clients.first_name, name: clients.name })
		.from(clients)
		.where(
			and(eq(clients.agency_id, agencyId), eq(clients.id, clientId), eq(clients.active, true))
		);
	if (!person) return null;
	const activeGoals = await tx
		.select({ id: goals.id, text: goals.text, area: goals.area })
		.from(goals)
		.where(
			and(eq(goals.agency_id, agencyId), eq(goals.client_id, clientId), isNull(goals.stopped_at))
		);
	return { firstName: person.firstName || person.name.split(' ')[0], goals: activeGoals };
}

export async function invocationCounts(tx: Tx, agencyId: string) {
	// Serialize reservations per agency, so concurrent instances cannot all
	// pass the same hourly limit before their invocation rows are committed.
	await tx
		.select({ id: agencies.id })
		.from(agencies)
		.where(eq(agencies.id, agencyId))
		.for('update');
	return tx
		.select({ profileId: auditLog.performed_by, meta: auditLog.new_values })
		.from(auditLog)
		.where(
			and(
				eq(auditLog.agency_id, agencyId),
				eq(auditLog.table_name, 'ai_invocations'),
				gte(auditLog.created_at, new Date(Date.now() - 3600000))
			)
		);
}
export async function recordInvocation(tx: Tx, agencyId: string, profileId: string, task: string) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'ai_invocations',
		record_id: crypto.randomUUID(),
		action: 'INSERT',
		performed_by: profileId,
		new_values: { task }
	});
}
