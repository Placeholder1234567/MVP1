// sync.upload: writes queued on a device, applied through the services
// (offline-sync.md §3, §5, Appendix B). Real router, real users, local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { localTime } = await import('../../../src/lib/domain');

const { setStorageForTests } = await import('../../../src/lib/server/storage');
const createCaller = createCallerFactory(appRouter);
const TODAY = localTime(new Date(), 'America/New_York').day;

const AGENCY = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const OAK_PERSON = randomUUID();
const MAPLE_PERSON = randomUUID();
const TWICE_DAILY = randomUUID();
const PRN = randomUUID();
const CARA = randomUUID();
const DEV = randomUUID();
const UNCERTIFIED = randomUUID();
const SAM = randomUUID();
const uid = (id: string) => `upload-${id}`;

async function as(profileId: string) {
	const user = await getCurrentUser(uid(profileId));
	return createCaller({ user, request: { ip: '203.0.113.5', user_agent: 'vitest' } });
}

let tx = 1;
async function upload(
	profileId: string,
	ops: Array<{
		op: 'PUT' | 'PATCH' | 'DELETE';
		table: string;
		id: string;
		data?: Record<string, unknown>;
	}>
) {
	return (await as(profileId)).sync.upload({ transactionId: tx++, ops });
}

const note = (data: Record<string, unknown> = {}) => ({
	client_id: OAK_PERSON,
	day: TODAY,
	shift: 'am',
	type: 'shift',
	content: JSON.stringify({ activities: 'Went for a walk' }),
	lomi_drafted: 0,
	status: 'draft',
	...data
});

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values({
			id: AGENCY,
			name: 'Upload Test Agency',
			subscription_tier: 'complete',
			slug: `upload-${AGENCY}`
		});
		await t.insert(s.homes).values([
			{ id: OAK, agency_id: AGENCY, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: AGENCY, name: 'Maple', lat: 41, lng: -75, radius: 150 }
		]);
		const staff = (
			id: string,
			name: string,
			role: 'caregiver' | 'supervisor',
			homes: string[],
			med: boolean
		) => ({
			id,
			agency_id: AGENCY,
			auth_uid: uid(id),
			email: `${uid(id)}@example.test`,
			name,
			role,
			home_ids: homes,
			med_certified: med
		});
		await t
			.insert(s.profiles)
			.values([
				staff(CARA, 'Cara Giver', 'caregiver', [OAK], true),
				staff(DEV, 'Dev Okafor', 'caregiver', [OAK], true),
				staff(UNCERTIFIED, 'Una Certified', 'caregiver', [OAK], false),
				staff(SAM, 'Sam Supervisor', 'supervisor', [OAK, MAPLE], true)
			]);
		await t.insert(s.clients).values([
			{ id: OAK_PERSON, agency_id: AGENCY, home_id: OAK, name: 'Person Oak' },
			{ id: MAPLE_PERSON, agency_id: AGENCY, home_id: MAPLE, name: 'Person Maple' }
		]);
		await t.insert(s.medications).values([
			{
				id: TWICE_DAILY,
				agency_id: AGENCY,
				client_id: OAK_PERSON,
				name: 'Med A',
				scheduled_times: ['08:00', '20:00']
			},
			{ id: PRN, agency_id: AGENCY, client_id: OAK_PERSON, name: 'Med PRN' }
		]);
	});
});

afterAll(closeDb);

