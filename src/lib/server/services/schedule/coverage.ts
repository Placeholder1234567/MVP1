import { afterCommit, asService, withService, type Tx } from '../../db';
import {
	coverageBoardText,
	eligibility,
	shiftsInWeek,
	workingAround,
	shiftIsPast,
	type CoverageBoardEvent,
	type ShiftKey
} from '../../../domain/index.ts';
import { ServiceError } from '../../errors';
import { forEachIsolated } from '../../jobs/isolate.ts';
import { cancel, enqueue } from '../../jobs/queue.ts';
import type { CurrentUser } from '../auth/index.ts';
import { requireOpenHome } from '../home/index.ts';
import { postLomiUpdate } from '../message/index.ts';
import { notify, notifyHomeSupervisors } from '../notification/index.ts';
import { scheduleHome, scheduleStaff } from './schedule.queries';
import * as q from './coverage.queries';
const keyOf = (r: { home_id: string; day: string; shift: ShiftKey }) => ({
	homeId: r.home_id,
	day: r.day,
	shift: r.shift
});
/** Lomi's update on the home's board (US-37). */
const announce = (
	tx: Tx,
	agencyId: string,
	row: { home_id: string; day: string; shift: ShiftKey },
	event: CoverageBoardEvent
) => postLomiUpdate(tx, agencyId, row.home_id, coverageBoardText(row.day, row.shift, event));
const timeouts = (id: string) =>
	afterCommit(async () => {
		await cancel('coverage-timeout', `${id}-timeout`);
		await cancel('coverage-reminder', `${id}-reminder`);
	});
