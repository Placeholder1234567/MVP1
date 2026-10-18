// Care-record notifications (notifications.md §2.4–2.7): note signed, approved
// and sent back, and a medication refused or held. Called by the charting and
// medication services inside the caller's transaction, so online and offline
// (sync.upload) writes notify the same way. Wording is domain/care-notices.ts.
import {
	controlledCountersignTitle,
	controlledDiscrepancyTitle,
	medRefusalTitle,
	noteApprovedTitle,
	noteSentBackTitle,
	noteSubmittedTitle,
	type StaffRole
} from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { homeName, noteFacts } from './care-events.queries';
import { notify, notifyHomeSupervisors } from './index';

const HOME = 'your home';
// The server never reads the charting preset (tests/unit/config), so
// notifications use the default terms for every agency.
const noteTypeLabel = (type: string) => (type === 'behavior' ? 'Behavior note' : 'Shift note');

/** A note became submitted: its home's supervisors review it. */
export async function noteSubmitted(tx: Tx, agencyId: string, noteId: string) {
	const note = await asService(tx, (t) => noteFacts(t, agencyId, noteId));
	if (!note) return;
	const type = noteTypeLabel(note.type);
	await notifyHomeSupervisors(tx, agencyId, note.homeId, {
		type: 'note_submitted',
		priority: 3,
		title: noteSubmittedTitle(
			note.authorName ?? 'A caregiver',
			type,
			note.homeName ?? HOME,
			note.day
		),
		referenceId: noteId,
		referenceType: 'notes'
	});
}

/** A supervisor approved or sent back a note: tell its author. */
export async function noteReviewed(
	tx: Tx,
	agencyId: string,
	noteId: string,
	outcome: 'approved' | 'returned'
) {
	const note = await asService(tx, (t) => noteFacts(t, agencyId, noteId));
	if (!note?.authorId || !note.authorRole || !note.authorActive) return;
	const type = noteTypeLabel(note.type);
	await notify(tx, agencyId, [{ id: note.authorId, role: note.authorRole }], {
		...(outcome === 'approved'
			? {
					type: 'note_approved',
					priority: 4 as const,
					title: noteApprovedTitle(type, note.homeName ?? HOME, note.day)
				}
			: {
					type: 'note_sent_back',
					priority: 3 as const,
					// The supervisor's comment stays in the app (notifications.md §2.6).
					title: noteSentBackTitle(type, note.day)
				}),
		referenceId: noteId,
		referenceType: 'notes'
	});
}

/** A dose was recorded as refused or held: the home's supervisors review it. */
export async function medRefused(
	tx: Tx,
	agencyId: string,
	homeId: string | null,
	status: 'refused' | 'held',
	marRecordId: string
) {
	const home = await asService(tx, (t) => homeName(t, agencyId, homeId));
	await notifyHomeSupervisors(tx, agencyId, homeId, {
		type: 'med_refusal',
		priority: 2,
		title: medRefusalTitle(status, home ?? HOME),
		referenceId: marRecordId,
		referenceType: 'mar_records'
	});
}

/** A controlled medication count didn't match the record (notifications.md §2.7b). */
export async function controlledCountDiscrepancy(
	tx: Tx,
	agencyId: string,
	homeId: string,
	entryId: string
) {
	const home = await asService(tx, (t) => homeName(t, agencyId, homeId));
	await notifyHomeSupervisors(tx, agencyId, homeId, {
		type: 'controlled_count_discrepancy',
		priority: 1,
		title: controlledDiscrepancyTitle(home ?? HOME),
		referenceId: entryId,
		referenceType: 'controlled_counts'
	});
}

/** A named witness is asked to countersign a count book entry (notifications.md §2.7c). */
export async function controlledCountersignRequest(
	tx: Tx,
	agencyId: string,
	witness: { id: string; role: StaffRole },
	recorderName: string,
	homeId: string,
	entryId: string
) {
	const home = await asService(tx, (t) => homeName(t, agencyId, homeId));
	await notify(tx, agencyId, [witness], {
		type: 'controlled_countersign',
		priority: 2,
		title: controlledCountersignTitle(recorderName, home ?? HOME),
		referenceId: entryId,
		referenceType: 'controlled_counts'
	});
}