describe('sync.upload: notes', () => {
	it('creates a draft authored by the caller, ignoring identity fields sent by the device', async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id, data: note({ author_id: SAM, agency_id: randomUUID() }) }
		]);
		expect(r).toEqual({ applied: [id], rejected: [], notices: [] });
		const [row] = await withService((t) => t.select().from(s.notes).where(eq(s.notes.id, id)));
		expect(row).toMatchObject({
			author_id: CARA,
			author_name: 'Cara Giver',
			agency_id: AGENCY,
			home_id: OAK,
			status: 'draft'
		});
		expect(row.content).toEqual({ activities: 'Went for a walk' });
	});

	it('is idempotent: a retried upload of the same note does not duplicate it', async () => {
		const id = randomUUID();
		await upload(CARA, [{ op: 'PUT', table: 'notes', id, data: note() }]);
		const again = await upload(CARA, [{ op: 'PUT', table: 'notes', id, data: note() }]);
		expect(again.applied).toEqual([id]);
		const rows = await withService((t) => t.select().from(s.notes).where(eq(s.notes.id, id)));
		expect(rows).toHaveLength(1);
	});

	it('edits and signs, then refuses edits to the signed note', async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id, data: note() },
			{
				op: 'PATCH',
				table: 'notes',
				id,
				data: { content: JSON.stringify({ activities: 'Walk and lunch' }) }
			},
			{ op: 'PATCH', table: 'notes', id, data: { status: 'submitted' } },
			{
				op: 'PATCH',
				table: 'notes',
				id,
				data: { content: JSON.stringify({ activities: 'Changed after signing' }) }
			}
		]);
		expect(r.applied).toEqual([id, id, id]);
		expect(r.rejected).toEqual([
			{ id, table: 'notes', code: 'RULE_VIOLATION', message: 'This note was already signed' }
		]);
		const [row] = await withService((t) => t.select().from(s.notes).where(eq(s.notes.id, id)));
		expect(row.status).toBe('submitted');
		expect(row.content).toEqual({ activities: 'Walk and lunch' });
	});

	it('goal trials keep the device row ID, and edits to them (PATCH) are applied by the note rules', async () => {
		const goal = randomUUID();
		await withService((t) =>
			t.insert(s.goals).values({
				id: goal,
				agency_id: AGENCY,
				client_id: OAK_PERSON,
				home_id: OAK,
				area: 'Daily living',
				text: 'Synthetic goal'
			})
		);
		const noteId = randomUUID();
		const row = randomUUID();
		const first = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id: noteId, data: note() },
			{
				op: 'PUT',
				table: 'note_goals',
				id: row,
				data: {
					note_id: noteId,
					goal_id: goal,
					trials: JSON.stringify(['Independent']),
					not_attempted: 0
				}
			}
		]);
		expect(first.rejected).toEqual([]);
		// A later edit on the device carries only the changed columns.
		const edit = await upload(CARA, [
			{
				op: 'PATCH',
				table: 'note_goals',
				id: row,
				data: { trials: JSON.stringify(['Independent', 'Refused']), updated_at: 'x' }
			},
			{ op: 'PATCH', table: 'notes', id: noteId, data: { status: 'submitted' } }
		]);
		expect(edit.rejected).toEqual([]);
		const rows = await withService((t) =>
			t.select().from(s.noteGoals).where(eq(s.noteGoals.note_id, noteId))
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: row, trials: ['Independent', 'Refused'] });
		expect(rows[0].not_attempted).toBe(false);
		// After signing the same edit is refused; someone else can't see the row at all.
		const late = await upload(CARA, [
			{ op: 'PATCH', table: 'note_goals', id: row, data: { trials: '[]' } }
		]);
		expect(late.rejected.map((r) => r.code)).toEqual(['RULE_VIOLATION']);
		const other = await upload(DEV, [
			{ op: 'PATCH', table: 'note_goals', id: row, data: { trials: '[]' } }
		]);
		expect(other.rejected.map((r) => r.code)).toEqual(['NOT_FOUND']);
		const unknown = await upload(CARA, [
			{ op: 'PATCH', table: 'note_goals', id: randomUUID(), data: { trials: '[]' } }
		]);
		expect(unknown.rejected.map((r) => r.code)).toEqual(['NOT_FOUND']);
	});

	it('a queued sign is refused if the supervisor sent the note back in the meantime', async () => {
		const id = randomUUID();
		await upload(CARA, [{ op: 'PUT', table: 'notes', id, data: note({ status: 'submitted' }) }]);
		await withService((t) =>
			t
				.update(s.notes)
				.set({ status: 'returned', supervisor_comment: 'Add lunch' })
				.where(eq(s.notes.id, id))
		);
		const r = await upload(CARA, [
			{ op: 'PATCH', table: 'notes', id, data: { status: 'submitted' } }
		]);
		expect(r.rejected[0]).toMatchObject({
			code: 'RULE_VIOLATION',
			message: expect.stringMatching(/sent this note back/)
		});
	});

	it("can't write notes about people outside the caller's homes, or edit someone else's note", async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id, data: note({ client_id: MAPLE_PERSON }) }
		]);
		expect(r.rejected[0]).toMatchObject({ code: 'NOT_FOUND' });

		const devNote = randomUUID();
		await upload(DEV, [{ op: 'PUT', table: 'notes', id: devNote, data: note() }]);
		const r2 = await upload(CARA, [
			{ op: 'PATCH', table: 'notes', id: devNote, data: { content: '{}' } }
		]);
		expect(r2.rejected[0]).toMatchObject({ code: 'RLS_DENIED' });
	});

	it('rejects malformed data without failing the rest of the upload', async () => {
		const bad = randomUUID();
		const good = randomUUID();
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id: bad, data: note({ shift: 'midnight' }) },
			{ op: 'PUT', table: 'notes', id: good, data: note() }
		]);
		expect(r.rejected).toEqual([expect.objectContaining({ id: bad, code: 'VALIDATION_FAILED' })]);
		expect(r.applied).toEqual([good]);
	});
});

