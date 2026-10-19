// Lomi daily summary (trpc-router.md `lomi.summarize`, ai-pipeline.md "Task:
// summary"). Gathers one home's day into a DaySnapshot and has Lomi brief the
// supervisor in 2-4 sentences, most important first. Agencies with
// analytics_advanced also get highlights and recommendations (entitlements.md
// #12). Without the model the rules in domain/day-summary.ts write the
// briefing, and the snapshot is returned either way so the UI can show the data.
import { z } from 'zod';
import {
	addDays,
	dosesDue,
	fallbackSummary,
	hhmm,
	localInstant,
	nextSteps,
	localTime,
	plainBriefing,
	type DaySnapshot,
	type DaySummary
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { lomiCapabilities, modelJson, reserve } from './index';
import { dayRecords, homeName, homePeople } from './summary.queries';

export const SummarizeInput = z.object({
	homeId: z.uuid(),
	day: z.iso.date().optional()
});

const ModelSummary = z.object({
	summary: z.string().trim().min(1).max(2000),
	highlights: z
		.array(z.object({ text: z.string().trim().min(1).max(300) }))
		.max(5)
		.default([])
});

export async function daySnapshot(
	tx: Tx,
	user: CurrentUser,
	homeId: string,
	day: string,
	now = new Date()
): Promise<DaySnapshot> {
	const home = await homeName(tx, user.agencyId, homeId);
	if (!home || (user.role !== 'admin' && !user.homeIds.includes(homeId)))
		throw new ServiceError('NOT_FOUND', 'That home is not one of yours');
	const start = localInstant(day, '00:00', user.timeZone);
	const end = localInstant(addDays(day, 1), '00:00', user.timeZone);
	const people = await homePeople(tx, user.agencyId, homeId);
	const r = await dayRecords(tx, user.agencyId, homeId, day, start, end);
	const first = new Map(people.map((p) => [p.id, p.firstName || p.name.split(/\s+/)[0]]));
	const who = (id: string) => first.get(id) ?? 'Someone';

	// Doses whose time has passed (all of them, for a past day) with no record.
	const local = localTime(now, user.timeZone);
	const until =
		day < local.day ? '24:00' : day === local.day ? hhmm(`${local.hour}:${local.minute}`) : '';
	const due = dosesDue(
		r.meds.filter((m) => !m.started_at || m.started_at < end),
		r.doses,
		day,
		end < now ? end : now
	).filter((d) => d.time <= until);

	const written = new Set(r.dayNotes.filter((n) => n.status !== 'draft').map((n) => n.clientId));
	return {
		day,
		home,
		openShifts: r.slots.filter((s) => s.status !== 'filled').map((s) => s.shift),
		coverage: r.coverage.map((c) => ({ shift: c.shift, status: c.status })),
		notes: r.dayNotes.map((n) => ({ person: who(n.clientId), type: n.type, status: n.status })),
		missingNotes: people
			.filter((p) => !written.has(p.id))
			.map((p) => who(p.id))
			.sort(),
		notesToReview: r.toReview.length,
		incidents: r.openIncidents.map((i) => ({
			person: who(i.clientId),
			type: i.type,
			severity: i.severity
		})),
		meds: r.doses
			.filter((d) => d.status !== 'given' && !d.amends_id)
			.map((d) => ({ person: who(d.clientId), status: d.status })),
		dosesNotRecorded: due.length,
		healthAlerts: r.health
			.filter((h) => h.flags?.length)
			.map((h) => ({ person: who(h.clientId), alert: h.flags![0] })),
		clockExceptions: r.clock.length
	};
}

export async function summarizeDay(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof SummarizeInput>,
	now = new Date()
): Promise<DaySummary & { snapshot: DaySnapshot }> {
	const { homeId, day: asked } = SummarizeInput.parse(input);
	const today = localTime(now, user.timeZone).day;
	const day = asked ?? today;
	if (day > today) throw new ServiceError('VALIDATION_FAILED', 'Choose today or an earlier day');
	const snapshot = await daySnapshot(tx, user, homeId, day, now);
	const enhanced = user.features.includes('analytics_advanced');
	// Suggested next steps come from fixed rules (domain/day-summary.ts), with
	// or without the model, so they stay operational and never clinical.
	const recommendations = enhanced ? nextSteps(snapshot) : [];
	const fallback: DaySummary = {
		summary: fallbackSummary(snapshot),
		highlights: [],
		recommendations,
		fallback: true
	};
	if (!lomiCapabilities().draft) return { ...fallback, snapshot };
	await reserve(user, 'summary');
	try {
		const value = ModelSummary.parse(
			await modelJson(
				{
					task:
						'Brief a group home supervisor walking in, in plain English: 2 to 4 short sentences, most important first (incidents, health alerts, refused or held medications, open shifts, missing notes, notes to review). Use only the data. No headings, bullet symbols or markdown. ' +
						'State facts only: no clinical advice, diagnoses, or medication or treatment suggestions. ' +
						(enhanced
							? 'Also return up to 3 highlights (notable facts from the data), each {text}. '
							: 'Return empty highlights. ') +
						'Return {summary:string, highlights:[{text}]}.',
					data: snapshot
				},
				true
			)
		);
		return {
			summary: plainBriefing(value.summary),
			highlights: enhanced ? value.highlights : [],
			recommendations,
			fallback: false,
			snapshot
		};
	} catch {
		return { ...fallback, snapshot };
	}
}
