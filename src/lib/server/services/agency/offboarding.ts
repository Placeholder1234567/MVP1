import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withService } from '../../db';
import { disableIdentity } from '../../identity';
import { ServiceError } from '../../errors';
import * as q from './offboarding.queries';

const LEASE_MS = 15 * 60_000;
export const OffboardingInput = z
	.object({
		agencyId: z.uuid(),
		operator: z.string().trim().min(3).max(254),
		confirmAgencyId: z.uuid().optional()
	})
	.strict();
const State = z.object({
	operationId: z.uuid(),
	accessBlocked: z.literal(true),
	retentionHold: z.literal(true),
	phase: z.enum(['identity_pending', 'complete']),
	initiatedAt: z.iso.datetime(),
	runToken: z.uuid().nullable(),
	leaseUntil: z.iso.datetime().nullable(),
	identityFailures: z.number().int().nonnegative()
});
function settings(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
/** Operator orchestration only: no tRPC/API exposure. Dry run never calls identity. */
export async function offboardAgency(
	input: z.input<typeof OffboardingInput>,
	{ dryRun = true } = {}
) {
	const change = OffboardingInput.parse(input);
	if (!dryRun && change.confirmAgencyId !== change.agencyId)
		throw new ServiceError('RULE_VIOLATION', 'Confirm the exact agency ID before blocking access');
	const prepared = await withService(async (tx) => {
		const agency = await q.lockOffboardingAgency(tx, change.agencyId);
		if (!agency) throw new ServiceError('NOT_FOUND', 'Agency not found');
		const current = settings(agency.settings),
			parsed = State.safeParse(current.offboarding);
		if (current.offboarding !== undefined && !parsed.success)
			throw new ServiceError('RULE_VIOLATION', 'Offboarding state needs operator review');
		const counts = await q.offboardingCounts(tx, agency.id);
		if (dryRun)
			return {
				dryRun: true as const,
				agencyId: agency.id,
				counts,
				state: parsed.success ? parsed.data : null,
				identities: []
			};
		const previous = parsed.success ? parsed.data : null;
		if (previous?.phase === 'complete')
			return {
				dryRun: false as const,
				agencyId: agency.id,
				counts,
				state: previous,
				identities: []
			};
		if (previous?.leaseUntil && new Date(previous.leaseUntil).getTime() > Date.now())
			throw new ServiceError('RULE_VIOLATION', 'Offboarding is already in progress');
		const state: z.infer<typeof State> = {
			operationId: previous?.operationId ?? randomUUID(),
			accessBlocked: true,
			retentionHold: true,
			phase: 'identity_pending',
			initiatedAt: previous?.initiatedAt ?? new Date().toISOString(),
			runToken: randomUUID(),
			leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
			identityFailures: previous?.identityFailures ?? 0
		};
		await q.saveOffboarding(tx, agency.id, current, state, change.operator);
		await q.blockAgencyAccess(tx, agency.id);
		return {
			dryRun: false as const,
			agencyId: agency.id,
			counts,
			state,
			identities: await q.offboardingIdentities(tx, agency.id)
		};
	});
	if (prepared.dryRun || prepared.state?.phase === 'complete')
		return {
			agencyId: prepared.agencyId,
			dryRun: prepared.dryRun,
			counts: prepared.counts,
			phase: prepared.state?.phase ?? 'not_started',
			operationId: prepared.state?.operationId ?? null,
			identityFailures: prepared.state?.identityFailures ?? 0
		};
	const claim = prepared.state!;
	let failures = 0;
	for (const person of prepared.identities) {
		// Renew ownership at safe boundaries; a crashed run can be resumed after expiry.
		await withService(async (tx) => {
			const row = await q.lockOffboardingAgency(tx, prepared.agencyId);
			const current = settings(row?.settings),
				state = State.parse(current.offboarding);
			if (state.runToken !== claim.runToken)
				throw new ServiceError('RULE_VIOLATION', 'Offboarding ownership changed');
			await q.saveOffboarding(
				tx,
				prepared.agencyId,
				current,
				{ ...state, leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() },
				change.operator
			);
		});
		try {
			await disableIdentity(person.uid);
		} catch (error) {
			if ((error as { code?: string }).code !== 'auth/user-not-found') failures++;
		}
	}
	await withService(async (tx) => {
		const row = await q.lockOffboardingAgency(tx, prepared.agencyId);
		const current = settings(row?.settings),
			state = State.parse(current.offboarding);
		if (state.runToken !== claim.runToken)
			throw new ServiceError('RULE_VIOLATION', 'Offboarding ownership changed');
		await q.saveOffboarding(
			tx,
			prepared.agencyId,
			current,
			{
				...state,
				phase: failures ? 'identity_pending' : 'complete',
				runToken: null,
				leaseUntil: null,
				identityFailures: failures
			},
			change.operator
		);
	});
	return {
		agencyId: prepared.agencyId,
		dryRun: false,
		counts: prepared.counts,
		operationId: claim.operationId,
		phase: failures ? 'identity_pending' : 'complete',
		identityFailures: failures
	};
}
