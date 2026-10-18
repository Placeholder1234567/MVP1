// sync.upload (trpc-router.md, offline-sync.md §3, §5, §6): the only path for
// writes queued on a device. Each op goes, in order, through the same service
// function its online procedure uses. Every op runs in its own savepoint, so a
// rejected op is undone without affecting the ones before it; ops that depend
// on a rejected one then fail on their own (e.g. a foreign key).
import { z, ZodError } from 'zod';
import type { FeatureFlag } from '../../../entitlements/tier-features.ts';
import type { Tx } from '../../db/index.ts';
import { pgCode, ServiceError } from '../../errors.ts';
import type { CurrentUser } from '../../services/auth/index.ts';
import { createNote, updateNote } from '../../services/charting/index.ts';
import { recordCountEntry, recordDose } from '../../services/medication/index.ts';
import { markRead, sendMessage } from '../../services/message/index.ts';
import { findAttendanceDay, saveAttendance } from '../../services/attendance/index.ts';
import { createHealthEntry } from '../../services/health/index.ts';
import { createIncident } from '../../services/incident/index.ts';
import { clockIn, clockOut } from '../../services/clock/index.ts';
import { router, userProcedure } from '../middleware.ts';

/** Codes in offline-sync.md Appendix B. */
export type RejectCode =
	| 'VALIDATION_FAILED'
	| 'RULE_VIOLATION'
	| 'NOT_FOUND'
	| 'RLS_DENIED'
	| 'CONSTRAINT_VIOLATION'
	| 'FK_VIOLATION'
	| 'NOT_ALLOWED_OFFLINE'
	| 'FEATURE_NOT_INCLUDED';

class Reject extends Error {
	constructor(
		public readonly code: RejectCode,
		message: string
	) {
		super(message);
	}
}

const Op = z.object({
	op: z.enum(['PUT', 'PATCH', 'DELETE']),
	table: z.string().max(64),
	id: z.uuid(),
	data: z.record(z.string(), z.unknown()).nullish()
});
type Op = z.infer<typeof Op>;

/** Device columns are SQLite: booleans arrive as 0/1, JSON as text. */
const flag = (v: unknown) => v === true || v === 1 || v === '1';
const str = (v: unknown) => (v == null ? undefined : String(v));
/** Arrays and objects arrive as JSON text from SQLite. */
const json = <T>(v: unknown, fallback: T): T =>
	v == null ? fallback : typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);

interface Outcome {
	notice?: { code: 'MAR_CONFLICT'; message: string };
}

type Handler = (tx: Tx, user: CurrentUser, op: Op) => Promise<Outcome | void>;

/**
 * Tables and operations a device may write. Anything else is refused with
 * NOT_ALLOWED_OFFLINE (e.g. approving notes, which needs connectivity).
 * Columns that decide identity (author, agency, home, recorded_by) are never
 * read from the device; the services set them from the session.
 */
