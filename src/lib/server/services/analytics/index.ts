// Analytics (frontend-spec-3.md §4.4; trpc-router.md `analytics.*`): weekly
// coverage, documentation and care measures for supervisors on the Complete
// plan. Read-only aggregates over the last few weeks; person first names and
// goal wording appear only in goal progress, inside the signed-in app.
import { z } from 'zod';
import {
	countByWeek,
	lastWeeks,
	percent,
	weekOf,
	weeklyDoseCompliance,
	weeklyNoteCompleteness
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import {
	assignedSlotsSince,
	coverageSince,
	dosesSince,
	goalTrialsSince,
	incidentsSince,
	noteEventsSince,
	scheduledMeds,
	signedNotesSince
} from './analytics.queries';

export const WeeklyInput = z.object({
	homeId: z.uuid().optional(),
	weeks: z.number().int().min(1).max(12).default(4)
});

const average = (values: number[]) =>
	values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

export async function weeklyAnalytics(
	tx: Tx,
	agencyId: string,
	timeZone: string,
	input: z.input<typeof WeeklyInput>,
	now = new Date()
) {
	const { homeId, weeks: n } = WeeklyInput.parse(input);
	const weeks = lastWeeks(now, timeZone, n);
	// A day early, so the first local Monday is fully covered in any time zone.
	const since = new Date(`${weeks[0]}T00:00:00Z`);
	since.setUTCDate(since.getUTCDate() - 1);
	const inWeek = (w: string) => (at: Date | string) => weekOf(at, timeZone) === w;

	const coverage = await coverageSince(tx, agencyId, since, homeId);
	const events = await noteEventsSince(tx, agencyId, since, homeId);
	const doses = await dosesSince(tx, agencyId, weeks[0], homeId);
	const incidentRows = await incidentsSince(tx, agencyId, since, homeId);
	const trials = await goalTrialsSince(tx, agencyId, since, homeId);
	const meds = await scheduledMeds(tx, agencyId, homeId);
	const slots = await assignedSlotsSince(tx, agencyId, weeks[0], homeId);
	const shiftNotes = await signedNotesSince(tx, agencyId, weeks[0], homeId);

	const signed = events.filter(
		(e) => e.action === 'signed' || e.action === 'amended and resubmitted'
	);
	// Hours from signing to approval, for notes approved in the week.
	const signedAt = new Map<string, Date>();
	for (const e of signed) signedAt.set(e.noteId, e.at);

	const coverageByWeek = weeks.map((w) => coverage.filter((c) => inWeek(w)(c.createdAt)));
	const signedByWeek = weeks.map((w) => signed.filter((e) => inWeek(w)(e.at)));
	const approvedByWeek = weeks.map((w) =>
		events.filter((e) => e.action === 'approved' && inWeek(w)(e.at))
	);

	// Goal progress: share of trials done independently, per goal.
	const goals = new Map<
		string,
		{ person: string; text: string; trials: number; independent: number }
	>();
	for (const row of trials) {
		const g = goals.get(row.goalId) ?? {
			person: row.firstName ?? row.name.split(/\s+/)[0],
			text: row.goalText,
			trials: 0,
			independent: 0
		};
		for (const t of row.trials ?? []) {
			g.trials++;
			if (t === 'Independent') g.independent++;
		}
		goals.set(row.goalId, g);
	}

	return {
		weeks,
		coverage: {
			needingCover: coverageByWeek.map((c) => c.length),
			fillRate: coverageByWeek.map((c) =>
				percent(c.filter((r) => r.status === 'filled').length, c.length)
			),
			avgFillMinutes: coverageByWeek.map((c) =>
				average(
					c
						.filter((r) => r.filledAt)
						.map((r) => (r.filledAt!.getTime() - r.createdAt.getTime()) / 60_000)
				)
			)
		},
		documentation: {
			completeness: weeklyNoteCompleteness(
				slots.map((s) => ({ ...s, assigned_to: s.assigned_to! })),
				shiftNotes,
				weeks,
				now,
				timeZone
			),
			signed: signedByWeek.map((s) => s.length),
			lomiRate: signedByWeek.map((s) => percent(s.filter((e) => e.lomiDrafted).length, s.length)),
			hoursToApprove: approvedByWeek.map((a) =>
				average(
					a
						.filter((e) => signedAt.has(e.noteId))
						.map((e) => (e.at.getTime() - signedAt.get(e.noteId)!.getTime()) / 3_600_000)
				)
			),
			sentBack: countByWeek(
				events.filter((e) => e.action === 'returned'),
				weeks,
				(e) => weekOf(e.at, timeZone)
			)
		},
		care: {
			medCompliance: weeklyDoseCompliance(meds, doses, weeks, now, timeZone),
			dosesGiven: countByWeek(
				doses.filter((d) => d.status === 'given'),
				weeks,
				(d) => weekOf(d.day, timeZone)
			),
			refusedOrHeld: countByWeek(
				doses.filter((d) => d.status !== 'given'),
				weeks,
				(d) => weekOf(d.day, timeZone)
			),
			incidents: countByWeek(
				incidentRows.filter((i) => i.occurredAt),
				weeks,
				(i) => weekOf(i.occurredAt!, timeZone)
			)
		},
		goalProgress: [...goals.entries()]
			.map(([goalId, g]) => ({
				goalId,
				person: g.person,
				text: g.text,
				trials: g.trials,
				independentRate: percent(g.independent, g.trials)
			}))
			.filter((g) => g.trials > 0)
			.sort((a, b) => a.person.localeCompare(b.person) || a.text.localeCompare(b.text))
	};
}
