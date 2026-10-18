import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	coverageCandidates as candidates,
	coverageRequests as requests,
	coverageSteps as steps,
	medications,
	profiles,
	scheduleSlots as slots
} from '../../db/schema';
import { addDays, weekStart } from '../../../domain/index.ts';
export type SlotKey = { homeId: string; day: string; shift: 'am' | 'pm' | 'on' };
export async function ensureSlot(tx: Tx, agencyId: string, key: SlotKey) {
	await tx
		.insert(slots)
		.values({ agency_id: agencyId, home_id: key.homeId, day: key.day, shift: key.shift })
		.onConflictDoNothing();
}
export async function hasStep(tx: Tx, agencyId: string, id: string, description: string) {
	return (
		await tx
			.select({ id: steps.id })
			.from(steps)
			.where(
				and(
					eq(steps.agency_id, agencyId),
					eq(steps.coverage_request_id, id),
					eq(steps.description, description)
				)
			)
	)[0];
}
const keyWhere = (agencyId: string, key: SlotKey) =>
	and(
		eq(slots.agency_id, agencyId),
		eq(slots.home_id, key.homeId),
		eq(slots.day, key.day),
		eq(slots.shift, key.shift)
	);
export async function lockSlot(tx: Tx, agencyId: string, key: SlotKey) {
	return (await tx.select().from(slots).where(keyWhere(agencyId, key)).for('update'))[0];
}
export async function requestById(tx: Tx, agencyId: string, id: string, lock = false) {
	const q = tx
		.select()
		.from(requests)
		.where(and(eq(requests.agency_id, agencyId), eq(requests.id, id)));
	return (await (lock ? q.for('update') : q))[0];
}
export async function openRequest(tx: Tx, agencyId: string, key: SlotKey) {
	return (
		await tx
			.select()
			.from(requests)
			.where(
				and(
					eq(requests.agency_id, agencyId),
					eq(requests.home_id, key.homeId),
					eq(requests.day, key.day),
					eq(requests.shift, key.shift),
					eq(requests.status, 'searching')
				)
			)
	)[0];
}
export async function createRequest(tx: Tx, row: typeof requests.$inferInsert) {
	return (await tx.insert(requests).values(row).returning())[0];
}
export async function setRequest(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<
		Pick<typeof requests.$inferInsert, 'status' | 'started_at' | 'filled_by' | 'filled_at'>
	>
) {
	return (
		await tx
			.update(requests)
			.set({ ...set, updated_at: new Date() })
			.where(and(eq(requests.agency_id, agencyId), eq(requests.id, id)))
			.returning()
	)[0];
}
export async function setCoverageSlot(
	tx: Tx,
	agencyId: string,
	key: SlotKey,
	profileId: string | null,
	status: 'open' | 'filled' | 'filling'
) {
	await tx
		.update(slots)
		.set({ assigned_to: profileId, status, via_lomi: status === 'filled', updated_at: new Date() })
		.where(keyWhere(agencyId, key));
}
export async function addStep(
	tx: Tx,
	agencyId: string,
	id: string,
	homeId: string,
	description: string
) {
	await tx
		.insert(steps)
		.values({ agency_id: agencyId, coverage_request_id: id, home_id: homeId, description });
}
export function candidateRows(tx: Tx, agencyId: string, id: string) {
	return tx
		.select()
		.from(candidates)
		.where(and(eq(candidates.agency_id, agencyId), eq(candidates.coverage_request_id, id)));
}
/** Everyone checked for a request, with their name, eligibility and reply. */
export function candidateDetail(tx: Tx, agencyId: string, id: string) {
	return tx
		.select({
			profileId: candidates.profile_id,
			name: profiles.name,
			eligible: candidates.eligible,
			reason: candidates.eligibility_reason,
			reply: candidates.reply,
			repliedAt: candidates.replied_at
		})
		.from(candidates)
		.innerJoin(
			profiles,
			and(eq(profiles.id, candidates.profile_id), eq(profiles.agency_id, candidates.agency_id))
		)
		.where(and(eq(candidates.agency_id, agencyId), eq(candidates.coverage_request_id, id)))
		.orderBy(desc(candidates.eligible), asc(profiles.name));
}
export async function addCandidates(tx: Tx, rows: (typeof candidates.$inferInsert)[]) {
	if (rows.length) await tx.insert(candidates).values(rows);
}
export async function replyCandidate(
	tx: Tx,
	agencyId: string,
	id: string,
	profileId: string,
	reply: 'accepted' | 'declined'
) {
	return (
		await tx
			.update(candidates)
			.set({ reply, replied_at: new Date(), updated_at: new Date() })
			.where(
				and(
					eq(candidates.agency_id, agencyId),
					eq(candidates.coverage_request_id, id),
					eq(candidates.profile_id, profileId),
					eq(candidates.reply, 'pending')
				)
			)
			.returning()
	)[0];
}
export async function eligibilityData(tx: Tx, agencyId: string, key: SlotKey) {
	const staff = await tx
		.select({
			id: profiles.id,
			home_ids: profiles.home_ids,
			med_certified: profiles.med_certified,
			active: profiles.active
		})
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.role, 'caregiver')));
	const week = weekStart(key.day);
	const scheduled = await tx
		.select({ profileId: slots.assigned_to, day: slots.day })
		.from(slots)
		.where(
			and(eq(slots.agency_id, agencyId), gte(slots.day, week), lte(slots.day, addDays(week, 6)))
		);
	const meds = await tx
		.select({ times: medications.scheduled_times })
		.from(medications)
		.where(
			and(
				eq(medications.agency_id, agencyId),
				eq(medications.home_id, key.homeId),
				or(
					isNull(medications.stopped_at),
					gte(medications.stopped_at, new Date(key.day + 'T00:00:00Z'))
				)
			)
		);
	return {
		staff: staff.map((p) => ({ ...p, home_ids: p.home_ids ?? [] })),
		scheduled,
		doseTimes: meds.flatMap((m) => m.times ?? [])
	};
}
export function offeredRequests(tx: Tx, agencyId: string, profileId: string) {
	return tx
		.select({ id: requests.id, homeId: requests.home_id, day: requests.day, shift: requests.shift })
		.from(requests)
		.innerJoin(
			candidates,
			and(
				eq(candidates.agency_id, agencyId),
				eq(candidates.coverage_request_id, requests.id),
				eq(candidates.profile_id, profileId),
				eq(candidates.eligible, true),
				eq(candidates.reply, 'pending')
			)
		)
		.where(and(eq(requests.agency_id, agencyId), eq(requests.status, 'searching')));
}
export function searchingRequests(tx: Tx) {
	return tx
		.select({ id: requests.id, agencyId: requests.agency_id, startedAt: requests.started_at })
		.from(requests)
		.where(eq(requests.status, 'searching'))
		.limit(500);
}
