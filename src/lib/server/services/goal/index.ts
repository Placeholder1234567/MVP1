import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import {
	goalRows,
	insertGoal,
	insertTemplate,
	lockedGoal,
	templateRows,
	updateGoalRow,
	visibleGoalClient
} from './goal.queries';

const definition = {
	area: z.string().trim().min(1).max(120),
	text: z.string().trim().min(1).max(2000),
	steps: z.array(z.string().trim().min(1).max(1000)).max(30).optional(),
	frequency: z.string().trim().max(200).optional(),
	target: z.string().trim().max(500).optional()
};
export const NewGoal = z.strictObject({
	clientId: z.uuid(),
	...definition,
	startedAt: z.coerce.date().optional()
});
export const GoalChanges = z
	.strictObject({
		id: z.uuid(),
		area: definition.area.optional(),
		text: definition.text.optional(),
		steps: definition.steps,
		frequency: definition.frequency,
		target: definition.target
	})
	.refine(
		(v) => Object.keys(v).some((k) => k !== 'id' && v[k as keyof typeof v] !== undefined),
		'Provide a goal change'
	);
export const GoalFilter = z.strictObject({
	clientId: z.uuid(),
	includeStopped: z.boolean().default(false)
});
export const NewGoalTemplate = z.strictObject({
	area: definition.area,
	text: definition.text,
	steps: definition.steps
});
export const TemplateFilter = z.strictObject({ area: definition.area.optional() });

function allowed(user: CurrentUser, agencyId: string, write: boolean) {
	if (
		user.agencyId !== agencyId ||
		!user.features.includes('goals') ||
		(write && user.role === 'caregiver')
	)
		throw new ServiceError('FORBIDDEN', 'Goal access is unavailable for your role or agency plan');
}
export async function createGoal(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewGoal>
) {
	allowed(user, agencyId, true);
	const p = NewGoal.parse(input);
	const client = await visibleGoalClient(tx, agencyId, p.clientId, true);
	if (!client?.active) throw new ServiceError('NOT_FOUND', 'Active person not found');
	return insertGoal(tx, {
		agency_id: agencyId,
		client_id: p.clientId,
		area: p.area,
		text: p.text,
		steps: p.steps ?? [],
		frequency: p.frequency || null,
		target: p.target || null,
		started_at: p.startedAt ?? new Date()
	});
}
export async function updateGoal(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof GoalChanges>
) {
	allowed(user, agencyId, true);
	const p = GoalChanges.parse(input);
	const row = await lockedGoal(tx, agencyId, p.id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Goal not found');
	if (row.stoppedAt) throw new ServiceError('RULE_VIOLATION', 'Stopped goals cannot be changed');
	return updateGoalRow(tx, agencyId, p.id, {
		...(p.area !== undefined ? { area: p.area } : {}),
		...(p.text !== undefined ? { text: p.text } : {}),
		...(p.steps !== undefined ? { steps: p.steps } : {}),
		...(p.frequency !== undefined ? { frequency: p.frequency || null } : {}),
		...(p.target !== undefined ? { target: p.target || null } : {})
	});
}
export async function stopGoal(tx: Tx, agencyId: string, user: CurrentUser, id: string) {
	allowed(user, agencyId, true);
	const row = await lockedGoal(tx, agencyId, z.uuid().parse(id));
	if (!row) throw new ServiceError('NOT_FOUND', 'Goal not found');
	if (row.stoppedAt) return { id: row.id, stoppedAt: row.stoppedAt, updatedAt: row.updatedAt };
	const stopped = await updateGoalRow(tx, agencyId, id, { stopped_at: new Date() });
	return { id: stopped.id, stoppedAt: stopped.stoppedAt, updatedAt: stopped.updatedAt };
}
export async function listGoals(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof GoalFilter>
) {
	allowed(user, agencyId, false);
	const p = GoalFilter.parse(input);
	if (!(await visibleGoalClient(tx, agencyId, p.clientId)))
		throw new ServiceError('NOT_FOUND', 'Person not found');
	const rows = await goalRows(tx, agencyId, p.clientId, p.includeStopped);
	if (rows.length > 500)
		throw new ServiceError('VALIDATION_FAILED', 'Too many goals for this person');
	return rows;
}
export async function listGoalTemplates(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof TemplateFilter> = {}
) {
	allowed(user, agencyId, true);
	const p = TemplateFilter.parse(input);
	const rows = await templateRows(tx, agencyId, p.area);
	if (rows.length > 500)
		throw new ServiceError('VALIDATION_FAILED', 'Too many templates. Choose an area');
	return rows;
}
export async function createGoalTemplate(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewGoalTemplate>
) {
	allowed(user, agencyId, true);
	const p = NewGoalTemplate.parse(input);
	return insertTemplate(tx, {
		agency_id: agencyId,
		area: p.area,
		text: p.text,
		steps: p.steps ?? [],
		is_default: false
	});
}