const HANDLERS: Record<string, Partial<Record<Op['op'], Handler>>> = {
	clock_records: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await clockIn(tx, user, {
				id,
				homeId: str(d!.home_id)!,
				lat: d!.clock_in_lat == null ? undefined : Number(d!.clock_in_lat),
				lng: d!.clock_in_lng == null ? undefined : Number(d!.clock_in_lng),
				recordedAt: str(d!.clock_in_at)
			});
			if (d!.clock_out_at)
				await clockOut(tx, user, { id, recordedAt: new Date(String(d!.clock_out_at)) });
		},
		PATCH: async (tx, user, { id, data: d = {} }) => {
			if (!d!.clock_out_at)
				throw new Reject('NOT_ALLOWED_OFFLINE', 'Only clock-out can update a clock record');
			await clockOut(tx, user, { id, recordedAt: new Date(String(d!.clock_out_at)) });
		}
	},
	notes: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await createNote(tx, user.agencyId, user, {
				id,
				clientId: str(d!.client_id)!,
				day: str(d!.day)!,
				shift: str(d!.shift) as 'am',
				type: str(d!.type) as 'shift',
				content: d!.content ?? {},
				lomiDrafted: flag(d!.lomi_drafted),
				status: (str(d!.status) as 'draft' | undefined) ?? 'draft'
			});
		},
		PATCH: async (tx, user, { id, data: d = {} }) => {
			await updateNote(
				tx,
				user.agencyId,
				user,
				id,
				{
					content: d!.content,
					status: str(d!.status) as 'draft' | undefined,
					lomiDrafted: flag(d!.lomi_drafted) ? true : undefined
				},
				{ fromOfflineQueue: true }
			);
		}
	},
	mar_records: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			const r = await recordDose(tx, user.agencyId, user, {
				id,
				clientId: str(d!.client_id)!,
				medicationId: str(d!.medication_id)!,
				day: str(d!.day)!,
				scheduledTime: str(d!.scheduled_time) ?? null,
				status: str(d!.status) as 'given',
				reason: str(d!.reason) ?? null,
				effect: str(d!.effect) ?? null,
				recordedAt: str(d!.recorded_at) as unknown as Date | undefined,
				amendsId: str(d!.amends_id) ?? null
			});
			if (r.result === 'conflict') {
				return {
					notice: {
						code: 'MAR_CONFLICT',
						message: `${r.otherName ?? 'Someone else'} also recorded this dose. Your supervisor has been alerted.`
					}
				};
			}
		}
		// No PATCH or DELETE: MAR records are permanent. Corrections are a PUT with amends_id.
	},
	// Count book entries are permanent; the witness countersigns online.
	controlled_counts: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await recordCountEntry(tx, user.agencyId, user, {
				id,
				medicationId: str(d!.medication_id)!,
				kind: str(d!.kind) as 'count',
				quantity: Number(d!.quantity),
				reason: str(d!.reason) ?? null,
				witnessId: str(d!.witness_id) ?? null,
				recordedAt: str(d!.recorded_at) as unknown as Date | undefined
			});
		}
	},
	messages: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await sendMessage(tx, user.agencyId, user, {
				id,
				homeId: str(d!.home_id)!,
				clientId: str(d!.client_id) ?? null,
				replyTo: str(d!.reply_to) ?? null,
				incidentId: str(d!.incident_id) ?? null,
				photoId: str(d!.photo_id) ?? null,
				body: str(d!.body) ?? '',
				sentAt: str(d!.sent_at) as unknown as Date | undefined
			});
		}
	},
	// Read receipts are append-only: no PATCH or DELETE.
	message_reads: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await markRead(tx, user.agencyId, user, {
				id,
				messageId: str(d!.message_id)!,
				readAt: str(d!.read_at) as unknown as Date | undefined
			});
		}
	},
	// Goal trials are rows of their own on the device; on the server they are
	// part of the note, so they go through the note's update rules.
	note_goals: {
		PUT: (tx, user, { data: d = {} }) => saveNoteGoal(tx, user, d!),
		PATCH: async () => {
			throw new Reject('NOT_ALLOWED_OFFLINE', 'Re-save the goal with its note.');
		}
	},
	health_entries: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await createHealthEntry(tx, user.agencyId, user, {
				id,
				clientId: str(d!.client_id)!,
				kind: str(d!.kind) as 'vitals',
				data: json(d!.data, {}),
				recordedAt: str(d!.recorded_at) as unknown as Date | undefined
			});
		}
	},
	incidents: {
		PUT: async (tx, user, { id, data: d = {} }) => {
			await createIncident(tx, user.agencyId, user, {
				id,
				clientId: str(d!.client_id)!,
				type: str(d!.type) as 'Other',
				severity: (str(d!.severity) as 'Low' | undefined) ?? 'Low',
				occurredAt: str(d!.occurred_at) as unknown as Date,
				location: str(d!.location),
				description: str(d!.description) ?? '',
				antecedent: str(d!.antecedent),
				injured: str(d!.injured),
				injuryDetail: str(d!.injury_detail),
				staffAction: str(d!.staff_action),
				medicalFollowup: str(d!.medical_followup),
				witnesses: str(d!.witnesses),
				witnessList: json(d!.witness_list, []),
				notifiedParties: json(d!.notified_parties, []),
				reportDetails: json(d!.report_details, {})
			});
		}
	},
	attendance: {
		// Both PUT and PATCH merge services into the day's record (never replace).
		PUT: (tx, user, { id, data: d = {} }) => saveDay(tx, user, id, d!),
		PATCH: (tx, user, { id, data: d = {} }) => saveDay(tx, user, id, d!)
	}
};