async function checks(tx: Tx, agencyId: string, key: q.SlotKey, excludeId?: string | null) {
	const d = await q.eligibilityData(tx, agencyId, key);
	return eligibility(d.staff, {
		homeId: key.homeId,
		shift: key.shift,
		excludeId,
		doseTimes: d.doseTimes,
		workingThatDay: workingAround(d.scheduled, key.day, key.shift),
		weeklyShifts: shiftsInWeek(d.scheduled, key.day)
	});
}
export async function startCoverage(
	tx: Tx,
	user: CurrentUser,
	input: q.SlotKey & { reason?: string },
	posted = false
) {
	if (shiftIsPast(input.day, input.shift, new Date(), user.timeZone))
		throw new ServiceError('VALIDATION_FAILED', 'Choose a current or upcoming shift');
	requireOpenHome(await scheduleHome(tx, user.agencyId, input.homeId));
	if (posted && user.role === 'caregiver')
		throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	return asService(tx, async (t) => {
		let slot = await q.lockSlot(t, user.agencyId, input);
		if (!slot && posted) {
			await q.ensureSlot(t, user.agencyId, input);
			slot = await q.lockSlot(t, user.agencyId, input);
		}
		if (!slot || (!posted && slot.assigned_to !== user.profileId))
			throw new ServiceError('FORBIDDEN', 'Only the assigned staff member can call out');
		if (posted && slot.assigned_to)
			throw new ServiceError(
				'RULE_VIOLATION',
				'Clear the existing assignment before posting an open shift'
			);
		const existing = await q.openRequest(t, user.agencyId, input);
		if (existing) return existing;
		const row = await q.createRequest(t, {
			agency_id: user.agencyId,
			home_id: input.homeId,
			day: input.day,
			shift: input.shift,
			called_out_by: posted ? null : user.profileId,
			reason: input.reason,
			created_by: user.profileId
		});
		await q.setCoverageSlot(t, user.agencyId, input, null, 'filling');
		await q.addStep(t, user.agencyId, row.id, input.homeId, 'Coverage requested');
		afterCommit(() =>
			enqueue('coverage-search', { agencyId: user.agencyId, id: row.id }, { taskName: row.id })
		);
		return row;
	});
}
export async function searchCoverage(input: { agencyId: string; id: string }) {
	return withService(async (tx) => {
		const initial = await q.requestById(tx, input.agencyId, input.id);
		if (!initial) return;
		const key = keyOf(initial);
		await q.lockSlot(tx, input.agencyId, key);
		const row = await q.requestById(tx, input.agencyId, input.id, true);
		if (row.status !== 'searching' || row.started_at) return;
		const candidates = await checks(tx, input.agencyId, key, row.called_out_by);
		await q.addCandidates(
			tx,
			candidates.map((c) => ({
				agency_id: input.agencyId,
				coverage_request_id: row.id,
				profile_id: c.id,
				eligible: c.eligible,
				eligibility_reason: c.reason
			}))
		);
		const eligible = candidates.filter((c) => c.eligible);
		await q.setRequest(tx, input.agencyId, row.id, { started_at: new Date() });
		await announce(tx, input.agencyId, row, {
			kind: 'offered',
			calledOutName: row.called_out_by
				? await q.profileName(tx, input.agencyId, row.called_out_by)
				: null,
			eligible: eligible.length
		});
		await q.addStep(
			tx,
			input.agencyId,
			row.id,
			row.home_id,
			`Offered to ${eligible.length} eligible staff`
		);
		if (!eligible.length) {
			// The offer post already said a supervisor will fill it.
			await unfilled(tx, input.agencyId, row, false);
			return;
		}
		await notify(
			tx,
			input.agencyId,
			eligible.map((c) => ({ id: c.id, role: 'caregiver' as const })),
			{
				type: 'coverage_offer',
				priority: 2,
				title: `Shift available · ${row.day} ${row.shift.toUpperCase()}`,
				referenceId: row.id,
				referenceType: 'coverage_requests'
			}
		);
		afterCommit(async () => {
			await enqueue('coverage-reminder', input, {
				delaySeconds: 900,
				taskName: `${row.id}-reminder`
			});
			await enqueue('coverage-timeout', input, {
				delaySeconds: 3600,
				taskName: `${row.id}-timeout`
			});
		});
	});
}
async function unfilled(
	tx: Tx,
	agencyId: string,
	row: NonNullable<Awaited<ReturnType<typeof q.requestById>>>,
	post = true
) {
	await q.setRequest(tx, agencyId, row.id, { status: 'unfilled' });
	if (post) await announce(tx, agencyId, row, { kind: 'unfilled' });
	await q.setCoverageSlot(tx, agencyId, keyOf(row), null, 'open');
	await q.addStep(tx, agencyId, row.id, row.home_id, 'Supervisor follow-up required');
	await notifyHomeSupervisors(tx, agencyId, row.home_id, {
		type: 'coverage_unfilled',
		priority: 2,
		title: 'An open shift needs your attention',
		referenceId: row.id,
		referenceType: 'coverage_requests'
	});
	timeouts(row.id);
}
export async function respondCoverage(
	tx: Tx,
	user: CurrentUser,
	id: string,
	reply: 'accepted' | 'declined'
) {
	const visible = await q.requestById(tx, user.agencyId, id);
	if (!visible) throw new ServiceError('NOT_FOUND', 'Coverage request not found');
	return asService(tx, async (t) => {
		if (reply === 'accepted') await scheduleStaff(t, user.agencyId, user.profileId);
		const key = keyOf(visible);
		const slot = await q.lockSlot(t, user.agencyId, key);
		const row = await q.requestById(t, user.agencyId, id, true);
		if (row.status !== 'searching' || slot?.status !== 'filling')
			throw new ServiceError('RULE_VIOLATION', 'This shift offer is closed');
		const candidates = await q.candidateRows(t, user.agencyId, id);
		const candidate = candidates.find(
			(c) => c.profile_id === user.profileId && c.eligible && c.reply === 'pending'
		);
		if (!candidate) throw new ServiceError('FORBIDDEN', 'This shift was not offered to you');
		if (
			reply === 'accepted' &&
			!(await checks(t, user.agencyId, key, row.called_out_by)).some(
				(c) => c.id === user.profileId && c.eligible
			)
		)
			throw new ServiceError(
				'RULE_VIOLATION',
				'Your availability or eligibility changed. Contact your supervisor.'
			);
		await q.replyCandidate(t, user.agencyId, id, user.profileId, reply);
		await q.addStep(
			t,
			user.agencyId,
			id,
			row.home_id,
			reply === 'accepted' ? 'An eligible staff member accepted' : 'A staff member declined'
		);
		if (reply === 'accepted') {
			await q.setCoverageSlot(t, user.agencyId, key, user.profileId, 'filled');
			await q.setRequest(t, user.agencyId, id, {
				status: 'filled',
				filled_by: user.profileId,
				filled_at: new Date()
			});
			timeouts(id);
			await announce(t, user.agencyId, row, { kind: 'covered', filledName: user.name });
			await notifyHomeSupervisors(t, user.agencyId, row.home_id, {
				type: 'coverage_accepted',
				priority: 2,
				title: 'An open shift has been covered',
				referenceId: id,
				referenceType: 'coverage_requests'
			});
		} else if (
			!candidates.some((c) => c.id !== candidate.id && c.eligible && c.reply === 'pending')
		)
			await unfilled(t, user.agencyId, row);
		return { id, status: reply === 'accepted' ? ('filled' as const) : ('declined' as const) };
	});
}
/**
 * Who a coverage request was offered to, why others weren't, and each reply
 * (coverage.get, US-21). Candidates are never synced to devices, so the
 * activity log loads them online. The request lookup runs under the caller's
 * RLS, so supervisors only see requests for homes they can see.
 */
