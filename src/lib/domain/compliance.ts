// Compliance score on the supervisor overview (frontend-spec-3.md §4.1,
// "Compliance Score Formula"): the average of three shares over the last
// seven days, from data on the device. A part with nothing to measure yet is
// left out of the average rather than counted as 0 or 100.
import { INCIDENT_REVIEW_AFTER_HOURS } from './care-notices';
import { shiftIsPast, type ShiftKey } from './shifts';

export interface Part {
	done: number;
	of: number;
}

export interface ComplianceScore {
	/** Whole percent, or null when no part has anything to measure */
	score: number | null;
	notes: Part;
	meds: Part;
	incidents: Part;
}

export function complianceScore(notes: Part, meds: Part, incidents: Part): ComplianceScore {
	const shares = [notes, meds, incidents].filter((p) => p.of > 0).map((p) => p.done / p.of);
	return {
		score: shares.length
			? Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100)
			: null,
		notes,
		meds,
		incidents
	};
}

/**
 * Shifts worked (an assigned slot whose shift has ended) on `days` at a home,
 * and how many have a signed note from the person on shift for that shift.
 */
export function shiftNotesPart(
	slots: readonly {
		home_id: string | null;
		day: string | null;
		shift: string | null;
		assigned_to: string | null;
	}[],
	notes: readonly {
		home_id: string | null;
		day: string | null;
		shift: string | null;
		author_id: string | null;
		status: string | null;
	}[],
	homeId: string,
	days: readonly string[],
	at: Date,
	timeZone: string
): Part {
	const signed = new Set(
		notes
			.filter((n) => n.home_id === homeId && n.status && n.status !== 'draft')
			.map((n) => `${n.day}|${n.shift}|${n.author_id}`)
	);
	const worked = slots.filter(
		(s) =>
			s.home_id === homeId &&
			!!s.assigned_to &&
			!!s.day &&
			days.includes(s.day) &&
			(s.shift === 'am' || s.shift === 'pm' || s.shift === 'on') &&
			shiftIsPast(s.day, s.shift as ShiftKey, at, timeZone)
	);
	return {
		done: worked.filter((s) => signed.has(`${s.day}|${s.shift}|${s.assigned_to}`)).length,
		of: worked.length
	};
}

/**
 * Incidents reported since `since`, and how many were reviewed within the
 * review deadline (INCIDENT_REVIEW_AFTER_HOURS after they were reported).
 * Open incidents still inside the deadline are not counted yet. A reviewed
 * incident's last change is taken as its review time.
 */
export function incidentReviewPart(
	incidents: readonly {
		created_at: string | null;
		updated_at: string | null;
		status: string | null;
	}[],
	since: Date,
	at: Date
): Part {
	const limit = INCIDENT_REVIEW_AFTER_HOURS * 3_600_000;
	let done = 0;
	let of = 0;
	for (const i of incidents) {
		const reported = i.created_at ? Date.parse(i.created_at) : NaN;
		if (!Number.isFinite(reported) || reported < since.getTime()) continue;
		const due = reported + limit;
		if (i.status === 'open') {
			if (at.getTime() >= due) of++;
			continue;
		}
		of++;
		const reviewed = i.updated_at ? Date.parse(i.updated_at) : NaN;
		if (Number.isFinite(reviewed) && reviewed <= due) done++;
	}
	return { done, of };
}
