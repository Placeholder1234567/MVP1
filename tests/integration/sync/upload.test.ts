// sync.upload: writes queued on a device, applied through the services
// (offline-sync.md §3, §5, Appendix B). Real router, real users, local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { localTime } = await import('../../../src/lib/domain');

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
