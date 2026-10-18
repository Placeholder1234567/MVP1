import { addDays } from '#lib/domain/time.ts';
import { goalProgress } from '#lib/domain/goal-progress.ts';

interface Note {
	id: string;
	agency_id: string | null;
	client_id: string | null;
	home_id: string | null;
	day: string | null;
	status: string | null;
}
interface Trial {
	id: string;
	agency_id: string | null;
	home_id: string | null;
	note_id: string | null;
	goal_id: string | null;
	trials: string | null;
	not_attempted: number | null;
}

export function savedGoalTrend(input: {
	agencyId: string;
	homeId: string;
	clientId: string;
	goalId: string;
	through: string;
	notes: readonly Note[];
	trials: readonly Trial[];
}) {
	const from = addDays(input.through, -13);
	const notes = new Map(
		input.notes
			.filter(
				(n) =>
					n.agency_id === input.agencyId &&
					n.client_id === input.clientId &&
					n.home_id === input.homeId &&
					n.day &&
					n.day >= from &&
					n.day <= input.through &&
					['submitted', 'approved'].includes(n.status ?? '')
			)
			.map((n) => [n.id, n])
	);
	const rows: Record<string, unknown>[] = [];
	let unreadableRecords = 0;
	for (const record of input.trials) {
		if (
			record.agency_id !== input.agencyId ||
			record.home_id !== input.homeId ||
			record.goal_id !== input.goalId ||
			!record.note_id
		)
			continue;
		const note = notes.get(record.note_id);
		if (!note) continue;
		try {
			const trials: unknown = JSON.parse(record.trials ?? '[]');
			if (!Array.isArray(trials)) throw new Error('Invalid trials');
			rows.push({
				goalId: input.goalId,
				clientId: input.clientId,
				day: note.day,
				trials,
				notAttempted: record.not_attempted === 1
			});
		} catch {
			unreadableRecords++;
		}
	}
	const summary = (source: Record<string, unknown>[]) => goalProgress(source)[0] ?? null;
	return {
		from,
		through: input.through,
		summary: summary(rows),
		unreadableRecords,
		days: Array.from({ length: 14 }, (_, index) => {
			const day = addDays(from, index);
			return { day, summary: summary(rows.filter((row) => row.day === day)) };
		})
	};
}