async function saveNoteGoal(tx: Tx, user: CurrentUser, d: Record<string, unknown>) {
	await updateNote(
		tx,
		user.agencyId,
		user,
		str(d.note_id)!,
		{
			goals: [
				{
					goalId: str(d.goal_id)!,
					trials: json(d.trials, []),
					notAttempted: flag(d.not_attempted),
					reason: str(d.reason) ?? null
				}
			]
		},
		{ fromOfflineQueue: true }
	);
}

async function saveDay(tx: Tx, user: CurrentUser, id: string, d: Record<string, unknown>) {
	// An edit (PATCH) carries only the changed columns, usually just services.
	let clientId = str(d.client_id);
	let day = str(d.day);
	if (!clientId || !day) {
		const existing = await findAttendanceDay(tx, user.agencyId, id);
		if (!existing) throw new ServiceError('NOT_FOUND', 'Attendance record not found');
		clientId = existing.clientId;
		day = existing.day;
	}
	await saveAttendance(tx, user.agencyId, user, {
		id,
		clientId,
		day,
		services: json(d.services, [])
	});
}

/** The feature each writable table belongs to (entitlements.md §6). */
const TABLE_FEATURE: Record<string, FeatureFlag> = {
	clock_records: 'timekeeping',
	notes: 'charting',
	note_goals: 'charting',
	attendance: 'charting',
	mar_records: 'mar',
	controlled_counts: 'mar',
	health_entries: 'health',
	incidents: 'incidents',
	messages: 'messaging',
	message_reads: 'messaging'
};

/** Maps an error to a rejection, or rethrows it (unexpected: the client retries). */
function toReject(e: unknown): Reject {
	if (e instanceof Reject) return e;
	if (e instanceof ServiceError) {
		return new Reject(e.code === 'FORBIDDEN' ? 'RLS_DENIED' : e.code, e.message);
	}
	if (e instanceof ZodError || e instanceof SyntaxError) {
		return new Reject('VALIDATION_FAILED', 'Some of the information is missing or invalid');
	}
	switch (pgCode(e)) {
		case '42501': // RLS policy or an integrity trigger refused it
			return new Reject('RLS_DENIED', "You don't have permission to save this change.");
		case '23505':
			return new Reject('CONSTRAINT_VIOLATION', 'This record was already saved by another user.');
		case '23503':
			return new Reject('FK_VIOLATION', 'The referenced record no longer exists.');
		case '23514':
		case '22P02':
		case '22007':
		case '22008':
			return new Reject('VALIDATION_FAILED', 'Some of the information is missing or invalid');
	}
	throw e;
}

export const syncRouter = router({
	upload: userProcedure
		.input(z.object({ transactionId: z.number().int(), ops: z.array(Op).max(200) }))
		.mutation(async ({ ctx, input }) => {
			const applied: string[] = [];
			const rejected: { id: string; table: string; code: RejectCode; message: string }[] = [];
			const notices: { id: string; table: string; code: 'MAR_CONFLICT'; message: string }[] = [];

			for (const op of input.ops) {
				try {
					const handler = HANDLERS[op.table]?.[op.op];
					if (!handler) {
						throw new Reject('NOT_ALLOWED_OFFLINE', 'This change has to be made while online.');
					}
					// Each op needs its own feature (entitlements.md §6, sync.upload).
					const feature = TABLE_FEATURE[op.table];
					if (feature && !ctx.user.features.includes(feature)) {
						throw new Reject(
							'FEATURE_NOT_INCLUDED',
							'This feature is not included in your agency’s plan.'
						);
					}
					// Savepoint per op: a rejected op is rolled back on its own.
					const outcome = await ctx.db.transaction((sp) => handler(sp, ctx.user, op));
					applied.push(op.id);
					if (outcome?.notice) notices.push({ id: op.id, table: op.table, ...outcome.notice });
				} catch (e) {
					const r = toReject(e);
					rejected.push({ id: op.id, table: op.table, code: r.code, message: r.message });
				}
			}
			return { applied, rejected, notices };
		})
});