export async function coverageDetail(tx: Tx, user: CurrentUser, id: string) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	const row = await q.requestById(tx, user.agencyId, id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Coverage request not found');
	const candidates = await q.candidateDetail(tx, user.agencyId, id);
	return { id: row.id, status: row.status, candidates };
}
export const coverageOffers = (tx: Tx, user: CurrentUser) =>
	q.offeredRequests(tx, user.agencyId, user.profileId);
export async function coverageTimer(input: { agencyId: string; id: string }, reminder = false) {
	await withService(async (tx) => {
		const initial = await q.requestById(tx, input.agencyId, input.id);
		if (!initial) return;
		await q.lockSlot(tx, input.agencyId, keyOf(initial));
		const row = await q.requestById(tx, input.agencyId, input.id, true);
		if (row.status !== 'searching') return;
		if (!reminder) {
			await unfilled(tx, input.agencyId, row);
			return;
		}
		if (await q.hasStep(tx, input.agencyId, row.id, 'Offer reminder sent')) return;
		await q.addStep(tx, input.agencyId, row.id, row.home_id, 'Offer reminder sent');
		const recipients = (await q.candidateRows(tx, input.agencyId, row.id)).filter(
			(c) => c.eligible && c.reply === 'pending'
		);
		await notify(
			tx,
			input.agencyId,
			recipients.map((c) => ({ id: c.profile_id, role: 'caregiver' as const })),
			{
				type: 'coverage_offer',
				priority: 2,
				title: 'Reminder: a shift offer is waiting',
				referenceId: row.id,
				referenceType: 'coverage_requests'
			}
		);
	});
}
export async function sweepCoverage() {
	const pending = await withService(q.searchingRequests);
	await forEachIsolated(
		'coverage request',
		pending,
		(row) => row.id,
		async (row) => {
			if (!row.startedAt) await enqueue('coverage-search', { agencyId: row.agencyId, id: row.id });
			else if (Date.now() - row.startedAt.getTime() > 3600000)
				await coverageTimer({ agencyId: row.agencyId, id: row.id });
		}
	);
	return { checked: pending.length };
}
export async function settleCoverage(
	tx: Tx,
	agencyId: string,
	key: q.SlotKey,
	profileId: string | null
) {
	const row = await q.openRequest(tx, agencyId, key);
	if (!row) return;
	await q.setRequest(tx, agencyId, row.id, {
		status: profileId ? 'filled' : 'unfilled',
		filled_by: profileId,
		filled_at: profileId ? new Date() : null
	});
	await q.addStep(tx, agencyId, row.id, key.homeId, 'Schedule updated by supervisor');
	timeouts(row.id);
}