describe('sync.upload: MAR', () => {
	const dose = (data: Record<string, unknown> = {}) => ({
		client_id: OAK_PERSON,
		medication_id: TWICE_DAILY,
		day: TODAY,
		scheduled_time: '08:00',
		status: 'given',
		...data
	});

	it('records a scheduled dose with the recorder taken from the session', async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'mar_records', id, data: dose({ recorded_by: SAM }) }
		]);
		expect(r.applied).toEqual([id]);
		const [row] = await withService((t) =>
			t.select().from(s.marRecords).where(eq(s.marRecords.id, id))
		);
		expect(row).toMatchObject({
			recorded_by: CARA,
			recorded_by_name: 'Cara Giver',
			is_prn: false,
			home_id: OAK
		});
	});

	it('a reading from a phone whose clock runs fast is kept, stamped with the server time', async () => {
		const id = randomUUID();
		const ahead = new Date(Date.now() + 20 * 60_000).toISOString();
		const r = await upload(CARA, [
			{
				op: 'PUT',
				table: 'health_entries',
				id,
				data: {
					client_id: OAK_PERSON,
					kind: 'vitals',
					data: JSON.stringify({ pulse: 72 }),
					recorded_at: ahead
				}
			}
		]);
		expect(r.rejected).toEqual([]);
		const [row] = await withService((t) =>
			t.select().from(s.healthEntries).where(eq(s.healthEntries.id, id))
		);
		expect(row.recorded_at.getTime()).toBeLessThanOrEqual(Date.now());
	});

	it('keeps a second record for the same slot as a conflict and alerts the supervisor', async () => {
		const id = randomUUID();
		const r = await upload(DEV, [{ op: 'PUT', table: 'mar_records', id, data: dose() }]);
		expect(r.applied).toEqual([id]);
		expect(r.notices).toEqual([
			{
				id,
				table: 'mar_records',
				code: 'MAR_CONFLICT',
				message: 'Cara Giver also recorded this dose. Your supervisor has been alerted.'
			}
		]);
		const [row] = await withService((t) =>
			t.select().from(s.marRecords).where(eq(s.marRecords.id, id))
		);
		expect(row.conflict_with).not.toBeNull();
		const alerts = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(
					and(
						eq(s.notifications.reference_id, id),
						eq(s.notifications.profile_id, SAM),
						eq(s.notifications.channel, 'in_app')
					)
				)
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({ type: 'med_possible_double_dose', priority: 1 });
		expect(alerts[0].title).not.toMatch(/Person|Med A/); // no PHI in the alert
	});

	it('the evening slot is separate from the morning one', async () => {
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'mar_records', id: randomUUID(), data: dose({ scheduled_time: '20:00' }) }
		]);
		expect(r.notices).toEqual([]);
		expect(r.rejected).toEqual([]);
	});

	it('enforces the dose rules', async () => {
		const [wrongSlot, noReason, prnNoReason, uncertified] = [
			randomUUID(),
			randomUUID(),
			randomUUID(),
			randomUUID()
		];
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'mar_records', id: wrongSlot, data: dose({ scheduled_time: '12:00' }) },
			{
				op: 'PUT',
				table: 'mar_records',
				id: noReason,
				data: dose({ scheduled_time: '20:00', status: 'refused' })
			},
			{
				op: 'PUT',
				table: 'mar_records',
				id: prnNoReason,
				data: dose({ medication_id: PRN, scheduled_time: null })
			}
		]);
		expect(r.rejected.map((x) => x.code)).toEqual([
			'VALIDATION_FAILED',
			'VALIDATION_FAILED',
			'VALIDATION_FAILED'
		]);
		const r2 = await upload(UNCERTIFIED, [
			{ op: 'PUT', table: 'mar_records', id: uncertified, data: dose({ scheduled_time: '20:00' }) }
		]);
		expect(r2.rejected[0]).toMatchObject({
			code: 'RLS_DENIED',
			message: 'Only med-certified staff can record medications'
		});
	});

	it('records an as-needed dose with its reason', async () => {
		const r = await upload(CARA, [
			{
				op: 'PUT',
				table: 'mar_records',
				id: randomUUID(),
				data: dose({ medication_id: PRN, scheduled_time: null, reason: 'Headache' })
			}
		]);
		expect(r.rejected).toEqual([]);
	});

	it('MAR records can never be edited or deleted from a device', async () => {
		const id = randomUUID();
		await upload(CARA, [
			{
				op: 'PUT',
				table: 'mar_records',
				id,
				data: dose({
					day: TODAY,
					scheduled_time: '20:00',
					medication_id: TWICE_DAILY,
					client_id: OAK_PERSON,
					status: 'held',
					reason: 'Asleep'
				})
			}
		]);
		const r = await upload(CARA, [
			{ op: 'PATCH', table: 'mar_records', id, data: { status: 'given' } },
			{ op: 'DELETE', table: 'mar_records', id }
		]);
		expect(r.rejected.map((x) => x.code)).toEqual(['NOT_ALLOWED_OFFLINE', 'NOT_ALLOWED_OFFLINE']);
	});
});

