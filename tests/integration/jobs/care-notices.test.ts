// Care-record notifications (notifications.md §2.4–2.7, 2.12, 2.13): signing,
// approving and sending back notes, refused doses, shift reminders and
// incidents left open. Titles carry no client name or clinical detail.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { setProvidersForTests } = await import('../../../src/lib/server/messaging');
const { render } = await import('../../../src/lib/server/messaging/templates');
const { remindShifts, flagIncidents, flagOverdueContacts } =
	await import('../../../src/lib/server/services/notification/care-reminders');

const createCaller = mw.createCallerFactory(appRouter);
const agency = randomUUID(),
	oak = randomUUID();
const carer = randomUUID(),
	sup = randomUUID(),
	admin = randomUUID(),
	otherSup = randomUUID();
const person = randomUUID(),
	med = randomUUID();
const uid = (id: string) => `care-notices-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
	const ok = vi.fn(async () => ({ providerMessageId: 'test' }));
	setProvidersForTests({ sms: ok, push: ok, email: ok });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Care Notices Test',
			subscription_tier: 'complete',
			slug: `carenotice-${agency}`,
			timezone: 'UTC'
		});
		await tx
			.insert(s.homes)
			.values([{ id: oak, agency_id: agency, name: 'Oak House', lat: 40, lng: -75, radius: 150 }]);
		await tx.insert(s.profiles).values(
			(
				[
					[carer, 'caregiver', [oak]],
					[sup, 'supervisor', [oak]],
					[otherSup, 'supervisor', []],
					[admin, 'admin', []]
				] as const
			).map(([id, role, homes]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: role === 'caregiver' ? 'Cara Synthetic' : 'Synthetic Staff',
				role,
				home_ids: [...homes],
				med_certified: true
			}))
		);
		await tx
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: oak, name: 'Private Person' });
		await tx.insert(s.medications).values({
			id: med,
			agency_id: agency,
			client_id: person,
			home_id: oak,
			name: 'Private medication',
			scheduled_times: ['08:00', '20:00']
		});
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

const inbox = (type: string) =>
	withService((tx) =>
		tx
			.select({
				profileId: s.notifications.profile_id,
				title: s.notifications.title,
				priority: s.notifications.priority,
				referenceId: s.notifications.reference_id
			})
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.type, type),
					eq(s.notifications.channel, 'in_app')
				)
			)
	);

it('tells the home’s supervisors when a note is signed, and the author when it is reviewed', async () => {
	const caregiver = await as(carer);
	const supervisor = await as(sup);
	const id = randomUUID();
	await caregiver.note.create({
		id,
		clientId: person,
		type: 'shift',
		content: { activities: 'x' }
	});
	expect(await inbox('note_submitted')).toEqual([]);
	await caregiver.note.sign({ id });
	const submitted = await inbox('note_submitted');
	expect(submitted.map((r) => r.profileId)).toEqual([sup]);
	expect(submitted[0].title).toMatch(
		/^Cara Synthetic submitted a shift note for review \(Oak House, [A-Z][a-z]{2} \d{1,2}\)\.$/
	);
	expect(submitted[0]).toMatchObject({ priority: 3, referenceId: id });

	await supervisor.note.sendBack({ id, comment: 'Please add what happened at lunch.' });
	const back = await inbox('note_sent_back');
	expect(back.map((r) => r.profileId)).toEqual([carer]);
	expect(back[0].title).not.toContain('lunch');

	await caregiver.note.sign({ id });
	expect((await inbox('note_submitted')).length).toBe(2);
	await supervisor.note.approve({ id });
	const approved = await inbox('note_approved');
	expect(approved.map((r) => r.profileId)).toEqual([carer]);
	expect(approved[0]).toMatchObject({ priority: 4, referenceId: id });
	expect(approved[0].title).toMatch(/has been approved\.$/);
});

it('a note created already signed offline (sync.upload) notifies once', async () => {
	const id = randomUUID();
	const result = await (
		await as(carer)
	).sync.upload({
		transactionId: 1,
		ops: [
			{
				op: 'PUT',
				table: 'notes',
				id,
				data: {
					client_id: person,
					day: today,
					shift: 'am',
					type: 'behavior',
					status: 'submitted',
					content: { before: 'x' }
				}
			}
		]
	});
	expect(result.applied).toEqual([id]);
	const rows = (await inbox('note_submitted')).filter((r) => r.referenceId === id);
	expect(rows).toHaveLength(1);
	expect(rows[0].title).toContain('submitted a behavior note');
});

it('alerts supervisors to a refused or held dose without naming the person or medication', async () => {
	const caregiver = await as(carer);
	await caregiver.mar.record({
		id: randomUUID(),
		clientId: person,
		medicationId: med,
		day: today,
		scheduledTime: '08:00',
		status: 'given'
	});
	expect(await inbox('med_refusal')).toEqual([]);
	const refused = randomUUID();
	await caregiver.mar.record({
		id: refused,
		clientId: person,
		medicationId: med,
		day: today,
		scheduledTime: '20:00',
		status: 'refused',
		reason: 'Said no'
	});
	const rows = await inbox('med_refusal');
	expect(rows.map((r) => r.profileId)).toEqual([sup]);
	expect(rows[0]).toMatchObject({
		title: 'Medication refused recorded at Oak House. Open to review.',
		priority: 2,
		referenceId: refused
	});
	expect(rows[0].title).not.toMatch(/Private/);
});

it('reminds the assigned caregiver about an hour before the shift, once', async () => {
	const slot = randomUUID();
	await withService((tx) =>
		tx.insert(s.scheduleSlots).values({
			id: slot,
			agency_id: agency,
			home_id: oak,
			day: '2026-03-10',
			shift: 'pm',
			assigned_to: carer,
			status: 'filled'
		})
	);
	const sweep = (iso: string) =>
		withService((tx) => remindShifts(tx, agency, 'UTC', new Date(iso)));
	expect(await sweep('2026-03-10T13:30:00Z')).toBe(0);
	expect(await sweep('2026-03-10T14:05:00Z')).toBe(1);
	expect(await sweep('2026-03-10T14:20:00Z')).toBe(0);
	const rows = await inbox('shift_reminder');
	expect(rows).toEqual([
		{
			profileId: carer,
			title: 'Reminder: your evening shift at Oak House starts at 15:00.',
			priority: 3,
			referenceId: slot
		}
	]);
});

it('flags an incident still open after 24 hours to the home’s supervisors and the admins, once', async () => {
	const fresh = randomUUID(),
		stale = randomUUID(),
		reviewed = randomUUID();
	const now = new Date('2026-03-12T12:00:00Z');
	const incident = (id: string, hoursAgo: number, status: 'open' | 'reviewed' = 'open') => ({
		id,
		agency_id: agency,
		client_id: person,
		home_id: oak,
		type: 'Fall',
		severity: 'Low' as const,
		occurred_at: new Date(now.getTime() - hoursAgo * 3_600_000),
		created_at: new Date(now.getTime() - hoursAgo * 3_600_000),
		description: 'Synthetic',
		status
	});
	await withService((tx) =>
		tx
			.insert(s.incidents)
			.values([incident(fresh, 3), incident(stale, 30), incident(reviewed, 30, 'reviewed')])
	);
	const sweep = () => withService((tx) => flagIncidents(tx, agency, 'UTC', now));
	expect(await sweep()).toBe(1);
	expect(await sweep()).toBe(0);
	const rows = await inbox('incident_review_needed');
	expect(rows.map((r) => r.profileId).sort()).toEqual([sup, admin].sort());
	expect(rows[0]).toMatchObject({
		title: 'Incident at Oak House from Mar 11 still awaiting review.',
		referenceId: stale
	});
});

it('reminds supervisors once per contact not marked as told by the agency’s hours', async () => {
	const nurseLate = randomUUID(),
		familyLate = randomUUID(),
		reviewed = randomUUID(),
		closed = randomUUID();
	const now = new Date('2026-05-20T12:00:00Z');
	const incident = (
		id: string,
		hoursAgo: number,
		told: string[],
		status: 'open' | 'reviewed' | 'closed' = 'open'
	) => ({
		id,
		agency_id: agency,
		client_id: person,
		home_id: oak,
		type: 'Fall',
		severity: 'Low' as const,
		occurred_at: new Date(now.getTime() - hoursAgo * 3_600_000),
		created_at: new Date(now.getTime() - hoursAgo * 3_600_000),
		description: 'Synthetic',
		notified_parties: told,
		status
	});
	await withService((tx) =>
		tx
			.insert(s.incidents)
			.values([
				incident(nurseLate, 3, []),
				incident(familyLate, 30, ['Nurse']),
				incident(reviewed, 30, ['Nurse'], 'reviewed'),
				incident(closed, 30, [], 'closed')
			])
	);
	const sweep = () => withService((tx) => flagOverdueContacts(tx, agency, 'UTC', now));
	await sweep();
	const forIncident = async (id: string) =>
		(await inbox('incident_contact_overdue')).filter((r) => r.referenceId === id);
	expect((await forIncident(nurseLate)).map((r) => [r.profileId, r.title])).toEqual([
		[sup, 'Incident at Oak House from May 20: nurse not yet marked as told.']
	]);
	expect((await forIncident(familyLate)).map((r) => r.title)).toEqual([
		'Incident at Oak House from May 19: family or guardian not yet marked as told.'
	]);
	// Reviewing doesn't tell the family; only marking them told or closing stops it.
	expect(await forIncident(reviewed)).toHaveLength(1);
	expect(await forIncident(closed)).toEqual([]);
	// Once per incident and contact, even after the home is renamed.
	await withService((tx) =>
		tx.update(s.homes).set({ name: 'Renamed House' }).where(eq(s.homes.id, oak))
	);
	await sweep();
	await withService((tx) =>
		tx.update(s.homes).set({ name: 'Oak House' }).where(eq(s.homes.id, oak))
	);
	expect(await forIncident(nurseLate)).toHaveLength(1);
	expect(await forIncident(familyLate)).toHaveLength(1);
});

it('never puts the person, their medication, readings or incident details in any alert or message text', async () => {
	const caregiver = await as(carer);
	// Every care flow that alerts staff, each with details that must stay in the app.
	await caregiver.health.create({
		clientId: person,
		kind: 'vitals',
		data: { temp: 103.7, pulse: 131 }
	});
	await caregiver.incident.create({
		clientId: person,
		type: 'Fall',
		severity: 'High',
		occurredAt: new Date(Date.now() - 60_000),
		description: 'Private fall description'
	});
	const note = await caregiver.note.create({ clientId: person, type: 'shift', content: {} });
	await caregiver.note.sign({ id: note.id });
	await caregiver.mar.record({
		id: randomUUID(),
		clientId: person,
		medicationId: med,
		day: today,
		scheduledTime: '08:00',
		status: 'held',
		reason: 'Private hold reason'
	});

	const rows = await withService((tx) =>
		tx
			.select({
				id: s.notifications.id,
				type: s.notifications.type,
				title: s.notifications.title,
				body: s.notifications.body,
				referenceId: s.notifications.reference_id
			})
			.from(s.notifications)
			.where(eq(s.notifications.agency_id, agency))
	);
	const types = new Set(rows.map((r) => r.type));
	for (const t of ['health_alert', 'incident_high_severity', 'note_submitted', 'med_refusal'])
		expect(types).toContain(t);
	const secret = /Private|103\.7|131|fall description|hold reason/i;
	for (const row of rows) {
		expect(`${row.title} ${row.body ?? ''}`).not.toMatch(secret);
		// What leaves Guad: the push, text and email built from each alert.
		for (const channel of ['push', 'sms', 'email'] as const) {
			const out = render(channel, row);
			expect(`${out.title} ${out.body}`).not.toMatch(secret);
		}
	}
});
