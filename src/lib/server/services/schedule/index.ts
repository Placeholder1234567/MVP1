import {
	addDays,
	parseTemplateSlots,
	planWeekCopy,
	shiftAt,
	shiftIsPast,
	suggestShifts,
	checkPicks,
	templateFromWeek,
	templateToWeek,
	TEMPLATE_NAME_MAX,
	TEMPLATES_PER_HOME_MAX,
	type CopySkip,
	type WeekSlot
} from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import {
	conflictingSlot,
	homeTemplates,
	removeTemplate,
	saveSlot,
	scheduleHome,
	scheduleStaff,
	staffShifts,
	templateById,
	upsertTemplate,
	weekSlots
} from './schedule.queries';
import { settleCoverage } from './coverage';
import { eligibilityData, requestById } from './coverage.queries';
export {
	startCoverage,
	searchCoverage,
	respondCoverage,
	coverageOffers,
	coverageDetail,
	coverageTimer,
	sweepCoverage
} from './coverage';

export async function getSchedule(tx: Tx, agencyId: string, homeId: string, weekStart: string) {
	if (!(await scheduleHome(tx, agencyId, homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	return { slots: await weekSlots(tx, agencyId, homeId, weekStart, addDays(weekStart, 6)) };
}
export const myShifts = (
	tx: Tx,
	agencyId: string,
	profileId: string,
	from: string,
	weeks: number
) => staffShifts(tx, agencyId, profileId, from, addDays(from, weeks * 7 - 1));
export async function setScheduleSlot(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; day: string; shift: 'am' | 'pm' | 'on'; profileId: string | null }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (!(await scheduleHome(tx, user.agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	if (input.profileId) {
		const staff = await asService(tx, (t) => scheduleStaff(t, user.agencyId, input.profileId!));
		if (!staff?.active || !staff.home_ids?.includes(input.homeId))
			throw new ServiceError(
				'VALIDATION_FAILED',
				'Choose an active staff member trained at this home'
			);
		if (
			await conflictingSlot(
				tx,
				user.agencyId,
				input.profileId,
				input.homeId,
				input.day,
				input.shift
			)
		)
			throw new ServiceError(
				'RULE_VIOLATION',
				'This staff member is already assigned to another home for that shift'
			);
	}
	const row = await saveSlot(tx, user.agencyId, input);
	await settleCoverage(tx, user.agencyId, input, input.profileId);
	return row;
}

/**
 * Copies one week's assignments into another week at the same home
 * (schedule.copyWeek). Only open slots are filled; each copy is checked like
 * a manual assignment, so someone no longer active, trained here or free
 * that shift is skipped instead of failing the whole week.
 */
export async function copyScheduleWeek(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; fromWeek: string; toWeek: string }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	const apart = (Date.parse(input.toWeek) - Date.parse(input.fromWeek)) / 86_400_000;
	if (!apart || apart % 7 !== 0)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Copy from a different week, starting on the same weekday'
		);
	if (!(await scheduleHome(tx, user.agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	const source = await weekOf(tx, user.agencyId, input.homeId, input.fromWeek);
	return fillOpenSlots(tx, user, input.homeId, source, input.fromWeek, input.toWeek);
}

function weekOf(tx: Tx, agencyId: string, homeId: string, start: string): Promise<WeekSlot[]> {
	return weekSlots(tx, agencyId, homeId, start, addDays(start, 6)).then((rows) =>
		rows.map((r) => ({ day: r.day, shift: r.shift, assignedTo: r.assigned_to, status: r.status }))
	);
}

/**
 * Fills the open slots of the week starting toWeek from source (a week's
 * slots starting fromWeek). Each copy is checked like a manual assignment.
 */
async function fillOpenSlots(
	tx: Tx,
	user: CurrentUser,
	homeId: string,
	source: WeekSlot[],
	fromWeek: string,
	toWeek: string
) {
	const now = new Date();
	const plan = planWeekCopy(
		source,
		await weekOf(tx, user.agencyId, homeId, toWeek),
		fromWeek,
		toWeek,
		(day, shift) =>
			shiftIsPast(day, shift, now, user.timeZone) || startedNow(day, shift, now, user.timeZone)
	);
	const skipped: { day: string; shift: 'am' | 'pm' | 'on'; reason: CopySkip | 'unavailable' }[] = [
		...plan.skipped
	];
	let copied = 0;
	for (const slot of plan.copy) {
		try {
			// A savepoint per slot: one unavailable person doesn't undo the rest.
			await tx.transaction((sp) => setScheduleSlot(sp, user, { homeId, ...slot }));
			copied++;
		} catch (e) {
			if (!(e instanceof ServiceError)) throw e;
			skipped.push({ day: slot.day, shift: slot.shift, reason: 'unavailable' });
		}
	}
	return { copied, skipped };
}

async function managedHome(tx: Tx, user: CurrentUser, homeId: string) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (!(await scheduleHome(tx, user.agencyId, homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
}

/**
 * Suggested staff for the week's open shifts (frontend-audit.md finding 17,
 * fix 2), with the coverage eligibility checks. Nothing is assigned here.
 */
export async function suggestScheduleWeek(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; weekStart: string }
) {
	await managedHome(tx, user, input.homeId);
	const now = new Date();
	const slots = await weekOf(tx, user.agencyId, input.homeId, input.weekStart);
	const data = await eligibilityData(tx, user.agencyId, {
		homeId: input.homeId,
		day: input.weekStart,
		shift: 'am'
	});
	const open = [];
	for (let d = 0; d < 7; d++) {
		const day = addDays(input.weekStart, d);
		for (const shift of ['am', 'pm', 'on'] as const) {
			const slot = slots.find((x) => x.day === day && x.shift === shift);
			if (slot?.assignedTo || slot?.status === 'filling') continue;
			if (shiftIsPast(day, shift, now, user.timeZone) || startedNow(day, shift, now, user.timeZone))
				continue;
			open.push({ day, shift, doseTimes: data.doseTimes });
		}
	}
	return suggestShifts(open, data.staff, data.scheduled, input.homeId);
}

/** Applies the suggestions a supervisor kept, with the same checks as copying a week. */
export async function applyScheduleSuggestions(
	tx: Tx,
	user: CurrentUser,
	input: {
		homeId: string;
		weekStart: string;
		picks: { day: string; shift: 'am' | 'pm' | 'on'; profileId: string }[];
	}
) {
	await managedHome(tx, user, input.homeId);
	const last = addDays(input.weekStart, 6);
	if (input.picks.some((p) => p.day < input.weekStart || p.day > last))
		throw new ServiceError('VALIDATION_FAILED', 'Suggestions must be for the week shown');
	// The week may have changed since the suggestion. Shifts taken, being
	// covered or started since are skipped with their reason first; only the
	// rest are checked again, so a pick that won't be applied never counts
	// toward someone's day or week.
	const now = new Date();
	const plan = planWeekCopy(
		input.picks.map((p) => ({
			day: p.day,
			shift: p.shift,
			assignedTo: p.profileId,
			status: 'filled'
		})),
		await weekOf(tx, user.agencyId, input.homeId, input.weekStart),
		input.weekStart,
		input.weekStart,
		(day, shift) =>
			shiftIsPast(day, shift, now, user.timeZone) || startedNow(day, shift, now, user.timeZone)
	);
	const data = await eligibilityData(tx, user.agencyId, {
		homeId: input.homeId,
		day: input.weekStart,
		shift: 'am'
	});
	const { ok, refused } = checkPicks(
		plan.copy,
		data.staff,
		data.scheduled,
		input.homeId,
		data.doseTimes
	);
	const result = await fillOpenSlots(
		tx,
		user,
		input.homeId,
		ok.map((p) => ({ day: p.day, shift: p.shift, assignedTo: p.profileId, status: 'filled' })),
		input.weekStart,
		input.weekStart
	);
	return {
		copied: result.copied,
		skipped: [
			...plan.skipped,
			...result.skipped,
			...refused.map((p) => ({ day: p.day, shift: p.shift, reason: 'unavailable' as const }))
		]
	};
}

/** The home's saved weeks (frontend-audit.md finding 17), by name. */
export async function listScheduleTemplates(tx: Tx, user: CurrentUser, homeId: string) {
	await managedHome(tx, user, homeId);
	const rows = await homeTemplates(tx, user.agencyId, homeId);
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		shifts: parseTemplateSlots(r.slots).length,
		updatedAt: r.updatedAt
	}));
}

/** Saves a week's assignments as a template; the same name at this home is replaced. */
export async function saveScheduleTemplate(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; name: string; fromWeek: string }
) {
	await managedHome(tx, user, input.homeId);
	const name = input.name.trim().slice(0, TEMPLATE_NAME_MAX);
	if (!name) throw new ServiceError('VALIDATION_FAILED', 'Give the template a name');
	const slots = templateFromWeek(
		await weekOf(tx, user.agencyId, input.homeId, input.fromWeek),
		input.fromWeek
	);
	if (!slots.length)
		throw new ServiceError('VALIDATION_FAILED', 'That week has no assignments to save');
	const existing = await homeTemplates(tx, user.agencyId, input.homeId);
	if (!existing.some((t) => t.name === name) && existing.length >= TEMPLATES_PER_HOME_MAX)
		throw new ServiceError(
			'VALIDATION_FAILED',
			`A home can keep up to ${TEMPLATES_PER_HOME_MAX} templates. Delete one first.`
		);
	const saved = await upsertTemplate(tx, {
		agency_id: user.agencyId,
		home_id: input.homeId,
		name,
		slots,
		created_by: user.profileId
	});
	return { ...saved, shifts: slots.length };
}

/** Fills a week's open slots from a template, like copying a week. */
export async function applyScheduleTemplate(
	tx: Tx,
	user: CurrentUser,
	input: { id: string; toWeek: string }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	const template = await templateById(tx, user.agencyId, input.id);
	if (!template) throw new ServiceError('NOT_FOUND', 'Template not found');
	const source = templateToWeek(parseTemplateSlots(template.slots), input.toWeek);
	return fillOpenSlots(tx, user, template.home_id, source, input.toWeek, input.toWeek);
}

export async function deleteScheduleTemplate(tx: Tx, user: CurrentUser, id: string) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (!(await removeTemplate(tx, user.agencyId, id)))
		throw new ServiceError('NOT_FOUND', 'Template not found');
	return { deleted: true };
}

/** The shift running right now has started; copying into it would rewrite who is on. */
function startedNow(day: string, shift: 'am' | 'pm' | 'on', now: Date, timeZone: string) {
	const current = shiftAt(now, timeZone);
	return current.day === day && current.shift === shift;
}

/** A coverage request's status (for replies that arrive after it closed). */
export async function coverageStatus(tx: Tx, agencyId: string, id: string) {
	return (await requestById(tx, agencyId, id))?.status ?? null;
}