describe('sync.upload: messages and everything else', () => {
	it('posts a message to the home board as the caller', async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{
				op: 'PUT',
				table: 'messages',
				id,
				data: { home_id: OAK, body: 'Back door is sticking', from_name: 'Someone else' }
			}
		]);
		expect(r.applied).toEqual([id]);
		const [row] = await withService((t) =>
			t.select().from(s.messages).where(eq(s.messages.id, id))
		);
		expect(row).toMatchObject({ from_name: 'Cara Giver', created_by: CARA, home_id: OAK });
	});

	it('a message can name a person from the same home only', async () => {
		const id = randomUUID();
		const r = await upload(CARA, [
			{
				op: 'PUT',
				table: 'messages',
				id,
				data: { home_id: OAK, client_id: OAK_PERSON, body: 'Ate well at lunch' }
			},
			{
				op: 'PUT',
				table: 'messages',
				id: randomUUID(),
				data: { home_id: OAK, client_id: MAPLE_PERSON, body: 'Wrong home' }
			}
		]);
		expect(r.applied).toEqual([id]);
		expect(r.rejected[0]).toMatchObject({ code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(r.rejected)).not.toMatch(/Person|Maple/);
		const [row] = await withService((t) =>
			t.select().from(s.messages).where(eq(s.messages.id, id))
		);
		expect(row.client_id).toBe(OAK_PERSON);
	});

	it('replies join the thread on the same board; incident follow-ups stay in the home', async () => {
		const root = randomUUID();
		const [oakIncident, mapleIncident] = [randomUUID(), randomUUID()];
		await withService((t) =>
			t.insert(s.incidents).values([
				{
					id: oakIncident,
					agency_id: AGENCY,
					client_id: OAK_PERSON,
					home_id: OAK,
					type: 'Fall',
					description: 'Synthetic fall'
				},
				{
					id: mapleIncident,
					agency_id: AGENCY,
					client_id: MAPLE_PERSON,
					home_id: MAPLE,
					type: 'Fall',
					description: 'Synthetic fall'
				}
			])
		);
		const maple = randomUUID();
		await upload(SAM, [
			{ op: 'PUT', table: 'messages', id: maple, data: { home_id: MAPLE, body: 'Maple only' } }
		]);
		const [reply, nested, wrongBoard, wrongIncident] = Array.from({ length: 4 }, () =>
			randomUUID()
		);
		const r = await upload(CARA, [
			{
				op: 'PUT',
				table: 'messages',
				id: root,
				data: { home_id: OAK, incident_id: oakIncident, body: 'Follow-up on the fall' }
			},
			{
				op: 'PUT',
				table: 'messages',
				id: reply,
				data: { home_id: OAK, reply_to: root, body: 'OK' }
			},
			// A reply to a reply joins the same thread.
			{
				op: 'PUT',
				table: 'messages',
				id: nested,
				data: { home_id: OAK, reply_to: reply, body: 'Yes' }
			},
			{
				op: 'PUT',
				table: 'messages',
				id: wrongBoard,
				data: { home_id: OAK, reply_to: maple, body: 'x' }
			},
			{
				op: 'PUT',
				table: 'messages',
				id: wrongIncident,
				data: { home_id: OAK, incident_id: mapleIncident, body: 'x' }
			}
		]);
		expect(r.applied).toEqual([root, reply, nested]);
		expect(r.rejected.map((x) => x.code)).toEqual(['VALIDATION_FAILED', 'VALIDATION_FAILED']);
		const rows = await withService((t) =>
			t
				.select()
				.from(s.messages)
				.where(inArray(s.messages.id, [root, reply, nested]))
		);
		const byId = new Map(rows.map((m) => [m.id, m]));
		expect(byId.get(root)?.incident_id).toBe(oakIncident);
		expect(byId.get(reply)?.reply_to).toBe(root);
		expect(byId.get(nested)?.reply_to).toBe(root);
	});

	it('photos: stored without metadata, attached by their uploader, read by board members only', async () => {
		const files = new Map<string, Buffer>();
		setStorageForTests(undefined, {
			put: async (path, body) => void files.set(path, body),
			get: async (path) => files.get(path) ?? null,
			remove: async (path) => void files.delete(path)
		});
		try {
			const seg = (marker: number, payload: number[]) => [
				0xff,
				marker,
				(payload.length + 2) >> 8,
				(payload.length + 2) & 0xff,
				...payload
			];
			const gps = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 47, 47]);
			const jpeg = Buffer.from([
				0xff,
				0xd8,
				...seg(0xe1, gps),
				...seg(0xdb, [1, 2, 3]),
				0xff,
				0xda,
				0,
				4,
				9,
				9,
				0xff,
				0xd9
			]);
			const cara = await as(CARA);
			const photo = randomUUID();
			await expect(
				cara.message.uploadPhoto({ id: photo, homeId: OAK, data: jpeg.toString('base64') })
			).resolves.toMatchObject({ id: photo });
			const stored = files.get(`photos/${AGENCY}/${photo}.jpg`)!;
			expect(stored.includes(Buffer.from('Exif'))).toBe(false);
			await expect(
				cara.message.uploadPhoto({ id: randomUUID(), homeId: MAPLE, data: jpeg.toString('base64') })
			).rejects.toMatchObject({ code: 'FORBIDDEN' });
			await expect(
				cara.message.uploadPhoto({
					id: randomUUID(),
					homeId: OAK,
					data: Buffer.from('not a photo').toString('base64')
				})
			).rejects.toMatchObject({ code: 'BAD_REQUEST' });

			const [mine, dev] = [randomUUID(), randomUUID()];
			const r1 = await upload(CARA, [
				{
					op: 'PUT',
					table: 'messages',
					id: mine,
					data: { home_id: OAK, photo_id: photo, body: 'Photo of the rash for the nurse' }
				}
			]);
			expect(r1.applied).toEqual([mine]);
			// Someone else can't attach Cara's photo.
			const r2 = await upload(DEV, [
				{
					op: 'PUT',
					table: 'messages',
					id: dev,
					data: { home_id: OAK, photo_id: photo, body: 'x' }
				}
			]);
			expect(r2.rejected[0]).toMatchObject({ code: 'VALIDATION_FAILED' });

			const seen = await (await as(SAM)).message.photo({ id: photo });
			expect(Buffer.from(seen.data, 'base64').equals(stored)).toBe(true);
			const views = await withService((t) =>
				t
					.select()
					.from(s.auditLog)
					.where(and(eq(s.auditLog.table_name, 'photo_views'), eq(s.auditLog.record_id, photo)))
			);
			expect(views).toEqual([expect.objectContaining({ performed_by: SAM })]);

			// A Maple photo is invisible to an Oak caregiver.
			const maple = randomUUID();
			await (
				await as(SAM)
			).message.uploadPhoto({
				id: maple,
				homeId: MAPLE,
				data: jpeg.toString('base64')
			});
			await expect(cara.message.photo({ id: maple })).rejects.toMatchObject({ code: 'NOT_FOUND' });

			// Reusing that unseen photo's ID can't overwrite it; a retry of your own is a no-op.
			const before = files.get(`photos/${AGENCY}/${maple}.jpg`);
			const other = Buffer.concat([jpeg.subarray(0, -2), Buffer.from([0xff, 0xd9])]);
			other[other.length - 3] = 7;
			await expect(
				cara.message.uploadPhoto({ id: maple, homeId: OAK, data: other.toString('base64') })
			).rejects.toMatchObject({ code: 'BAD_REQUEST' });
			expect(files.get(`photos/${AGENCY}/${maple}.jpg`)).toBe(before);
			await expect(
				cara.message.uploadPhoto({ id: photo, homeId: OAK, data: jpeg.toString('base64') })
			).resolves.toMatchObject({ id: photo });
		} finally {
			setStorageForTests(undefined);
		}
	});

	it("can't post to another home's board", async () => {
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'messages', id: randomUUID(), data: { home_id: MAPLE, body: 'Hi' } }
		]);
		expect(r.rejected[0]).toMatchObject({ code: 'RLS_DENIED' });
	});

	it('records read receipts once per reader, never for the author or across homes', async () => {
		const message = randomUUID();
		await upload(CARA, [
			{ op: 'PUT', table: 'messages', id: message, data: { home_id: OAK, body: 'Fridge is fixed' } }
		]);
		const maple = randomUUID();
		await upload(SAM, [
			{ op: 'PUT', table: 'messages', id: maple, data: { home_id: MAPLE, body: 'Maple only' } }
		]);
		const read = (messageId: string, data: Record<string, unknown> = {}) => ({
			op: 'PUT' as const,
			table: 'message_reads',
			id: randomUUID(),
			data: { message_id: messageId, read_at: new Date().toISOString(), ...data }
		});
		// Two devices for Dev, a forged reader, and the author's own receipt.
		const first = await upload(DEV, [read(message, { profile_id: SAM, reader_name: 'Not Dev' })]);
		expect(first.rejected).toEqual([]);
		expect((await upload(DEV, [read(message)])).rejected).toEqual([]);
		expect((await upload(CARA, [read(message)])).rejected).toEqual([]);
		const rows = await withService((t) =>
			t.select().from(s.messageReads).where(eq(s.messageReads.message_id, message))
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ profile_id: DEV, reader_name: 'Dev Okafor', home_id: OAK });
		// Another home's message is invisible, so there's nothing to mark.
		const other = await upload(DEV, [read(maple)]);
		expect(other.rejected[0]).toMatchObject({ code: 'NOT_FOUND' });
		// Receipts are permanent.
		const edits = await upload(DEV, [
			{ op: 'PATCH', table: 'message_reads', id: rows[0].id, data: { read_at: null } },
			{ op: 'DELETE', table: 'message_reads', id: rows[0].id }
		]);
		expect(edits.rejected.map((x) => x.code)).toEqual([
			'NOT_ALLOWED_OFFLINE',
			'NOT_ALLOWED_OFFLINE'
		]);
	});

	it('refuses tables and operations a device may not write', async () => {
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'audit_log', id: randomUUID(), data: {} },
			{ op: 'PUT', table: 'profiles', id: CARA, data: { role: 'admin' } },
			{ op: 'DELETE', table: 'notes', id: randomUUID() }
		]);
		expect(r.rejected.map((x) => x.code)).toEqual([
			'NOT_ALLOWED_OFFLINE',
			'NOT_ALLOWED_OFFLINE',
			'NOT_ALLOWED_OFFLINE'
		]);
	});

	it('rejection messages contain no client data', async () => {
		const r = await upload(CARA, [
			{ op: 'PUT', table: 'notes', id: randomUUID(), data: note({ client_id: MAPLE_PERSON }) }
		]);
		expect(JSON.stringify(r)).not.toMatch(/Person|Maple|Went for a walk/);
	});
});
